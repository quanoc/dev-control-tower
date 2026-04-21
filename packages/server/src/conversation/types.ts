/**
 * Conversation Types
 */

import type { StageRunStatus } from '@pipeline/shared';

/**
 * 对话消息
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * 对话上下文
 */
export interface ConversationContext {
  /** 用户标识 */
  userId: string;
  /** 当前任务 ID */
  taskId?: number;
  /** 流水线实例 ID */
  instanceId?: number;
  /** 当前步骤 key */
  currentStageKey?: string;
  /** 对话历史 */
  history: ConversationMessage[];
}

/**
 * 解析后的意图
 */
export interface ParsedIntent {
  /** 意图类型 */
  type: 'control' | 'approve' | 'query' | 'unknown';
  /** 具体动作 */
  action?:
    | 'pause'
    | 'resume'
    | 'cancel'
    | 'retry_from'
    | 'approve'
    | 'reject'
    | 'query_progress'
    | 'query_status';
  /** 目标步骤 key */
  target?: string;
  /** 备注/评论 */
  comment?: string;
  /** 流水线实例 ID */
  instanceId?: number;
  /** 任务 ID */
  taskId?: number;
  /** 置信度 */
  confidence: number;
}

/**
 * 对话响应
 */
export interface ConversationResponse {
  /** 是否成功 */
  success: boolean;
  /** 响应消息 */
  message: string;
  /** 操作结果 */
  result?: {
    action: string;
    target?: string;
    data?: unknown;
  };
  /** 需要更多信息 */
  needMoreInfo?: boolean;
  /** 提示问题 */
  prompt?: string;
}

/**
 * 流水线进度摘要
 */
export interface PipelineProgressSummary {
  taskId: number;
  taskTitle: string;
  status: string;
  progress: string;
  currentPhase?: string;
  currentStep?: string;
  completedSteps: number;
  totalSteps: number;
  failedSteps: number;
  stages: Array<{
    key: string;
    label: string;
    status: StageRunStatus;
    phaseKey?: string;
  }>;
}
