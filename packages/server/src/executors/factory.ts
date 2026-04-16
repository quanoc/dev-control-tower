import type { ActorType } from '@pipeline/shared';
import type { StageExecutor } from './interface.js';
import { AgentExecutor } from './agent-executor.js';
import { SystemExecutor } from './system-executor.js';
import { HumanExecutor } from './human-executor.js';

/**
 * 执行器工厂
 * 根据节点类型返回对应的执行器
 */
export class ExecutorFactory {
  private static agentExecutor = new AgentExecutor();
  private static systemExecutor = new SystemExecutor();
  private static humanExecutor = new HumanExecutor();

  // 支持注册自定义执行器
  private static customExecutors: Map<string, StageExecutor> = new Map();

  /**
   * 获取执行器
   */
  static getExecutor(actorType: ActorType): StageExecutor {
    // 先检查自定义执行器
    const custom = this.customExecutors.get(actorType);
    if (custom) return custom;

    switch (actorType) {
      case 'agent':
        return this.agentExecutor;
      case 'system':
        return this.systemExecutor;
      case 'human':
        return this.humanExecutor;
      default:
        throw new Error(`Unknown actor type: ${actorType}`);
    }
  }

  /**
   * 注册自定义执行器（扩展点）
   */
  static registerExecutor(actorType: string, executor: StageExecutor): void {
    this.customExecutors.set(actorType, executor);
  }

  /**
   * 获取 System 执行器（用于注册自定义动作）
   */
  static getSystemExecutor(): SystemExecutor {
    return this.systemExecutor;
  }

  /**
   * 获取 Agent 执行器
   */
  static getAgentExecutor(): AgentExecutor {
    return this.agentExecutor;
  }

  /**
   * 获取 Human 执行器
   */
  static getHumanExecutor(): HumanExecutor {
    return this.humanExecutor;
  }
}
