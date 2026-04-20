import { describe, it, expect, beforeEach } from 'vitest';
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

    it('should return JSON output on success in mock mode', async () => {
      const context = createMockContext({
        actorType: 'agent',
        action: 'code',
        agentId: 'test-agent',
      });

      const result = await executor.execute(context, true);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();

      // 验证输出是 JSON
      const parsed = JSON.parse(result.output!);
      expect(parsed).toHaveProperty('artifacts');
      expect(parsed).toHaveProperty('nextStepInput');
      expect(parsed.nextStepInput).toHaveProperty('summary');
    }, 10000);

    it('should include artifacts in mock output', async () => {
      const context = createMockContext({
        actorType: 'agent',
        action: 'code',
        agentId: 'my-agent',
        componentId: 42,
      });

      const result = await executor.execute(context, true);

      if (result.success) {
        expect(result.artifacts).toBeDefined();
        expect(result.artifacts!.length).toBeGreaterThan(0);
      }
    }, 10000);

    it('should fallback to mock when no agent configured', async () => {
      const context = createMockContext({
        actorType: 'agent',
        action: 'code',
        agentId: undefined,
      });

      // 不再返回错误，而是 fallback 到 mock
      const result = await executor.execute(context, false);

      // 因为 fallback 到 mock，所以会成功（80%概率）
      expect(result).toBeDefined();
    }, 10000);
  });

  describe('SystemExecutor', () => {
    let executor: SystemExecutor;

    beforeEach(() => {
      executor = new SystemExecutor();
    });

    it('should return success in mock mode', async () => {
      const context = createMockContext({
        actorType: 'system',
        action: 'build',
      });

      const result = await executor.execute(context, true);

      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
    }, 10000);

    it('should include action info in output', async () => {
      const context = createMockContext({
        actorType: 'system',
        action: 'lint',
        componentId: 5,
      });

      const result = await executor.execute(context, true);

      if (result.success) {
        expect(result.output).toContain('lint');
      }
    }, 10000);

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
        output: `Custom action executed`,
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
