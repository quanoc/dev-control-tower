import type { ActorType } from '@pipeline/shared';

/**
 * 执行结果
 */
export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 执行上下文
 */
export interface ExecutionContext {
  instanceId: number;
  stageRunId: number;
  componentId?: number;
  stageKey: string;
  action: string;
  actorType: ActorType;
  agentId?: string;
  humanRole?: string;
  input?: Record<string, unknown>;
  taskContext?: {
    title: string;
    description: string;
  };
}

/**
 * 执行器接口
 */
export interface StageExecutor {
  readonly type: ActorType;

  /**
   * 执行阶段
   * @param context 执行上下文
   * @param mock 是否模拟执行（默认 true）
   */
  execute(context: ExecutionContext, mock?: boolean): Promise<ExecutionResult>;
}
