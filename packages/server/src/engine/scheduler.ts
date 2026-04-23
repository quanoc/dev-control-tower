import * as queries from '../db/queries.js';
import { pipelineExecutor } from './executor.js';
import { stateMachine } from './statemachine.js';

/**
 * 流水线调度器
 *
 * 核心原则：**Batch 执行模型**
 * - Batch 内并行：同一个 batch 内的 steps 可以并行执行
 * - Batch 间串行：当前 batch 全部完成后才能进入下一个 batch
 *
 * Scheduler 只恢复"卡住"的流水线：
 * - 有 pending 阶段 AND 当前 batch 无 running 阶段
 *
 * 如果当前 batch 已有 running 阶段，必须跳过，等待其自然完成。
 * 违反此原则会导致不同 batch 的 steps 同时执行！
 *
 * 职责：
 * 1. 服务启动时恢复卡住的流水线
 * 2. 定时检测超时的阶段
 * 3. 检测异常状态的流水线并尝试恢复
 */
export class PipelineScheduler {
  private interval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private tickIntervalMs: number;

  constructor(tickIntervalMs: number = 10000) {
    this.tickIntervalMs = tickIntervalMs;
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`[Scheduler] Starting with interval ${this.tickIntervalMs}ms`);

    // 立即执行一次（恢复卡住的流水线）
    this.tick().catch(err => {
      console.error('[Scheduler] Initial tick failed:', err);
    });

    // 定时执行
    this.interval = setInterval(() => {
      this.tick().catch(err => {
        console.error('[Scheduler] Tick failed:', err);
      });
    }, this.tickIntervalMs);
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log('[Scheduler] Stopped');
  }

  /**
   * 执行一次调度检查
   */
  private async tick(): Promise<void> {
    // 1. 恢复卡住的流水线
    await this.recoverStuckPipelines();

    // 2. 检测超时阶段
    await this.checkTimeoutStages();
  }

  /**
   * 恢复卡住的流水线
   *
   * 场景：
   * - 服务重启后，数据库状态是 running，但没有在执行
   * - 异常导致执行中断
   */
  private async recoverStuckPipelines(): Promise<void> {
    const instances = queries.getAllPipelineInstances();

    for (const instance of instances) {
      // 只处理 running 状态的流水线
      if (instance.status !== 'running') continue;

      // 如果有正在运行的阶段，跳过（等待它完成）
      const runningStage = instance.stageRuns.find(sr => sr.status === 'running');
      if (runningStage) {
        continue;
      }

      // 找到 pending 的阶段
      const pendingStage = instance.stageRuns.find(sr => sr.status === 'pending');

      if (pendingStage) {
        console.log(`[Scheduler] Recovering pipeline ${instance.id}, executing stage ${pendingStage.stageKey}`);
        try {
          await pipelineExecutor.executeStage(instance.id, pendingStage.id);
        } catch (err) {
          console.error(`[Scheduler] Failed to recover pipeline ${instance.id}:`, err);
        }
      }

      // 检查是否有 running 状态但没有心跳的阶段
      const runningStage = instance.stageRuns.find(sr => sr.status === 'running');
      if (runningStage && runningStage.startedAt) {
        // 如果有 running 阶段但没有继续执行，尝试恢复
        // 这里不做处理，由超时检测来处理
      }
    }
  }

  /**
   * 检测超时阶段
   *
   * 如果一个阶段执行时间过长，标记为失败
   */
  private async checkTimeoutStages(): Promise<void> {
    const instances = queries.getAllPipelineInstances();
    const DEFAULT_TIMEOUT = 300; // 5 分钟

    for (const instance of instances) {
      if (instance.status !== 'running') continue;

      for (const stage of instance.stageRuns) {
        if (stage.status !== 'running' || !stage.startedAt) continue;

        const elapsedMs = Date.now() - new Date(stage.startedAt).getTime();
        const timeoutMs = DEFAULT_TIMEOUT * 1000;

        if (elapsedMs > timeoutMs) {
          console.log(`[Scheduler] Stage ${stage.id} (${stage.stageKey}) timed out after ${Math.round(elapsedMs / 1000)}s`);

          // 先更新错误信息（不改变状态）
          const db = queries.getDb();
          db.prepare('UPDATE pipeline_stage_runs SET error = ? WHERE id = ?')
            .run('Execution timeout', stage.id);

          // 通过状态机转换状态
          const { stateMachine } = await import('./statemachine.js');
          await stateMachine.transition('stage', stage.id, 'failed', 'system');
          await stateMachine.transition('pipeline', instance.id, 'failed', 'system');
          await stateMachine.transition('task', instance.taskId, 'failed', 'system');
        }
      }
    }
  }
}

export const pipelineScheduler = new PipelineScheduler();
