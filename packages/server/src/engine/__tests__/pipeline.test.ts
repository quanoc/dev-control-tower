import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the queries module
vi.mock('../../db/queries.js', () => ({
  getDb: () => ({
    prepare: () => ({
      run: vi.fn(),
    }),
  }),
  getPipelineInstanceById: vi.fn(),
  getTaskById: vi.fn(),
  getStageRunById: vi.fn(),
  updatePipelineInstanceStatus: vi.fn(),
  updateStageRunStatus: vi.fn(),
  updateStageRunHeartbeat: vi.fn(),
  setStageRunOutput: vi.fn(),
  advancePipelineStage: vi.fn(),
  logStateTransition: vi.fn(),
  clearStageRunOutput: vi.fn(),
}));

// Mock the state machine
vi.mock('../statemachine.js', () => ({
  stateMachine: {
    transition: vi.fn().mockResolvedValue(undefined),
  },
}));

import * as queries from '../../db/queries.js';
import { stateMachine } from '../statemachine.js';
import { PipelineExecutor } from '../executor.js';

describe('PipelineExecutor', () => {
  let executor: PipelineExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new PipelineExecutor();
  });

  describe('start()', () => {
    it('should throw error if pipeline not found', async () => {
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue(undefined as any);

      await expect(executor.start(999)).rejects.toThrow('not found');
    });

    it('should throw error if pipeline is not pending', async () => {
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'running',
        taskId: 1,
        stageRuns: [],
      } as any);

      await expect(executor.start(1)).rejects.toThrow('not pending');
    });

    it('should transition pipeline and task to running', async () => {
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'pending',
        taskId: 1,
        stageRuns: [{ id: 1, status: 'pending', stageKey: 'test' }],
      } as any);
      vi.mocked(queries.getTaskById).mockReturnValue({ id: 1 } as any);
      vi.mocked(queries.getStageRunById).mockReturnValue({
        id: 1,
        status: 'pending',
        stageKey: 'test',
      } as any);

      // Mock getDb for output update
      (queries as any).getDb = () => ({
        prepare: () => ({ run: vi.fn() }),
      });

      await executor.start(1);

      expect(stateMachine.transition).toHaveBeenCalledWith('pipeline', 1, 'running', 'system');
      expect(stateMachine.transition).toHaveBeenCalledWith('task', 1, 'running', 'system');
    });
  });

  describe('executeStage() - running check', () => {
    it('should NOT execute if another stage is already running', async () => {
      // 场景：架构设计在 running，尝试执行代码评审
      vi.mocked(queries.getStageRunById).mockReturnValue({
        id: 2,
        status: 'pending',
        stageKey: 'code_review',
      } as any);
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'running',
        taskId: 1,
        stageRuns: [
          { id: 1, status: 'running', stageKey: 'architecture' },  // 正在运行！
          { id: 2, status: 'pending', stageKey: 'code_review' },   // 尝试执行这个
        ],
      } as any);

      await executor.executeStage(1, 2);

      // 不应该执行任何状态转换
      expect(stateMachine.transition).not.toHaveBeenCalled();
    });

    it('should execute if no other stage is running', async () => {
      // 场景：架构设计已完成，执行代码评审
      vi.mocked(queries.getStageRunById).mockReturnValue({
        id: 2,
        status: 'pending',
        stageKey: 'code_review',
      } as any);
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'running',
        taskId: 1,
        stageRuns: [
          { id: 1, status: 'completed', stageKey: 'architecture' },  // 已完成
          { id: 2, status: 'pending', stageKey: 'code_review' },     // 执行这个
        ],
      } as any);

      await executor.executeStage(1, 2);

      // 应该执行状态转换
      expect(stateMachine.transition).toHaveBeenCalledWith('stage', 2, 'running', 'system');
    });

    it('should NOT execute if stage is not pending', async () => {
      // 场景：阶段已完成，不应该重复执行
      vi.mocked(queries.getStageRunById).mockReturnValue({
        id: 1,
        status: 'completed',
        stageKey: 'architecture',
      } as any);
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'running',
        taskId: 1,
        stageRuns: [
          { id: 1, status: 'completed', stageKey: 'architecture' },
          { id: 2, status: 'pending', stageKey: 'code_review' },
        ],
      } as any);

      await executor.executeStage(1, 1);

      // 不应该执行任何状态转换
      expect(stateMachine.transition).not.toHaveBeenCalled();
    });
  });

  describe('approveStage()', () => {
    it('should throw error if stage is not waiting for approval', async () => {
      vi.mocked(queries.getStageRunById).mockReturnValue({
        id: 1,
        status: 'pending',
      } as any);
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({ id: 1 } as any);

      await expect(executor.approveStage(1, 1)).rejects.toThrow('not waiting for approval');
    });

    it('should complete stage and resume pipeline', async () => {
      vi.mocked(queries.getStageRunById).mockReturnValue({
        id: 1,
        status: 'waiting_approval',
        stageKey: 'approval',
      } as any);
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'paused',
        taskId: 1,
        stageRuns: [{ id: 1, status: 'waiting_approval' }],
      } as any);
      vi.mocked(queries.getTaskById).mockReturnValue({ id: 1 } as any);

      // Mock getDb for output update
      (queries as any).getDb = () => ({
        prepare: () => ({ run: vi.fn() }),
      });

      await executor.approveStage(1, 1);

      expect(stateMachine.transition).toHaveBeenCalledWith('stage', 1, 'completed', 'human');
    });
  });

  describe('retryStage()', () => {
    it('should throw error if stage is not failed', async () => {
      vi.mocked(queries.getStageRunById).mockReturnValue({
        id: 1,
        status: 'pending',
      } as any);
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({ id: 1 } as any);

      await expect(executor.retryStage(1, 1)).rejects.toThrow('not failed');
    });

    it('should reset stage to pending and execute again', async () => {
      vi.mocked(queries.getStageRunById).mockReturnValue({
        id: 1,
        status: 'failed',
        stageKey: 'failed_stage',
      } as any);
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'failed',
        taskId: 1,
        stageRuns: [{ id: 1, status: 'failed' }],
      } as any);
      vi.mocked(queries.getTaskById).mockReturnValue({ id: 1, status: 'failed' } as any);

      (queries as any).getDb = () => ({
        prepare: () => ({ run: vi.fn() }),
      });

      await executor.retryStage(1, 1);

      expect(stateMachine.transition).toHaveBeenCalledWith('stage', 1, 'pending', 'human');
    });
  });

  describe('skipStage()', () => {
    it('should mark stage as skipped and continue pipeline', async () => {
      vi.mocked(queries.getStageRunById).mockReturnValue({
        id: 1,
        status: 'failed',
        stageKey: 'failed_stage',
      } as any);
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'failed',
        taskId: 1,
        stageRuns: [
          { id: 1, status: 'failed', stageKey: 'failed_stage' },
          { id: 2, status: 'pending', stageKey: 'next_stage' },
        ],
      } as any);
      vi.mocked(queries.getTaskById).mockReturnValue({ id: 1, status: 'failed' } as any);

      await executor.skipStage(1, 1);

      expect(stateMachine.transition).toHaveBeenCalledWith('stage', 1, 'skipped', 'human');
    });
  });

  describe('stop()', () => {
    it('should cancel pipeline and reset running stages', async () => {
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'running',
        stageRuns: [
          { id: 1, status: 'running', stageKey: 'running_stage' },
          { id: 2, status: 'pending', stageKey: 'pending_stage' },
        ],
      } as any);

      await executor.stop(1);

      expect(queries.updateStageRunStatus).toHaveBeenCalledWith(1, 'pending');
      expect(stateMachine.transition).toHaveBeenCalledWith('pipeline', 1, 'cancelled', 'human');
    });
  });

  describe('retryFrom()', () => {
    it('should throw error if pipeline not found', async () => {
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue(undefined as any);

      await expect(executor.retryFrom(999, 'stage_key')).rejects.toThrow('not found');
    });

    it('should throw error if stage not found', async () => {
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'paused',
        taskId: 1,
        stageRuns: [{ id: 1, status: 'completed', stageKey: 'other_stage' }],
      } as any);

      await expect(executor.retryFrom(1, 'nonexistent_stage')).rejects.toThrow('not found');
    });

    it('should reset target stage and all subsequent stages to pending', async () => {
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'paused',
        taskId: 1,
        stageRuns: [
          { id: 1, status: 'completed', stageKey: 'stage_1' },
          { id: 2, status: 'completed', stageKey: 'stage_2' },  // Target
          { id: 3, status: 'completed', stageKey: 'stage_3' },  // Should be reset
          { id: 4, status: 'pending', stageKey: 'stage_4' },    // Already pending
        ],
      } as any);
      vi.mocked(queries.getTaskById).mockReturnValue({ id: 1, status: 'paused' } as any);
      vi.mocked(queries.getStageRunById).mockReturnValue({
        id: 2,
        status: 'pending',
        stageKey: 'stage_2',
      } as any);

      (queries as any).getDb = () => ({
        prepare: () => ({ run: vi.fn() }),
      });

      await executor.retryFrom(1, 'stage_2');

      // Should clear output for stages 2, 3, 4
      expect(queries.clearStageRunOutput).toHaveBeenCalledTimes(3);
      expect(queries.clearStageRunOutput).toHaveBeenCalledWith(2);
      expect(queries.clearStageRunOutput).toHaveBeenCalledWith(3);
      expect(queries.clearStageRunOutput).toHaveBeenCalledWith(4);

      // Should transition stages 2 and 3 to pending (stage 4 is already pending)
      expect(stateMachine.transition).toHaveBeenCalledWith('stage', 2, 'pending', 'human');
      expect(stateMachine.transition).toHaveBeenCalledWith('stage', 3, 'pending', 'human');
      expect(stateMachine.transition).not.toHaveBeenCalledWith('stage', 4, 'pending', 'human');
    });

    it('should transition pipeline to running if not already', async () => {
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'paused',
        taskId: 1,
        stageRuns: [
          { id: 1, status: 'completed', stageKey: 'stage_1' },
          { id: 2, status: 'completed', stageKey: 'stage_2' },
        ],
      } as any);
      vi.mocked(queries.getTaskById).mockReturnValue({ id: 1, status: 'paused' } as any);
      vi.mocked(queries.getStageRunById).mockReturnValue({
        id: 2,
        status: 'pending',
        stageKey: 'stage_2',
      } as any);

      (queries as any).getDb = () => ({
        prepare: () => ({ run: vi.fn() }),
      });

      await executor.retryFrom(1, 'stage_2');

      expect(stateMachine.transition).toHaveBeenCalledWith('pipeline', 1, 'running', 'human');
      expect(stateMachine.transition).toHaveBeenCalledWith('task', 1, 'running', 'human');
    });

    it('should not transition pipeline if already running', async () => {
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'running',
        taskId: 1,
        stageRuns: [
          { id: 1, status: 'completed', stageKey: 'stage_1' },
          { id: 2, status: 'completed', stageKey: 'stage_2' },
        ],
      } as any);
      vi.mocked(queries.getStageRunById).mockReturnValue({
        id: 2,
        status: 'pending',
        stageKey: 'stage_2',
      } as any);

      (queries as any).getDb = () => ({
        prepare: () => ({ run: vi.fn() }),
      });

      await executor.retryFrom(1, 'stage_2');

      // Should NOT call transition for pipeline/task since already running
      expect(stateMachine.transition).not.toHaveBeenCalledWith('pipeline', 1, 'running', 'human');
    });

    it('should handle completed stage transition to pending', async () => {
      // This test verifies that STAGE_TRANSITIONS allows completed -> pending
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'paused',
        taskId: 1,
        stageRuns: [
          { id: 1, status: 'completed', stageKey: 'stage_1' },
          { id: 2, status: 'completed', stageKey: 'stage_2' },
        ],
      } as any);
      vi.mocked(queries.getTaskById).mockReturnValue({ id: 1, status: 'paused' } as any);
      vi.mocked(queries.getStageRunById).mockReturnValue({
        id: 2,
        status: 'pending',
        stageKey: 'stage_2',
      } as any);

      (queries as any).getDb = () => ({
        prepare: () => ({ run: vi.fn() }),
      });

      // This should NOT throw - completed -> pending is allowed via retryFrom
      await executor.retryFrom(1, 'stage_2');

      // Verify the transition was called (state machine will validate)
      expect(stateMachine.transition).toHaveBeenCalledWith('stage', 2, 'pending', 'human');
    });

    it('should reset waiting_approval stage to pending', async () => {
      // 场景：人工评审在等待审批，用户想重新执行该阶段
      vi.mocked(queries.getPipelineInstanceById).mockReturnValue({
        id: 1,
        status: 'paused',
        taskId: 1,
        stageRuns: [
          { id: 1, status: 'completed', stageKey: 'stage_1' },
          { id: 2, status: 'waiting_approval', stageKey: 'stage_2' },  // 等待审批中
        ],
      } as any);
      vi.mocked(queries.getTaskById).mockReturnValue({ id: 1, status: 'paused' } as any);
      vi.mocked(queries.getStageRunById).mockReturnValue({
        id: 2,
        status: 'pending',
        stageKey: 'stage_2',
      } as any);

      (queries as any).getDb = () => ({
        prepare: () => ({ run: vi.fn() }),
      });

      // 应该可以重置 waiting_approval 状态
      await executor.retryFrom(1, 'stage_2');

      expect(stateMachine.transition).toHaveBeenCalledWith('stage', 2, 'pending', 'human');
    });
  });
});
