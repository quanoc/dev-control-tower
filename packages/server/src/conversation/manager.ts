/**
 * Conversation Manager
 *
 * 管理对话流程，执行意图
 */

import { IntentParser } from './intent-parser.js';
import type {
  ConversationContext,
  ConversationResponse,
  ParsedIntent,
  PipelineProgressSummary,
} from './types.js';
import * as queries from '../db/queries.js';
import { pipelineExecutor } from '../engine/executor.js';
import { stateMachine } from '../engine/statemachine.js';

export class ConversationManager {
  private intentParser = new IntentParser();

  /**
   * 处理用户消息
   */
  async handleMessage(
    message: string,
    context: ConversationContext
  ): Promise<ConversationResponse> {
    // 解析意图
    const intent = this.intentParser.parse(message, context);

    // 记录用户消息
    context.history.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

    // 处理未知意图
    if (intent.type === 'unknown') {
      return {
        success: false,
        message: '抱歉，我没有理解您的意思。您可以尝试说：\n- "暂停"\n- "继续"\n- "进度"\n- "审批通过/拒绝"',
        needMoreInfo: true,
      };
    }

    // 执行意图
    try {
      const response = await this.executeIntent(intent, context);

      // 记录助手消息
      context.history.push({
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
      });

      return response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `操作失败：${errorMsg}`,
      };
    }
  }

  /**
   * 执行意图
   */
  private async executeIntent(
    intent: ParsedIntent,
    context: ConversationContext
  ): Promise<ConversationResponse> {
    // 获取流水线实例
    const instanceId = intent.instanceId || context.instanceId;
    const taskId = intent.taskId || context.taskId;

    switch (intent.action) {
      case 'pause': {
        if (!instanceId) {
          return this.askForPipeline();
        }
        await pipelineExecutor.pause(instanceId);
        return {
          success: true,
          message: '流水线已暂停',
          result: { action: 'pause' },
        };
      }

      case 'resume': {
        if (!instanceId) {
          return this.askForPipeline();
        }
        await pipelineExecutor.resume(instanceId);
        return {
          success: true,
          message: '流水线已恢复执行',
          result: { action: 'resume' },
        };
      }

      case 'cancel': {
        if (!instanceId) {
          return this.askForPipeline();
        }
        await pipelineExecutor.stop(instanceId);
        return {
          success: true,
          message: '流水线已取消',
          result: { action: 'cancel' },
        };
      }

      case 'retry_from': {
        if (!instanceId) {
          return this.askForPipeline();
        }
        if (!intent.target) {
          return {
            success: false,
            message: '请指定要从哪个步骤重新执行，例如："从 code 重新执行"',
            needMoreInfo: true,
            prompt: '要从哪个步骤开始？',
          };
        }
        await pipelineExecutor.retryFrom(instanceId, intent.target);
        return {
          success: true,
          message: `已从 "${intent.target}" 步骤重新执行`,
          result: { action: 'retry_from', target: intent.target },
        };
      }

      case 'approve': {
        if (!instanceId) {
          // 尝试找到等待审批的步骤
          const waitingStage = this.findWaitingApprovalStage(taskId);
          if (!waitingStage) {
            return {
              success: false,
              message: '没有找到等待审批的步骤',
            };
          }
          await pipelineExecutor.approveStage(
            waitingStage.instanceId,
            waitingStage.stageRunId,
            intent.comment
          );
          return {
            success: true,
            message: '审批已通过，流水线继续执行',
            result: { action: 'approve', target: waitingStage.stageKey },
          };
        }

        // 找到当前等待审批的步骤
        const instance = queries.getPipelineInstanceById(instanceId);
        if (!instance) {
          return { success: false, message: '流水线实例不存在' };
        }

        const waitingStage = instance.stageRuns.find(
          sr => sr.status === 'waiting_approval'
        );
        if (!waitingStage) {
          return {
            success: false,
            message: '当前没有等待审批的步骤',
          };
        }

        await pipelineExecutor.approveStage(
          instanceId,
          waitingStage.id,
          intent.comment
        );
        return {
          success: true,
          message: '审批已通过，流水线继续执行',
          result: { action: 'approve', target: waitingStage.stageKey },
        };
      }

      case 'reject': {
        if (!instanceId) {
          const waitingStage = this.findWaitingApprovalStage(taskId);
          if (!waitingStage) {
            return {
              success: false,
              message: '没有找到等待审批的步骤',
            };
          }
          await pipelineExecutor.rejectStage(
            waitingStage.instanceId,
            waitingStage.stageRunId,
            intent.comment
          );
          return {
            success: true,
            message: '审批已拒绝',
            result: { action: 'reject', target: waitingStage.stageKey },
          };
        }

        const instance = queries.getPipelineInstanceById(instanceId);
        if (!instance) {
          return { success: false, message: '流水线实例不存在' };
        }

        const waitingStage = instance.stageRuns.find(
          sr => sr.status === 'waiting_approval'
        );
        if (!waitingStage) {
          return {
            success: false,
            message: '当前没有等待审批的步骤',
          };
        }

        await pipelineExecutor.rejectStage(
          instanceId,
          waitingStage.id,
          intent.comment
        );
        return {
          success: true,
          message: '审批已拒绝',
          result: { action: 'reject', target: waitingStage.stageKey },
        };
      }

      case 'query_progress':
      case 'query_status': {
        if (!instanceId && !taskId) {
          return this.askForPipeline();
        }

        const progress = this.getPipelineSummary(instanceId, taskId);
        if (!progress) {
          return {
            success: false,
            message: '没有找到流水线信息',
          };
        }

        const statusText = this.formatProgress(progress);
        return {
          success: true,
          message: statusText,
          result: { action: 'query_progress', data: progress },
        };
      }

      default:
        return {
          success: false,
          message: '未知的操作类型',
        };
    }
  }

  /**
   * 找到等待审批的步骤
   */
  private findWaitingApprovalStage(
    taskId?: number
  ): { instanceId: number; stageRunId: number; stageKey: string } | null {
    if (!taskId) return null;

    const instance = queries.getPipelineInstanceByTaskId(taskId);
    if (!instance) return null;

    const waitingStage = instance.stageRuns.find(
      sr => sr.status === 'waiting_approval'
    );
    if (!waitingStage) return null;

    return {
      instanceId: instance.id,
      stageRunId: waitingStage.id,
      stageKey: waitingStage.stageKey,
    };
  }

  /**
   * 获取流水线摘要
   */
  private getPipelineSummary(
    instanceId?: number,
    taskId?: number
  ): PipelineProgressSummary | null {
    let instance;

    if (instanceId) {
      instance = queries.getPipelineInstanceById(instanceId);
    } else if (taskId) {
      instance = queries.getPipelineInstanceByTaskId(taskId);
    }

    if (!instance) return null;

    const task = queries.getTaskById(instance.taskId);
    const completedSteps = instance.stageRuns.filter(
      sr => sr.status === 'completed' || sr.status === 'skipped'
    ).length;
    const failedSteps = instance.stageRuns.filter(
      sr => sr.status === 'failed'
    ).length;

    const currentStage = instance.stageRuns.find(
      sr => sr.status === 'running' || sr.status === 'waiting_approval'
    );

    return {
      taskId: instance.taskId,
      taskTitle: task?.title || '',
      status: instance.status,
      progress: `${completedSteps}/${instance.stageRuns.length}`,
      currentPhase: currentStage?.phaseKey,
      currentStep: currentStage?.stepLabel || currentStage?.stageKey,
      completedSteps,
      totalSteps: instance.stageRuns.length,
      failedSteps,
      stages: instance.stageRuns.map(sr => ({
        key: sr.stageKey,
        label: sr.stepLabel || sr.stageKey,
        status: sr.status,
        phaseKey: sr.phaseKey,
      })),
    };
  }

  /**
   * 格式化进度信息
   */
  private formatProgress(progress: PipelineProgressSummary): string {
    const lines = [
      `📋 **${progress.taskTitle}**`,
      `状态: ${progress.status}`,
      `进度: ${progress.progress}`,
    ];

    if (progress.currentStep) {
      lines.push(`当前步骤: ${progress.currentStep}`);
    }

    if (progress.failedSteps > 0) {
      lines.push(`⚠️ 失败步骤: ${progress.failedSteps}`);
    }

    lines.push('', '**步骤列表**:');
    for (const stage of progress.stages) {
      const icon = this.getStatusIcon(stage.status);
      lines.push(`  ${icon} ${stage.label}`);
    }

    return lines.join('\n');
  }

  /**
   * 获取状态图标
   */
  private getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      pending: '⏳',
      running: '🔄',
      completed: '✅',
      failed: '❌',
      skipped: '⏭️',
      waiting_approval: '⏸️',
    };
    return icons[status] || '❓';
  }

  /**
   * 请求指定流水线
   */
  private askForPipeline(): ConversationResponse {
    return {
      success: false,
      message: '请先指定要操作的流水线',
      needMoreInfo: true,
      prompt: '请提供任务 ID 或流水线实例 ID',
    };
  }
}
