import { OpenClawAgentClient } from '../openclaw/agent.js';
import { ClaudeAgentClient } from '../openclaw/claude-agent.js';
import type { AgentResponse } from '../openclaw/agent.js';
import { stateMachine } from './statemachine.js';
import * as queries from '../db/queries.js';
import type { PipelineStage, PipelineInstance, StageRun, PipelinePhase, Agent } from '@pipeline/shared';
import { DEFAULT_PIPELINE_STAGES, PHASES } from '@pipeline/shared';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface StageMeta {
  stageKey: string;
  label: string;
  phaseKey: string;
  batchIndex: number;
  agentId: string;
  action: string;
  agentSource?: string;
  agentModel?: string;
  agentSystemPrompt?: string;
  agentTools?: string[];
}

/**
 * Pipeline executor.
 * Orchestrates the execution of pipeline stages by dispatching work to agents.
 * Phases execute serially; within a phase, steps can be serial or parallel.
 */
export class PipelineExecutor {
  private openclawClient = new OpenClawAgentClient();
  private claudeClient = new ClaudeAgentClient();
  private running = new Map<number, boolean>();

  /**
   * Get the appropriate client based on agent source.
   */
  private getClientForAgent(agentId: string): { client: OpenClawAgentClient | ClaudeAgentClient; source: string } {
    // Look up the agent in the database to get its source
    const agent = queries.getAgentById(agentId);
    const source = agent?.source || 'openclaw';

    if (source === 'claude' || source === 'custom') {
      return { client: this.claudeClient, source };
    }

    return { client: this.openclawClient, source: 'openclaw' };
  }

  /**
   * Get agent config for Claude/custom agents.
   */
  private getAgentConfig(agentId: string): { model?: string; systemPrompt?: string; tools?: string[] } {
    const agent = queries.getAgentById(agentId);
    if (!agent) return {};

    return {
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      tools: agent.tools,
    };
  }

  /**
   * Start executing a pipeline instance.
   */
  async start(instanceId: number): Promise<void> {
    if (this.running.get(instanceId)) {
      console.log(`[Executor] Pipeline instance ${instanceId} is already running`);
      return;
    }

    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) throw new Error(`Pipeline instance ${instanceId} not found`);

    this.running.set(instanceId, true);

    // Transition pipeline to running
    await stateMachine.transition('pipeline', instanceId, 'running', 'system');
    // Transition task to running
    await stateMachine.transition('task', instance.taskId, 'running', 'system');

    // Execute phases serially, steps within phases per their execution mode
    await this.executePhases(instance);
  }

  /**
   * Retry a failed stage and continue.
   */
  async retryStage(instanceId: number, stageRunId: number): Promise<void> {
    await stateMachine.transition('stage', stageRunId, 'pending', 'human');
    const instance = queries.getPipelineInstanceById(instanceId);
    if (instance) {
      await this.executePhases(instance);
    }
  }

  /**
   * Execute phases serially; within each phase, execute steps in batches.
   * Steps within a batch execute in parallel, batches execute serially.
   */
  private async executePhases(instance: PipelineInstance): Promise<void> {
    const instanceId = instance.id;
    if (!this.running.get(instanceId)) return;

    const stageMeta = this.resolveStageMeta(instance);
    const template = this.getTemplateForInstance(instance);
    const phaseOrder = template?.stages
      ? this.getPhaseOrderFromTemplate(template.stages)
      : PHASES.map(p => p.key);

    // Group stages by phase, preserving order
    const phaseGroups = new Map<string, StageMeta[]>();
    for (const meta of stageMeta) {
      if (!phaseGroups.has(meta.phaseKey)) {
        phaseGroups.set(meta.phaseKey, []);
      }
      phaseGroups.get(meta.phaseKey)!.push(meta);
    }

    // Execute each phase serially
    for (const phaseKey of phaseOrder) {
      const steps = phaseGroups.get(phaseKey);
      if (!steps || steps.length === 0) continue;

      await this.executePhaseSteps(instance, steps);
      if (!this.running.get(instanceId)) return;
    }

    // All phases completed
    this.running.delete(instanceId);
    await stateMachine.transition('pipeline', instanceId, 'completed', 'system');
    await stateMachine.transition('task', instance.taskId, 'completed', 'system');
    console.log(`[Executor] Pipeline instance ${instanceId} completed`);
  }

  /**
   * Execute a group of steps within a single phase, grouped by batchIndex.
   * Steps with the same batchIndex execute in parallel.
   */
  private async executePhaseSteps(instance: PipelineInstance, steps: StageMeta[]): Promise<void> {
    const instanceId = instance.id;
    const stageRuns = instance.stageRuns;

    // Group steps by batchIndex
    const batchMap = new Map<number, StageMeta[]>();
    for (const step of steps) {
      const batchIdx = step.batchIndex || 0;
      if (!batchMap.has(batchIdx)) {
        batchMap.set(batchIdx, []);
      }
      batchMap.get(batchIdx)!.push(step);
    }

    // Sort batches by index
    const sortedBatches = Array.from(batchMap.entries()).sort((a, b) => a[0] - b[0]);

    // Execute batches serially
    for (const [batchIdx, batch] of sortedBatches) {
      if (!this.running.get(instanceId)) return;

      if (batch.length === 1) {
        // Single step - serial execution
        const step = batch[0];
        const stageRun = stageRuns.find(sr => sr.stageKey === step.stageKey);
        if (!stageRun) continue;

        if (stageRun.status === 'completed' || stageRun.status === 'skipped') {
          continue;
        }

        const ok = await this.executeSingleStage(instance, stageRun, step);
        if (!ok) return;
      } else {
        // Multiple steps - parallel execution
        const ok = await this.executeParallelBatch(instance, batch);
        if (!ok) return;
      }
    }
  }

  /**
   * Execute a single serial stage.
   */
  private async executeSingleStage(instance: PipelineInstance, stageRun: StageRun, meta: StageMeta): Promise<boolean> {
    const instanceId = instance.id;

    await stateMachine.transition('stage', stageRun.id, 'running', 'system');
    queries.updatePipelineInstanceStatus(instanceId, 'running', instance.currentStageIndex);
    queries.updateAgentStatus(stageRun.agentId, 'busy', instance.taskId);

    const input = this.buildAgentInput(stageRun.stageKey, meta, instance);
    queries.setStageRunInput(stageRun.id, input);

    console.log(`[Executor] Running stage "${meta.label}" (${meta.phaseKey}) with agent "${stageRun.agentId}"`);

    // Handle system actions (like code_pull, code_merge, lint, build, etc.)
    if (meta.action === 'code_pull') {
      return await this.executeCodePull(instance, stageRun, meta);
    }
    if (meta.action === 'code_merge') {
      return await this.executeCodeMerge(instance, stageRun, meta);
    }

    // Get the appropriate client based on agent source
    const { client, source } = this.getClientForAgent(stageRun.agentId);
    const agentConfig = this.getAgentConfig(stageRun.agentId);

    let result: AgentResponse;
    if (source === 'claude' || source === 'custom') {
      // Use Claude client with config
      result = await (client as ClaudeAgentClient).sendMessage(stageRun.agentId, input, agentConfig);
    } else {
      // Use OpenClaw client
      result = await (client as OpenClawAgentClient).sendMessage(stageRun.agentId, input);
    }

    if (result.success) {
      queries.setStageRunOutput(stageRun.id, result.output);
      queries.updateAgentStatus(stageRun.agentId, 'idle', null);
      await stateMachine.transition('stage', stageRun.id, 'completed', 'system');
      console.log(`[Executor] Stage "${meta.label}" completed`);
      return true;
    } else {
      queries.updateStageRunStatus(stageRun.id, 'failed', result.error);
      queries.updateAgentStatus(stageRun.agentId, 'error', null);
      await stateMachine.transition('stage', stageRun.id, 'failed', 'system');
      console.error(`[Executor] Stage "${meta.label}" failed: ${result.error}`);
      await stateMachine.transition('pipeline', instanceId, 'failed', 'system');
      await stateMachine.transition('task', instance.taskId, 'failed', 'system');
      this.running.delete(instanceId);
      return false;
    }
  }

  /**
   * Execute code_pull system action.
   * Pulls code from a git repository to the workspace.
   */
  private async executeCodePull(instance: PipelineInstance, stageRun: StageRun, meta: StageMeta): Promise<boolean> {
    const instanceId = instance.id;
    const task = queries.getTaskById(instance.taskId);
    
    try {
      // Get task description to parse repository URL
      const taskDesc = task?.description || '';
      
      // Try to extract git repository URL from task description
      // Supports formats like: repo: https://github.com/user/repo.git
      // or just the URL anywhere in the description
      const repoMatch = taskDesc.match(/(?:repo[:\s]+)?(https?:\/\/[^\s]+\.git|git@[^\s]+:[^\s]+\.git)/i);
      const repoUrl = repoMatch ? repoMatch[1] : null;
      
      // Extract branch (optional)
      const branchMatch = taskDesc.match(/branch[:\s]+(\w+)/i);
      const branch = branchMatch ? branchMatch[1] : 'main';
      
      // Determine target directory
      const workspaceDir = '/root/.openclaw/workspace';
      const taskDir = task ? `task_${task.id}` : `pipeline_${instanceId}`;
      const targetDir = path.join(workspaceDir, taskDir);
      
      let output = '';
      
      if (!repoUrl) {
        // No repository URL found - skip this step but mark as completed
        output = '未在任务描述中找到仓库地址，跳过代码拉取\n\n' +
                 '提示：在任务描述中添加仓库地址，例如：\n' +
                 'repo: https://github.com/user/repo.git\n' +
                 'branch: main (可选，默认为 main)';
        
        queries.setStageRunOutput(stageRun.id, output);
        queries.updateStageRunStatus(stageRun.id, 'completed');
        await stateMachine.transition('stage', stageRun.id, 'completed', 'system');
        console.log(`[Executor] Stage "${meta.label}" completed (no repo URL found)`);
        return true;
      }
      
      // Ensure target directory exists
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      // Check if it's already a git repo
      const gitDir = path.join(targetDir, '.git');
      
      if (fs.existsSync(gitDir)) {
        // Pull latest changes
        output += `仓库已存在，执行 git pull...\n`;
        const pullResult = execSync('git pull', { 
          cwd: targetDir, 
          encoding: 'utf-8',
          timeout: 120000
        });
        output += pullResult || '已更新到最新版本\n';
      } else {
        // Clone repository
        output += `正在克隆仓库: ${repoUrl}\n`;
        output += `目标目录: ${targetDir}\n`;
        output += `分支: ${branch}\n\n`;
        
        // Remove existing directory contents if any
        if (fs.existsSync(targetDir)) {
          const files = fs.readdirSync(targetDir);
          for (const file of files) {
            const filePath = path.join(targetDir, file);
            fs.rmSync(filePath, { recursive: true, force: true });
          }
        }
        
        const cloneResult = execSync(`git clone --branch ${branch} --single-branch ${repoUrl} .`, {
          cwd: targetDir,
          encoding: 'utf-8',
          timeout: 300000
        });
        output += cloneResult || '克隆完成\n';
      }
      
      // Get commit info
      try {
        const commitInfo = execSync('git log -1 --oneline', {
          cwd: targetDir,
          encoding: 'utf-8'
        });
        output += `\n当前版本: ${commitInfo.trim()}`;
      } catch {
        // Ignore commit info errors
      }
      
      queries.setStageRunOutput(stageRun.id, output);
      queries.updateStageRunStatus(stageRun.id, 'completed');
      await stateMachine.transition('stage', stageRun.id, 'completed', 'system');
      console.log(`[Executor] Stage "${meta.label}" completed - code pulled to ${targetDir}`);
      return true;
      
    } catch (error) {
      const errorMsg = `代码拉取失败: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[Executor] Stage "${meta.label}" failed:`, error);
      
      queries.updateStageRunStatus(stageRun.id, 'failed', errorMsg);
      await stateMachine.transition('stage', stageRun.id, 'failed', 'system');
      await stateMachine.transition('pipeline', instanceId, 'failed', 'system');
      await stateMachine.transition('task', instance.taskId, 'failed', 'system');
      this.running.delete(instanceId);
      return false;
    }
  }

  /**
   * Execute code_merge system action.
   * Merges a target branch into the current branch in the workspace.
   */
  private async executeCodeMerge(instance: PipelineInstance, stageRun: StageRun, meta: StageMeta): Promise<boolean> {
    const instanceId = instance.id;
    const task = queries.getTaskById(instance.taskId);

    try {
      const taskDesc = task?.description || '';
      const workspaceDir = '/root/.openclaw/workspace';
      const taskDir = task ? `task_${task.id}` : `pipeline_${instanceId}`;
      const targetDir = path.join(workspaceDir, taskDir);

      // Parse target branch to merge from task description
      // Supports: merge: main, target: develop, source: feature/x
      const mergeMatch = taskDesc.match(/(?:merge|target|source)[\s:]+([\w\-/]+)/i);
      const sourceBranch = mergeMatch ? mergeMatch[1] : null;

      let output = '';

      if (!fs.existsSync(path.join(targetDir, '.git'))) {
        output = '目标目录不是 Git 仓库，无法执行合并\n提示：请先添加 code_pull 步骤拉取代码';
        queries.setStageRunOutput(stageRun.id, output);
        queries.updateStageRunStatus(stageRun.id, 'failed');
        await stateMachine.transition('stage', stageRun.id, 'failed', 'system');
        await stateMachine.transition('pipeline', instanceId, 'failed', 'system');
        await stateMachine.transition('task', instance.taskId, 'failed', 'system');
        this.running.delete(instanceId);
        return false;
      }

      if (!sourceBranch) {
        output = '未在任务描述中找到要合并的目标分支，跳过代码合并\n\n' +
                 '提示：在任务描述中添加合并分支，例如：\n' +
                 'merge: main\n' +
                 'target: develop';
        queries.setStageRunOutput(stageRun.id, output);
        queries.updateStageRunStatus(stageRun.id, 'completed');
        await stateMachine.transition('stage', stageRun.id, 'completed', 'system');
        console.log(`[Executor] Stage "${meta.label}" completed (no merge branch found)`);
        return true;
      }

      // Fetch latest refs
      output += `获取远程分支信息...\n`;
      const fetchResult = execSync('git fetch origin', {
        cwd: targetDir,
        encoding: 'utf-8',
        timeout: 120000,
      });
      output += fetchResult || '已获取最新分支信息\n';

      // Get current branch
      const currentBranch = execSync('git branch --show-current', {
        cwd: targetDir,
        encoding: 'utf-8',
      }).trim();

      output += `\n当前分支: ${currentBranch}\n`;
      output += `合并分支: ${sourceBranch}\n`;

      // Perform merge
      const mergeResult = execSync(`git merge origin/${sourceBranch} --no-edit`, {
        cwd: targetDir,
        encoding: 'utf-8',
        timeout: 120000,
      });
      output += mergeResult || `成功合并 ${sourceBranch}\n`;

      // Get latest commit info
      try {
        const commitInfo = execSync('git log -1 --oneline', {
          cwd: targetDir,
          encoding: 'utf-8',
        });
        output += `\n合并后版本: ${commitInfo.trim()}`;
      } catch {
        // Ignore commit info errors
      }

      queries.setStageRunOutput(stageRun.id, output);
      queries.updateStageRunStatus(stageRun.id, 'completed');
      await stateMachine.transition('stage', stageRun.id, 'completed', 'system');
      console.log(`[Executor] Stage "${meta.label}" completed - merged ${sourceBranch} into ${currentBranch}`);
      return true;

    } catch (error) {
      const errorMsg = `代码合并失败: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[Executor] Stage "${meta.label}" failed:`, error);

      queries.updateStageRunStatus(stageRun.id, 'failed', errorMsg);
      await stateMachine.transition('stage', stageRun.id, 'failed', 'system');
      await stateMachine.transition('pipeline', instanceId, 'failed', 'system');
      await stateMachine.transition('task', instance.taskId, 'failed', 'system');
      this.running.delete(instanceId);
      return false;
    }
  }

  /**
   * Execute a batch of parallel stages simultaneously.
   */
  private async executeParallelBatch(instance: PipelineInstance, batch: StageMeta[]): Promise<boolean> {
    const instanceId = instance.id;
    const stageRuns = instance.stageRuns;

    // Mark all as running
    for (const meta of batch) {
      const sr = stageRuns.find(s => s.stageKey === meta.stageKey);
      if (!sr) continue;
      await stateMachine.transition('stage', sr.id, 'running', 'system');
      queries.updateAgentStatus(sr.agentId, 'busy', instance.taskId);
      const input = this.buildAgentInput(sr.stageKey, meta, instance);
      queries.setStageRunInput(sr.id, input);
      console.log(`[Executor] Running stage "${meta.label}" (parallel, ${meta.phaseKey}) with agent "${sr.agentId}"`);
    }

    // Dispatch all in parallel
    const results = await Promise.allSettled(
      batch.map(async (meta): Promise<AgentResponse> => {
        const sr = stageRuns.find(s => s.stageKey === meta.stageKey);
        if (!sr) return { success: true, output: '', error: undefined, duration: 0 };

        // Get the appropriate client based on agent source
        const { client, source } = this.getClientForAgent(sr.agentId);
        const agentConfig = this.getAgentConfig(sr.agentId);
        const input = this.buildAgentInput(sr.stageKey, meta, instance);

        if (source === 'claude' || source === 'custom') {
          return (client as ClaudeAgentClient).sendMessage(sr.agentId, input, agentConfig);
        } else {
          return (client as OpenClawAgentClient).sendMessage(sr.agentId, input);
        }
      })
    );

    // Process results
    let anyFailed = false;
    for (let idx = 0; idx < batch.length; idx++) {
      const meta = batch[idx];
      const sr = stageRuns.find(s => s.stageKey === meta.stageKey);
      if (!sr) continue;

      const result = results[idx];
      if (result.status === 'rejected' || !result.value.success) {
        const error = result.status === 'rejected'
          ? String(result.reason)
          : result.value.error || 'Unknown error';
        queries.updateStageRunStatus(sr.id, 'failed', error);
        queries.updateAgentStatus(sr.agentId, 'error', null);
        await stateMachine.transition('stage', sr.id, 'failed', 'system');
        console.error(`[Executor] Parallel stage "${meta.label}" failed: ${error}`);
        anyFailed = true;
      } else {
        queries.setStageRunOutput(sr.id, result.value.output);
        queries.updateAgentStatus(sr.agentId, 'idle', null);
        await stateMachine.transition('stage', sr.id, 'completed', 'system');
        console.log(`[Executor] Parallel stage "${meta.label}" completed`);
      }
    }

    if (anyFailed) {
      await stateMachine.transition('pipeline', instanceId, 'failed', 'system');
      await stateMachine.transition('task', instance.taskId, 'failed', 'system');
      this.running.delete(instanceId);
      return false;
    }

    return true;
  }

  /**
   * Resolve stage metadata (phaseKey, batchIndex, label) for each stage run.
   * Looks up from the template first, falls back to default stages.
   */
  private resolveStageMeta(instance: PipelineInstance): StageMeta[] {
    // Try to get template stages
    const template = this.getTemplateForInstance(instance);
    const templateStages = template?.stages || DEFAULT_PIPELINE_STAGES;

    return instance.stageRuns.map(sr => {
      // Look up in template stages
      const tmplStage = templateStages.find(s => s.key === sr.stageKey);
      if (tmplStage) {
        return {
          stageKey: sr.stageKey,
          label: tmplStage.label || sr.stageKey,
          phaseKey: tmplStage.phaseKey || 'development',
          batchIndex: tmplStage.batchIndex ?? 0,
          agentId: sr.agentId,
          action: tmplStage.action || sr.stageKey,
        };
      }

      // Fallback to default stages
      const defStage = DEFAULT_PIPELINE_STAGES.find(s => s.key === sr.stageKey);
      if (defStage) {
        return {
          stageKey: sr.stageKey,
          label: defStage.label || sr.stageKey,
          phaseKey: defStage.phaseKey || 'development',
          batchIndex: defStage.batchIndex ?? 0,
          agentId: sr.agentId,
          action: defStage.action || sr.stageKey,
        };
      }

      // Unknown stage — default to development/batch 0
      return {
        stageKey: sr.stageKey,
        label: sr.stageKey,
        phaseKey: 'development',
        batchIndex: 0,
        agentId: sr.agentId,
        action: sr.stageKey,
      };
    });
  }

  /**
   * Get the template associated with a pipeline instance.
   */
  private getTemplateForInstance(instance: PipelineInstance): { stages: PipelineStage[] } | null {
    if (instance.templateId) {
      const tmpl = queries.getTemplateById(instance.templateId);
      if (tmpl) return { stages: tmpl.stages };
    }
    return null;
  }

  /**
   * Extract phase order from template stages, preserving definition order.
   * Supports custom (non-standard) phases.
   */
  private getPhaseOrderFromTemplate(stages: PipelineStage[]): string[] {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const stage of stages) {
      if (!seen.has(stage.phaseKey)) {
        seen.add(stage.phaseKey);
        order.push(stage.phaseKey);
      }
    }
    return order.length > 0 ? order : PHASES.map(p => p.key);
  }

  /**
   * Build the input message for an agent based on the stage and previous outputs.
   */
  private buildAgentInput(stageKey: string, meta: StageMeta | undefined, ctx: { stageRuns: Array<{ stageKey: string; output: string | null; status: string }> }): string {
    const stageLabel = meta?.label || stageKey;
    const phaseLabel = PHASES.find(p => p.key === meta?.phaseKey)?.label || meta?.phaseKey || '';

    // Gather previous stage outputs
    const previousOutputs = ctx.stageRuns
      .filter(sr => sr.output && sr.status === 'completed' && sr.stageKey !== stageKey)
      .map(sr => {
        const def = DEFAULT_PIPELINE_STAGES.find(s => s.key === sr.stageKey);
        const phaseKey = def?.phaseKey;
        const pl = phaseKey ? (PHASES.find(p => p.key === phaseKey)?.label || phaseKey) : '';
        const label = def?.label || sr.stageKey;
        return pl ? `[${pl} / ${label}]\n${sr.output}` : `[${label}]\n${sr.output}`;
      });

    const context = previousOutputs.length > 0
      ? `## Previous Stage Outputs\n\n${previousOutputs.join('\n\n')}`
      : '';

    const stagePrompts: Record<string, string> = {
      req_analysis: `You are a product manager. Please analyze the following requirements and break them down into user stories and acceptance criteria.\n\n${context}`,
      architecture: `You are a system architect. Based on the requirements and user stories, please design the system architecture including:\n- Component design\n- API design\n- Database schema\n- Technical decisions\n\n${context}`,
      development: `You are a senior developer. Based on the requirements and architecture, please implement the code:\n- Follow clean architecture principles\n- Write tests first\n- Ensure code quality\n\n${context}`,
      code_review: `You are a senior developer. Please review the code for:\n- Code quality and readability\n- Potential bugs\n- Performance concerns\n\n${context}`,
      testing: `You are a QA engineer. Please review the implementation and:\n- Verify test coverage\n- Check for edge cases\n- Report any bugs or issues\n\n${context}`,
      deployment: `You are a DevOps engineer. Please prepare the deployment:\n- CI/CD pipeline configuration\n- Environment setup\n- Monitoring alerts\n\n${context}`,
    };

    // Try to match by action key (stageKey in templates)
    if (stagePrompts[stageKey]) {
      return stagePrompts[stageKey];
    }

    // Generic prompt based on phase
    const phaseInstructions: Record<string, string> = {
      requirements: 'Please analyze and clarify the requirements.',
      design: 'Please design the system architecture and technical approach.',
      development: 'Please implement the code based on the specifications.',
      testing: 'Please verify the implementation through testing.',
      deployment: 'Please prepare and execute the deployment.',
    };

    const phaseInst = phaseInstructions[meta?.phaseKey || '']
      || `Please complete the task for the ${phaseLabel || meta?.phaseKey || ''} phase.`;

    return `## Stage: ${stageLabel}\n## Phase: ${phaseLabel}\n\n${phaseInst}\n\n${context}`;
  }

  /**
   * Stop a running pipeline.
   */
  async stop(instanceId: number): Promise<void> {
    this.running.delete(instanceId);
    // Reset any running stages back to pending
    const instance = queries.getPipelineInstanceById(instanceId);
    if (instance) {
      for (const stage of instance.stageRuns) {
        if (stage.status === 'running') {
          queries.updateStageRunStatus(stage.id, 'pending');
          queries.updateAgentStatus(stage.agentId, 'idle', null);
        }
      }
    }
  }
}

export const pipelineExecutor = new PipelineExecutor();
