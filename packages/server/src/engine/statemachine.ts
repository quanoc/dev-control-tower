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
        const allInstances = queries.getAllPipelineInstances();
        for (const inst of allInstances) {
          const stageRun = inst.stageRuns.find(sr => sr.id === entityId);
          if (stageRun) {
            fromState = stageRun.status;
            transitions = STAGE_TRANSITIONS;
            break;
          }
        }
        if (!fromState) throw new Error(`Stage run ${entityId} not found`);
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

    // Execute transition
    await this.executeTransition(entityType, entityId, fromState, toState, triggeredBy);
  }

  /**
   * Execute the state change and persist it.
   */
  private async executeTransition(
    entityType: string,
    entityId: number,
    fromState: string | null,
    toState: string,
    triggeredBy: string
  ): Promise<void> {
    switch (entityType) {
      case 'task':
        queries.updateTaskStatus(entityId, toState);
        break;
      case 'pipeline':
        queries.updatePipelineInstanceStatus(entityId, toState);
        break;
      case 'stage':
        queries.updateStageRunStatus(entityId, toState);
        break;
    }

    // Log the transition
    queries.logStateTransition(entityType, entityId, fromState, toState, triggeredBy);

    console.log(
      `[StateMachine] ${entityType}:${entityId} ${fromState} → ${toState} (by ${triggeredBy})`
    );
  }
}

export const stateMachine = new StateMachine();
