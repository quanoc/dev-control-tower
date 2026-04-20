import type { ActorType } from '@pipeline/shared';

/**
 * 产物类型
 */
export type ArtifactType =
  | 'document'      // 文档（需求文档、架构文档、API文档）
  | 'pr'            // Pull Request 链接
  | 'commit'        // Git commit 链接
  | 'deploy'        // 部署链接
  | 'test_report'   // 测试报告
  | 'lint_report'   // Lint 报告
  | 'security_report' // 安全扫描报告
  | 'build_artifact'  // 构建产物
  | 'other';        // 其他

/**
 * 执行产物
 */
export interface Artifact {
  type: ArtifactType;
  url: string;
  title?: string;
  createdAt?: string;
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  /** 执行产物 */
  artifacts?: Artifact[];
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
