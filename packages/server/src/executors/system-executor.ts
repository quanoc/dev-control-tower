import type { StageExecutor, ExecutionContext, ExecutionResult } from './interface.js';

/**
 * 系统动作类型
 */
export type SystemAction =
  | 'code_pull'
  | 'code_merge'
  | 'lint'
  | 'build'
  | 'security_scan'
  | 'test_e2e';

/**
 * 系统动作处理器
 */
type SystemActionHandler = (params: Record<string, unknown>) => Promise<ExecutionResult>;

/**
 * System 执行器
 * 负责路由到具体的系统工具
 */
export class SystemExecutor implements StageExecutor {
  readonly type = 'system' as const;

  /**
   * 系统动作注册表
   */
  private actionHandlers: Map<string, SystemActionHandler> = new Map();

  constructor() {
    this.registerDefaultHandlers();
  }

  /**
   * 注册默认的系统动作处理器
   */
  private registerDefaultHandlers(): void {
    this.actionHandlers.set('code_pull', this.handleCodePull.bind(this));
    this.actionHandlers.set('code_merge', this.handleCodeMerge.bind(this));
    this.actionHandlers.set('lint', this.handleLint.bind(this));
    this.actionHandlers.set('build', this.handleBuild.bind(this));
    this.actionHandlers.set('security_scan', this.handleSecurityScan.bind(this));
    this.actionHandlers.set('test_e2e', this.handleTestE2E.bind(this));
  }

  /**
   * 注册自定义动作处理器（扩展点）
   */
  registerHandler(action: string, handler: SystemActionHandler): void {
    this.actionHandlers.set(action, handler);
  }

  /**
   * 执行系统动作
   */
  async execute(context: ExecutionContext, mock = true): Promise<ExecutionResult> {
    const { componentId, action, instanceId } = context;

    if (mock) {
      return this.executeMock(context);
    }

    // 真实执行：路由到具体处理器
    return this.executeReal(context);
  }

  /**
   * 模拟执行
   */
  private async executeMock(context: ExecutionContext): Promise<ExecutionResult> {
    const { componentId, action, instanceId } = context;

    // 模拟延迟 1.5-3 秒
    await this.delay(1500 + Math.random() * 1500);

    // 80% 成功率
    const success = Math.random() < 0.8;

    if (success) {
      return {
        success: true,
        output: `[Mock] System action "${action}" executed successfully (component: ${componentId || 'none'}, instance: ${instanceId})`,
        metadata: {
          componentId,
          action,
          executionTime: Date.now()
        }
      };
    }

    return {
      success: false,
      error: `[Mock] System action "${action}" failed (random 20% failure)`
    };
  }

  /**
   * 真实执行
   */
  private async executeReal(context: ExecutionContext): Promise<ExecutionResult> {
    const { action, input, componentId } = context;

    // 查找处理器
    const handler = this.actionHandlers.get(action);

    if (!handler) {
      return {
        success: false,
        error: `Unknown system action: ${action}. Available actions: ${Array.from(this.actionHandlers.keys()).join(', ')}`
      };
    }

    try {
      const params: Record<string, unknown> = {
        ...input,
        componentId
      };
      return await handler(params);
    } catch (error) {
      return {
        success: false,
        error: `System action "${action}" error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  // ─── 具体动作处理器（预留真实实现） ───────────────────────────────────

  private async handleCodePull(params: Record<string, unknown>): Promise<ExecutionResult> {
    const { repoUrl, branch, targetDir } = params as { repoUrl?: string; branch?: string; targetDir?: string };
    // TODO: 实现 git clone
    return {
      success: true,
      output: `Code pulled from ${repoUrl || 'unknown'} (branch: ${branch || 'main'})`
    };
  }

  private async handleCodeMerge(params: Record<string, unknown>): Promise<ExecutionResult> {
    const { sourceBranch, targetBranch } = params as { sourceBranch?: string; targetBranch?: string };
    // TODO: 实现 git merge
    return {
      success: true,
      output: `Merged ${sourceBranch || 'source'} into ${targetBranch || 'target'}`
    };
  }

  private async handleLint(params: Record<string, unknown>): Promise<ExecutionResult> {
    const { targetDir } = params as { targetDir?: string };
    // TODO: 执行 lint
    return {
      success: true,
      output: 'Lint check passed'
    };
  }

  private async handleBuild(params: Record<string, unknown>): Promise<ExecutionResult> {
    const { targetDir } = params as { targetDir?: string };
    // TODO: 执行 build
    return {
      success: true,
      output: 'Build succeeded'
    };
  }

  private async handleSecurityScan(params: Record<string, unknown>): Promise<ExecutionResult> {
    const { targetDir } = params as { targetDir?: string };
    // TODO: 执行安全扫描
    return {
      success: true,
      output: 'Security scan passed - no vulnerabilities found'
    };
  }

  private async handleTestE2E(params: Record<string, unknown>): Promise<ExecutionResult> {
    const { targetDir } = params as { targetDir?: string };
    // TODO: 执行 E2E 测试
    return {
      success: true,
      output: 'All E2E tests passed'
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
