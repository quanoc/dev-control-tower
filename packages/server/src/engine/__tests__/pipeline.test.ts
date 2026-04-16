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
});
