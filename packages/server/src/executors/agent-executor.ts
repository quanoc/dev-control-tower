import type { StageExecutor, ExecutionContext, ExecutionResult, Artifact } from './interface.js';
import { OpenClawAgentClient } from '../openclaw/agent.js';
import { ClaudeAgentClient } from '../openclaw/claude-agent.js';
import * as queries from '../db/queries.js';
import { ContextBuilder, PromptGenerator, OutputParser, OutputValidator } from '../context/index.js';
import type { Agent } from '@pipeline/shared';

/**
 * Agent 执行器
 *
 * 上下文传递流程：
 * 1. ContextBuilder 获取任务的 runtimeContext + 上一步输出
 * 2. PromptGenerator 生成 Prompt
 * 3. Agent 执行，返回 JSON 输出
 * 4. OutputParser 解析 JSON
 * 5. 保存到 Step 的 structured_output
 * 6. 更新任务的 runtimeContext（共享上下文）
 */
export class AgentExecutor implements StageExecutor {
  readonly type = 'agent' as const;

  private openclawClient = new OpenClawAgentClient();
  private claudeClient = new ClaudeAgentClient();
  private contextBuilder = new ContextBuilder();
  private promptGenerator = new PromptGenerator();
  private outputParser = new OutputParser();
  private outputValidator = new OutputValidator();

  /**
   * 执行 Agent 任务
   */
  async execute(context: ExecutionContext, mock = true): Promise<ExecutionResult> {
    const { agentId, action, stageRunId, instanceId, stageKey } = context;

    if (mock) {
      return this.executeMock(context);
    }

    // 获取 Agent 信息
    const agent = queries.getAgentById(agentId || '');
    if (!agent) {
      console.log(`[AgentExecutor] Agent "${agentId}" not found, using mock`);
      return this.executeMock(context);
    }

    // 构建上下文
    const stepContext = this.contextBuilder.build(
      instanceId || 0,
      stageKey || action
    );

    // 生成 Prompt
    const prompt = this.promptGenerator.generate(stepContext, agent);

    console.log(`[AgentExecutor] Calling ${agent.source || 'openclaw'} agent "${agent.id}" for action "${action}"`);
    console.log(`[AgentExecutor] Runtime context: ${stepContext.runtimeContext ? 'yes' : 'no'}`);

    // 执行
    const source = agent.source || 'openclaw';
    let result: ExecutionResult;

    if (source === 'openclaw') {
      result = await this.executeWithOpenClaw(agent, prompt);
    } else if (source === 'claude') {
      result = await this.executeWithClaude(agent, prompt);
    } else {
      return this.executeMock(context);
    }

    // 解析输出并保存
    if (result.success && result.output && stageRunId) {
      const parsed = this.outputParser.parse(result.output);

      if (parsed.output) {
        // 验证输出契约
        const outputContract = stepContext.currentStep.outputContract;
        if (outputContract) {
          const validationErrors = this.outputValidator.validate(parsed.output, outputContract);
          if (validationErrors.length > 0) {
            console.log(`[AgentExecutor] Output contract validation failed:`);
            validationErrors.forEach(err => {
              console.log(`  - ${err.field}: ${err.message}`);
            });
            // Store validation errors for debugging
            parsed.validationErrors = validationErrors.map(e => `${e.field}: ${e.message}`);
          }
        }

        // 1. 保存结构化输出到 Step
        queries.setStageRunStructuredOutput(
          stageRunId,
          parsed.output,
          result.output
        );

        // 2. 更新流水线实例的共享上下文
        if (instanceId) {
          this.updateRuntimeContext(
            instanceId,
            stageKey || action,
            parsed.output
          );
        }

        // 合并 artifacts
        if (parsed.output.artifacts.length > 0) {
          result.artifacts = [...(result.artifacts || []), ...parsed.output.artifacts];
        }
      }
    }

    return result;
  }

  /**
   * 更新流水线实例的共享上下文
   */
  private updateRuntimeContext(
    instanceId: number,
    stageKey: string,
    output: { artifacts: Artifact[]; nextStepInput: { summary: string; keyPoints?: string[]; decisions?: Array<{ decision: string; reason?: string }> } }
  ): void {
    // 构建 keyDecisions
    const keyDecisions = (output.nextStepInput.decisions || []).map(d => ({
      from: stageKey,
      decision: d.decision,
      reason: d.reason,
    }));

    // 使用 mergeRuntimeContext 增量更新
    queries.mergeRuntimeContext(instanceId, {
      summary: output.nextStepInput.summary,
      keyDecisions,
      artifacts: output.artifacts,
      constraints: output.nextStepInput.keyPoints || [],
    }, stageKey);

    console.log(`[AgentExecutor] Updated runtime context for instance ${instanceId}`);
  }

  /**
   * 模拟执行
   */
  private async executeMock(context: ExecutionContext): Promise<ExecutionResult> {
    const { agentId, action, componentId, instanceId, stageKey } = context;

    await this.delay(500);

    // Mock 模式总是返回成功，便于测试
    const mockOutput = {
      artifacts: this.getMockArtifacts(action),
      nextStepInput: {
        summary: `[Mock] ${action} completed successfully`,
        keyPoints: ['Mock key point 1', 'Mock key point 2'],
      }
    };

    // 更新共享上下文（仅当 instanceId 存在且有对应实例时）
    if (instanceId) {
      try {
        const instance = queries.getPipelineInstanceById(instanceId);
        if (instance) {
          this.updateRuntimeContext(instanceId, stageKey || action, mockOutput);
        }
      } catch {
        // 忽略错误（可能是测试环境没有对应实例）
      }
    }

    return {
      success: true,
      output: JSON.stringify(mockOutput),
      artifacts: mockOutput.artifacts,
      metadata: { componentId, action, executionTime: Date.now() }
    };
  }

  /**
   * 使用 OpenClaw 执行
   */
  private async executeWithOpenClaw(agent: Agent, prompt: string): Promise<ExecutionResult> {
    const response = await this.openclawClient.sendMessage(agent.id, prompt);

    return {
      success: response.success,
      output: response.output,
      error: response.error,
      metadata: { agentId: agent.id, duration: response.duration, source: 'openclaw' }
    };
  }

  /**
   * 使用 Claude 执行
   */
  private async executeWithClaude(agent: Agent, prompt: string): Promise<ExecutionResult> {
    const response = await this.claudeClient.sendMessage(agent.id, prompt, {
      systemPrompt: agent.systemPrompt,
      model: agent.model,
    });

    return {
      success: response.success,
      output: response.output,
      error: response.error,
      metadata: { agentId: agent.id, duration: response.duration, source: 'claude' }
    };
  }

  /**
   * Mock 产物生成
   */
  private getMockArtifacts(action: string): Artifact[] {
    const timestamp = Date.now();

    const artifactMap: Record<string, Artifact[]> = {
      analyze: [{ type: 'document', url: `mock://docs/requirements-${timestamp}`, title: '需求分析文档' }],
      design: [{ type: 'document', url: `mock://docs/architecture-${timestamp}`, title: '架构设计文档' }],
      code: [{ type: 'pr', url: `mock://github/pr-${timestamp}`, title: '代码 PR' }],
      test: [{ type: 'test_report', url: `mock://reports/test-${timestamp}`, title: '测试报告' }],
      deploy: [{ type: 'deploy', url: `mock://deploy/v1-${timestamp}`, title: '部署链接' }],
      document: [{ type: 'document', url: `mock://docs/api-${timestamp}`, title: '文档' }],
    };

    return artifactMap[action] || [];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
