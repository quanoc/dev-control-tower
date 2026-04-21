/**
 * Intent Parser
 *
 * 解析用户消息，识别流水线操作意图
 */

import type { ParsedIntent, ConversationContext } from './types.js';

/**
 * 意图关键词映射
 */
const INTENT_KEYWORDS: Record<string, { type: ParsedIntent['type']; action: ParsedIntent['action'] }[]> = {
  // 控制类
  '暂停': [{ type: 'control', action: 'pause' }],
  'pause': [{ type: 'control', action: 'pause' }],
  '继续': [{ type: 'control', action: 'resume' }],
  '恢复': [{ type: 'control', action: 'resume' }],
  'resume': [{ type: 'control', action: 'resume' }],
  '取消': [{ type: 'control', action: 'cancel' }],
  '停止': [{ type: 'control', action: 'cancel' }],
  'cancel': [{ type: 'control', action: 'cancel' }],
  'stop': [{ type: 'control', action: 'cancel' }],

  // 重拾类
  '重新执行': [{ type: 'control', action: 'retry_from' }],
  '重试': [{ type: 'control', action: 'retry_from' }],
  'retry': [{ type: 'control', action: 'retry_from' }],
  '从': [{ type: 'control', action: 'retry_from' }],

  // 审批类
  '审批通过': [{ type: 'approve', action: 'approve' }],
  '批准': [{ type: 'approve', action: 'approve' }],
  '通过': [{ type: 'approve', action: 'approve' }],
  '可以': [{ type: 'approve', action: 'approve' }],
  'approve': [{ type: 'approve', action: 'approve' }],
  '审批拒绝': [{ type: 'approve', action: 'reject' }],
  '拒绝': [{ type: 'approve', action: 'reject' }],
  '不行': [{ type: 'approve', action: 'reject' }],
  '驳回': [{ type: 'approve', action: 'reject' }],
  'reject': [{ type: 'approve', action: 'reject' }],

  // 查询类
  '进度': [{ type: 'query', action: 'query_progress' }],
  '状态': [{ type: 'query', action: 'query_status' }],
  '怎么样': [{ type: 'query', action: 'query_status' }],
  'progress': [{ type: 'query', action: 'query_progress' }],
  'status': [{ type: 'query', action: 'query_status' }],
};

/**
 * 步骤关键词映射
 */
const STEP_KEYWORDS: Record<string, string> = {
  '分析': 'analyze',
  '需求': 'analyze',
  '设计': 'design',
  '架构': 'design',
  '开发': 'code',
  '编码': 'code',
  '代码': 'code',
  '测试': 'test',
  '部署': 'deploy',
  '文档': 'document',
  '审查': 'review',
  '评审': 'review',
};

export class IntentParser {
  /**
   * 解析用户消息
   */
  parse(message: string, context: ConversationContext): ParsedIntent {
    const lowerMessage = message.toLowerCase().trim();

    // 1. 尝试匹配意图关键词
    const intent = this.matchIntent(lowerMessage);
    if (intent) {
      // 2. 尝试提取目标步骤
      if (intent.action === 'retry_from') {
        intent.target = this.extractStepKey(message);
      }

      // 3. 从上下文获取实例 ID
      if (context.instanceId) {
        intent.instanceId = context.instanceId;
      }
      if (context.taskId) {
        intent.taskId = context.taskId;
      }

      return intent;
    }

    // 未识别的意图
    return {
      type: 'unknown',
      confidence: 0,
    };
  }

  /**
   * 匹配意图关键词
   */
  private matchIntent(message: string): ParsedIntent | null {
    for (const [keyword, intents] of Object.entries(INTENT_KEYWORDS)) {
      if (message.includes(keyword.toLowerCase())) {
        // 返回第一个匹配的意图
        const matched = intents[0];
        return {
          type: matched.type,
          action: matched.action,
          confidence: 0.8,
        };
      }
    }
    return null;
  }

  /**
   * 提取步骤 key
   */
  private extractStepKey(message: string): string | undefined {
    // 模式：从 [步骤] 重新执行
    const fromPattern = /从\s*([^\s]+)\s*(?:重新执行|重试|开始)/;
    const match = message.match(fromPattern);
    if (match) {
      const stepName = match[1];
      // 尝试映射到标准步骤 key
      return STEP_KEYWORDS[stepName] || stepName;
    }

    // 模式：重新执行 [步骤]
    const retryPattern = /(?:重新执行|重试)\s*([^\s]+)/;
    const retryMatch = message.match(retryPattern);
    if (retryMatch) {
      const stepName = retryMatch[1];
      return STEP_KEYWORDS[stepName] || stepName;
    }

    // 直接匹配步骤关键词
    for (const [keyword, stepKey] of Object.entries(STEP_KEYWORDS)) {
      if (message.includes(keyword)) {
        return stepKey;
      }
    }

    return undefined;
  }
}
