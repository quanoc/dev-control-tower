import {
  TASK_TRANSITIONS,
  PIPELINE_TRANSITIONS,
  STAGE_TRANSITIONS,
} from '@pipeline/shared';
import * as queries from '../db/queries.js';

export class StateMachineError extends Error {
  constructor(
    message: string,
    public entityType: string,
    public entityId: number,
    public fromState: string,
    public toState: string
  ) {
    super(message);
    this.name = 'StateMachineError';
  }
}

/**
 * Core state machine engine.
 * Enforces valid state transitions and logs all changes.
 *
 * 【关键】使用乐观锁保证状态一致性：
 * UPDATE ... WHERE id = ? AND status = ?
 * 如果 changes = 0，说明状态已被其他操作改变，抛出错误。
 */
export class StateMachine {
  /**
   * Validate and execute a state transition.
   */
  async transition(
    entityType: 'task' | 'pipeline' | 'stage',
    entityId: number,
    toState: string,
    triggeredBy: 'human' | 'system' | 'agent' = 'human'
  ): Promise<void> {
    let fromState: string | null = null;
    let transitions: Record<string, string[]> = {};

    // Get current state and valid transitions
    switch (entityType) {
      case 'task': {
        const task = queries.getTaskById(entityId);
        if (!task) throw new Error(`Task ${entityId} not found`);
        fromState = task.status;
        transitions = TASK_TRANSITIONS;
        break;
      }
      case 'pipeline': {
        const instance = queries.getPipelineInstanceById(entityId);
        if (!instance) throw new Error(`Pipeline instance ${entityId} not found`);
        fromState = instance.status;
        transitions = PIPELINE_TRANSITIONS;
        break;
      }
      case 'stage': {
        const stageRun = queries.getStageRunById(entityId);
        if (!stageRun) throw new Error(`Stage run ${entityId} not found`);
        fromState = stageRun.status;
        transitions = STAGE_TRANSITIONS;
        break;
      }
    }

    // Validate transition
    const validTargets = transitions[fromState as keyof typeof transitions] || [];
    if (!validTargets.includes(toState)) {
      throw new StateMachineError(
        `Invalid transition: ${entityType} ${entityId} from "${fromState}" to "${toState}". Valid: ${validTargets.join(', ')}`,
        entityType,
        entityId,
        fromState,
        toState
      );
    }

    // Execute transition with optimistic locking
    const updated = await this.executeTransitionWithLock(entityType, entityId, fromState, toState);
    if (!updated) {
      throw new StateMachineError(
        `Concurrent modification: ${entityType} ${entityId} state changed from "${fromState}" before transition to "${toState}" could complete`,
        entityType,
        entityId,
        fromState,
        toState
      );
    }

    // Log the transition
    queries.logStateTransition(entityType, entityId, fromState, toState, triggeredBy);

    console.log(
      `[StateMachine] ${entityType}:${entityId} ${fromState} → ${toState} (by ${triggeredBy})`
    );
  }

  /**
   * Execute the state change with optimistic locking.
   * Returns true if the update succeeded, false if the state was already changed.
   */
  private executeTransitionWithLock(
    entityType: string,
    entityId: number,
    fromState: string,
    toState: string
  ): boolean {
    const db = queries.getDb();

    switch (entityType) {
      case 'task': {
        const result = db.prepare(
          'UPDATE tasks SET status = ? WHERE id = ? AND status = ?'
        ).run(toState, entityId, fromState);
        return result.changes > 0;
      }
      case 'pipeline': {
        const result = db.prepare(
          'UPDATE pipeline_instances SET status = ? WHERE id = ? AND status = ?'
        ).run(toState, entityId, fromState);
        return result.changes > 0;
      }
      case 'stage': {
        const result = db.prepare(
          'UPDATE pipeline_stage_runs SET status = ? WHERE id = ? AND status = ?'
        ).run(toState, entityId, fromState);
        return result.changes > 0;
      }
      default:
        return false;
    }
  }
}

export const stateMachine = new StateMachine();
