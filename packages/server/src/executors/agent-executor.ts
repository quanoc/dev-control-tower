import type { StageExecutor, ExecutionContext, ExecutionResult } from './interface.js';

/**
 * Agent 执行器
 * 负责将任务路由到具体的 Agent
 */
export class AgentExecutor implements StageExecutor {
  readonly type = 'agent' as const;

  /**
   * 执行 Agent 任务
   */
  async execute(context: ExecutionContext, mock = true): Promise<ExecutionResult> {
    const { componentId, action, agentId } = context;

    if (mock) {
      return this.executeMock(context);
    }

    // 真实执行：路由到具体 Agent
    return this.executeReal(context);
  }

  /**
   * 模拟执行
   */
  private async executeMock(context: ExecutionContext): Promise<ExecutionResult> {
    const { componentId, action, agentId, instanceId } = context;

    // 模拟延迟 1-3 秒
    await this.delay(1000 + Math.random() * 2000);

    // 80% 成功率
    const success = Math.random() < 0.8;

    if (success) {
      return {
        success: true,
        output: `[Mock] Agent "${agentId || 'default'}" executed action "${action}" (component: ${componentId || 'none'}, instance: ${instanceId})`,
        metadata: {
          componentId,
          action,
          agentId,
          executionTime: Date.now()
        }
      };
    }

    return {
      success: false,
      error: `[Mock] Agent execution failed for action "${action}" (random 20% failure)`
    };
  }

  /**
   * 真实执行：路由到具体 Agent
   * TODO: 对接真实的 Agent 系统
   */
  private async executeReal(context: ExecutionContext): Promise<ExecutionResult> {
    const { componentId, stageKey, action, agentId, input, taskContext } = context;

    // 检查是否配置了 Agent
    if (!agentId) {
      return {
        success: false,
        error: `No agent configured for component ${componentId}`
      };
    }

    try {
      // 构建 prompt
      const prompt = this.buildPrompt(context);

      // 根据需求，后续可以扩展对接不同的 Agent 系统
      // 目前先返回未实现的错误
      return {
        success: false,
        error: `Real agent execution not implemented yet. Agent: ${agentId}, Action: ${action}`
      };

      // TODO: 实现真实的 Agent 调用
      // 1. 查询 Agent 配置（来源、模型等）
      // 2. 根据来源选择客户端（Claude / OpenClaw / Custom）
      // 3. 发送消息并等待响应
      // 4. 返回结果

    } catch (error) {
      return {
        success: false,
        error: `Agent execution error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 构建 Agent Prompt
   */
  private buildPrompt(context: ExecutionContext): string {
    const { stageKey, action, input, taskContext } = context;
    const lines: string[] = [];

    if (taskContext) {
      lines.push(`## Task: ${taskContext.title}`);
      lines.push(`\n### Description\n${taskContext.description}`);
    }

    lines.push(`\n### Stage: ${stageKey}`);
    lines.push(`### Action: ${action}`);

    if (input) {
      lines.push(`\n### Input\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\``);
    }

    return lines.join('\n');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
