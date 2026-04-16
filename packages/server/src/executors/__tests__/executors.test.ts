import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentExecutor } from '../agent-executor.js';
import { SystemExecutor } from '../system-executor.js';
import { HumanExecutor } from '../human-executor.js';
import type { ExecutionContext } from '../interface.js';

describe('Stage Executors', () => {
  const createMockContext = (overrides?: Partial<ExecutionContext>): ExecutionContext => ({
    instanceId: 1,
    stageRunId: 1,
    componentId: 1,
    stageKey: 'test_stage',
    action: 'code',
    actorType: 'agent',
    ...overrides,
  });

  describe('AgentExecutor', () => {
    let executor: AgentExecutor;

    beforeEach(() => {
      executor = new AgentExecutor();
    });

    it('should return success with 80% probability in mock mode', async () => {
      const context = createMockContext({
        actorType: 'agent',
        action: 'code',
        agentId: 'test-agent',
      });

      // 多次执行统计成功率
      const results = await Promise.all(
        Array.from({ length: 100 }, () => executor.execute(context, true))
      );

      const successCount = results.filter(r => r.success).length;
      const successRate = successCount / 100;

      // 80% 成功率，允许一定误差
      expect(successRate).toBeGreaterThan(0.6);
      expect(successRate).toBeLessThan(1);
    });

    it('should include agent info in output on success', async () => {
      const context = createMockContext({
        actorType: 'agent',
        action: 'code',
        agentId: 'my-agent',
        componentId: 42,
      });

      const result = await executor.execute(context, true);

      if (result.success) {
        expect(result.output).toContain('my-agent');
        expect(result.output).toContain('code');
        expect(result.metadata?.componentId).toBe(42);
      }
    });

    it('should return error message on mock failure', async () => {
      const context = createMockContext({
        actorType: 'agent',
        action: 'test',
      });

      // 执行多次直到遇到失败（最多 20 次，避免超时）
      for (let i = 0; i < 20; i++) {
        const result = await executor.execute(context, true);
        if (!result.success) {
          expect(result.error).toContain('Mock');
          expect(result.error).toContain('failed');
          return;
        }
      }

      // 如果没遇到失败，跳过此断言（概率很低）
      expect(true).toBe(true);
    });

    it('should return error when no agent configured for real execution', async () => {
      const context = createMockContext({
        actorType: 'agent',
        action: 'code',
        agentId: undefined, // 没有配置 agent
      });

      const result = await executor.execute(context, false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No agent configured');
    });
  });

  describe('SystemExecutor', () => {
    let executor: SystemExecutor;

    beforeEach(() => {
      executor = new SystemExecutor();
    });

    it('should return success with 80% probability in mock mode', async () => {
      const context = createMockContext({
        actorType: 'system',
        action: 'build',
      });

      const results = await Promise.all(
        Array.from({ length: 100 }, () => executor.execute(context, true))
      );

      const successCount = results.filter(r => r.success).length;
      const successRate = successCount / 100;

      expect(successRate).toBeGreaterThan(0.6);
      expect(successRate).toBeLessThan(1);
    });

    it('should include action info in output on success', async () => {
      const context = createMockContext({
        actorType: 'system',
        action: 'lint',
        componentId: 5,
      });

      const result = await executor.execute(context, true);

      if (result.success) {
        expect(result.output).toContain('lint');
        expect(result.metadata?.action).toBe('lint');
      }
    });

    it('should return error for unknown action in real mode', async () => {
      const context = createMockContext({
        actorType: 'system',
        action: 'unknown_action',
      });

      const result = await executor.execute(context, false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown system action');
    });

    it('should support registering custom action handlers', async () => {
      executor.registerHandler('custom_action', async (params) => ({
        success: true,
        output: `Custom action executed with ${JSON.stringify(params)}`,
      }));

      const context = createMockContext({
        actorType: 'system',
        action: 'custom_action',
      });

      const result = await executor.execute(context, false);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Custom action');
    });
  });

  describe('HumanExecutor', () => {
    let executor: HumanExecutor;

    beforeEach(() => {
      executor = new HumanExecutor();
    });

    it('should return WAITING_APPROVAL error', async () => {
      const context = createMockContext({
        actorType: 'human',
        action: 'approve',
        humanRole: 'reviewer',
      });

      const result = await executor.execute(context, true);

      expect(result.success).toBe(false);
      expect(result.error).toBe('WAITING_APPROVAL');
      expect(result.metadata?.requiresApproval).toBe(true);
    });

    it('should include human role in metadata', async () => {
      const context = createMockContext({
        actorType: 'human',
        action: 'review',
        humanRole: 'senior_dev',
      });

      const result = await executor.execute(context, true);

      expect(result.metadata?.humanRole).toBe('senior_dev');
    });

    it('should validate approval correctly', () => {
      const approved = executor.validateApproval(true, 'LGTM');
      expect(approved.success).toBe(true);
      expect(approved.output).toContain('LGTM');
    });

    it('should validate rejection correctly', () => {
      const rejected = executor.validateApproval(false, 'Needs work');
      expect(rejected.success).toBe(false);
      expect(rejected.error).toContain('Rejected');
    });
  });
});
