import type { StageExecutor, ExecutionContext, ExecutionResult } from './interface.js';

/**
 * Human 执行器
 * 不实际执行，而是返回等待审批状态
 */
export class HumanExecutor implements StageExecutor {
  readonly type = 'human' as const;

  /**
   * 执行 Human 审批节点
   * Human 节点不会立即执行，而是返回特殊状态让调用方处理
   */
  async execute(context: ExecutionContext, mock = true): Promise<ExecutionResult> {
    const { action, humanRole, stageKey } = context;

    // Human 节点不执行实际操作
    // 返回特殊标记，让调用方将状态改为 waiting_approval
    return {
      success: false,
      error: 'WAITING_APPROVAL',
      metadata: {
        requiresApproval: true,
        action,
        humanRole: humanRole || 'reviewer',
        stageKey
      }
    };
  }

  /**
   * 校验审批结果
   * @param approved 是否通过
   * @param comment 审批意见
   */
  validateApproval(approved: boolean, comment?: string): ExecutionResult {
    if (approved) {
      return {
        success: true,
        output: comment ? `Approved: ${comment}` : 'Approved'
      };
    }
    return {
      success: false,
      error: comment ? `Rejected: ${comment}` : 'Rejected'
    };
  }
}
