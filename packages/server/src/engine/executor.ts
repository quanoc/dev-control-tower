import { OpenClawAgentClient } from '../openclaw/agent.js';
import type { AgentResponse } from '../openclaw/agent.js';
import { stateMachine } from './statemachine.js';
import * as queries from '../db/queries.js';
import type { PipelineStage, PipelineInstance, StageRun, PipelinePhase } from '@pipeline/shared';
import { DEFAULT_PIPELINE_STAGES, PHASES } from '@pipeline/shared';

interface StageMeta {
  stageKey: string;
  label: string;
  phaseKey: string;
  execution: 'serial' | 'parallel';
  agentId: string;
}

/**
 * Pipeline executor.
 * Orchestrates the execution of pipeline stages by dispatching work to agents.
 * Phases execute serially; within a phase, steps can be serial or parallel.
 */
export class PipelineExecutor {
  private agentClient = new OpenClawAgentClient();
  private running = new Map<number, boolean>();

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
   * Execute phases serially; within each phase, respect serial/parallel mode.
   * Uses template phase order if available, falls back to standard PHASES.
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
   * Execute a group of steps within a single phase, respecting serial/parallel mode.
   * Walks through steps in order:
   * - Serial steps execute one at a time
   * - Consecutive parallel steps execute together
   */
  private async executePhaseSteps(instance: PipelineInstance, steps: StageMeta[]): Promise<void> {
    const instanceId = instance.id;
    const stageRuns = instance.stageRuns;
    let i = 0;

    while (i < steps.length && this.running.get(instanceId)) {
      const step = steps[i];
      const stageRun = stageRuns.find(sr => sr.stageKey === step.stageKey);
      if (!stageRun) { i++; continue; }

      // Skip completed/skipped
      if (stageRun.status === 'completed' || stageRun.status === 'skipped') {
        i++;
        continue;
      }

      if (step.execution === 'serial') {
        const ok = await this.executeSingleStage(instance, stageRun, step);
        if (!ok) return;
        i++;
      } else {
        // Collect consecutive parallel steps
        const parallelBatch: StageMeta[] = [];
        let j = i;
        while (j < steps.length) {
          const s = steps[j];
          const sr = stageRuns.find(sr => sr.stageKey === s.stageKey);
          if (s.execution !== 'parallel' || (sr && (sr.status === 'completed' || sr.status === 'skipped'))) {
            break;
          }
          parallelBatch.push(s);
          j++;
        }

        if (parallelBatch.length === 0) {
          i++;
          continue;
        }

        const ok = await this.executeParallelBatch(instance, parallelBatch);
        if (!ok) return;
        i = j;
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

    const result = await this.agentClient.sendMessage(stageRun.agentId, input);

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
        return this.agentClient.sendMessage(sr.agentId, this.buildAgentInput(sr.stageKey, meta, instance));
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
   * Resolve stage metadata (phaseKey, execution, label) for each stage run.
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
          execution: tmplStage.execution || 'serial',
          agentId: sr.agentId,
        };
      }

      // Fallback to default stages
      const defStage = DEFAULT_PIPELINE_STAGES.find(s => s.key === sr.stageKey);
      if (defStage) {
        return {
          stageKey: sr.stageKey,
          label: defStage.label || sr.stageKey,
          phaseKey: defStage.phaseKey || 'development',
          execution: defStage.execution || 'serial',
          agentId: sr.agentId,
        };
      }

      // Unknown stage — default to development/serial
      return {
        stageKey: sr.stageKey,
        label: sr.stageKey,
        phaseKey: 'development',
        execution: 'serial',
        agentId: sr.agentId,
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
