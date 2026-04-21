/**
 * Chat Routes
 *
 * 对话 API 入口
 */

import { Router, type Router as RouterType } from 'express';
import { ConversationManager } from '../conversation/index.js';
import type { ConversationContext } from '../conversation/index.js';
import * as queries from '../db/queries.js';

const router: RouterType = Router();
const conversationManager = new ConversationManager();

// 对话上下文存储（简单实现，生产环境应使用数据库）
const conversationContexts = new Map<string, ConversationContext>();

/**
 * 获取或创建对话上下文
 */
function getOrCreateContext(userId: string, taskId?: number): ConversationContext {
  const key = taskId ? `${userId}:${taskId}` : userId;

  if (!conversationContexts.has(key)) {
    conversationContexts.set(key, {
      userId,
      taskId,
      history: [],
    });
  }

  const context = conversationContexts.get(key)!;

  // 更新 taskId
  if (taskId && context.taskId !== taskId) {
    context.taskId = taskId;

    // 获取流水线实例
    const instance = queries.getPipelineInstanceByTaskId(taskId);
    if (instance) {
      context.instanceId = instance.id;
    }
  }

  return context;
}

// POST /api/chat/message - 发送消息
router.post('/message', async (req, res) => {
  try {
    const { message, userId, taskId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const uid = userId || 'default';
    const context = getOrCreateContext(uid, taskId);

    const response = await conversationManager.handleMessage(message, context);

    res.json({
      ...response,
      history: context.history,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMsg });
  }
});

// GET /api/chat/history - 获取对话历史
router.get('/history', (req, res) => {
  try {
    const { userId, taskId } = req.query;
    const uid = (userId as string) || 'default';
    const key = taskId ? `${uid}:${taskId}` : uid;

    const context = conversationContexts.get(key);

    res.json({
      history: context?.history || [],
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMsg });
  }
});

// DELETE /api/chat/history - 清除对话历史
router.delete('/history', (req, res) => {
  try {
    const { userId, taskId } = req.query;
    const uid = (userId as string) || 'default';
    const key = taskId ? `${uid}:${taskId}` : uid;

    conversationContexts.delete(key);

    res.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMsg });
  }
});

// POST /api/chat/context - 设置对话上下文
router.post('/context', (req, res) => {
  try {
    const { userId, taskId, instanceId } = req.body;
    const uid = userId || 'default';

    const context = getOrCreateContext(uid, taskId);
    if (instanceId) {
      context.instanceId = instanceId;
    }

    res.json({
      success: true,
      context: {
        userId: context.userId,
        taskId: context.taskId,
        instanceId: context.instanceId,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMsg });
  }
});

export default router;
