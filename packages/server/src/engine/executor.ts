import { stateMachine } from './statemachine.js';
import * as queries from '../db/queries.js';
import { ExecutorFactory } from '../executors/factory.js';
import type { ExecutionContext, ExecutionResult, Artifact } from '../executors/interface.js';
import type { PipelineInstance, StageRun, Agent } from '@pipeline/shared';
import { PHASES, flattenPhases } from '@pipeline/shared';

// Mock 模式配置：可通过环境变量控制
const MOCK_MODE = process.env.PIPELINE_MOCK_MODE !== 'false';

/**
 * 流水线执行器
 *
 * 设计原则：
 * 1. 状态完全存储在数据库，不依赖内存
 * 2. 幂等执行：同一阶段不会被重复执行
 * 3. 事件驱动：阶段完成后自动推进下一阶段
 */
export class PipelineExecutor {
  /**
   * 启动流水线
   */
  async start(instanceId: number): Promise<void> {
    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Pipeline instance ${instanceId} not found`);
    }

    // 检查当前状态
    if (instance.status !== 'pending') {
      throw new Error(`Pipeline is not pending, current status: ${instance.status}`);
    }

    // 更新状态
    await stateMachine.transition('pipeline', instanceId, 'running', 'system');
    await stateMachine.transition('task', instance.taskId, 'running', 'system');

    console.log(`[Executor] Pipeline ${instanceId} started`);

    // 执行第一个阶段
    await this.executeNextStage(instanceId);
  }

  /**
   * 执行下一个阶段
   */
  async executeNextStage(instanceId: number): Promise<void> {
    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance || instance.status !== 'running') {
      return;
    }

    // 找到下一个待执行的阶段
    const pendingStage = instance.stageRuns.find(sr => sr.status === 'pending');
    if (!pendingStage) {
      // 检查是否有正在运行的阶段
      const runningStage = instance.stageRuns.find(sr => sr.status === 'running');
      if (runningStage) {
        console.log(`[Executor] Pipeline ${instanceId} has running stage: ${runningStage.stageKey}`);
        return;
      }

      // 检查是否全部完成
      const allCompleted = instance.stageRuns.every(
        sr => sr.status === 'completed' || sr.status === 'skipped'
      );
      if (allCompleted) {
        await this.completePipeline(instanceId);
      }
      return;
    }

    // 执行该阶段
    await this.executeStage(instanceId, pendingStage.id);
  }

  /**
   * 执行单个阶段（幂等）
   */
  async executeStage(instanceId: number, stageRunId: number): Promise<void> {
    const stageRun = queries.getStageRunById(stageRunId);
    if (!stageRun) {
      throw new Error(`Stage run ${stageRunId} not found`);
    }

    // 幂等检查：只执行 pending 状态的阶段
    if (stageRun.status !== 'pending') {
      console.log(`[Executor] Stage ${stageRunId} is not pending, current status: ${stageRun.status}`);
      return;
    }

    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Pipeline instance ${instanceId} not found`);
    }

    // 获取阶段元信息
    const meta = this.getStageMeta(instance, stageRun.stageKey);

    // 更新状态为 running
    await stateMachine.transition('stage', stageRunId, 'running', 'system');
    queries.updateStageRunHeartbeat(stageRunId);

    // 更新流水线当前阶段索引
    const stageIndex = instance.stageRuns.findIndex(sr => sr.id === stageRunId);
    queries.updatePipelineInstanceStatus(instanceId, instance.status, stageIndex);

    console.log(`[Executor] Executing stage "${meta.label}" (${meta.phaseKey}) with actor "${meta.actorType}"`);

    // 构建执行上下文
    const task = queries.getTaskById(instance.taskId);
    const context: ExecutionContext = {
      instanceId,
      stageRunId,
      componentId: meta.componentId,
      stageKey: stageRun.stageKey,
      action: meta.action,
      actorType: meta.actorType,
      agentId: meta.agentId,
      humanRole: meta.humanRole,
      input: {
        taskTitle: task?.title,
        taskDescription: task?.description,
      },
      taskContext: task ? {
        title: task.title,
        description: task.description,
      } : undefined,
    };

    try {
      // 获取对应的执行器
      const executor = ExecutorFactory.getExecutor(meta.actorType);

      // 执行（根据 MOCK_MODE 配置决定是否模拟）
      const result = await executor.execute(context, MOCK_MODE);

      // 处理 Human 审批
      if (meta.actorType === 'human' && result.error === 'WAITING_APPROVAL') {
        console.log(`[Executor] Stage "${meta.label}" waiting for approval`);
        await stateMachine.transition('stage', stageRunId, 'waiting_approval', 'system');
        await stateMachine.transition('pipeline', instanceId, 'paused', 'system');
        return;
      }

      if (result.success) {
        await this.handleStageSuccess(instanceId, stageRunId, result.output || '', result.artifacts || []);
      } else {
        await this.handleStageFailure(instanceId, stageRunId, result.error || 'Execution failed');
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.handleStageFailure(instanceId, stageRunId, errorMsg);
    }
  }

  /**
   * 处理阶段执行成功
   */
  private async handleStageSuccess(instanceId: number, stageRunId: number, output: string, artifacts: Artifact[] = []): Promise<void> {
    // 先更新输出和产物（不改变状态）
    const db = queries.getDb();
    db.prepare('UPDATE pipeline_stage_runs SET output = ?, artifacts = ? WHERE id = ?')
      .run(output, JSON.stringify(artifacts), stageRunId);

    // 通过状态机转换状态
    await stateMachine.transition('stage', stageRunId, 'completed', 'system');
    queries.advancePipelineStage(instanceId);

    const artifactSummary = artifacts.length > 0
      ? artifacts.map(a => `${a.type}:${a.url}`).join(', ')
      : 'none';
    console.log(`[Executor] Stage ${stageRunId} completed with artifacts: ${artifactSummary}`);

    // 继续执行下一阶段
    await this.executeNextStage(instanceId);
  }

  /**
   * 处理阶段执行失败
   */
  private async handleStageFailure(instanceId: number, stageRunId: number, error: string): Promise<void> {
    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) return;

    queries.updateStageRunStatus(stageRunId, 'failed', error);
    await stateMachine.transition('stage', stageRunId, 'failed', 'system');
    await stateMachine.transition('pipeline', instanceId, 'failed', 'system');
    await stateMachine.transition('task', instance.taskId, 'failed', 'system');

    console.error(`[Executor] Stage ${stageRunId} failed: ${error}`);
  }

  /**
   * 完成流水线
   */
  private async completePipeline(instanceId: number): Promise<void> {
    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) return;

    await stateMachine.transition('pipeline', instanceId, 'completed', 'system');
    await stateMachine.transition('task', instance.taskId, 'completed', 'system');

    console.log(`[Executor] Pipeline ${instanceId} completed`);
  }

  /**
   * 审批通过
   */
  async approveStage(instanceId: number, stageRunId: number, comment?: string): Promise<void> {
    const stageRun = queries.getStageRunById(stageRunId);
    if (!stageRun) {
      throw new Error(`Stage run ${stageRunId} not found`);
    }
    if (stageRun.status !== 'waiting_approval') {
      throw new Error(`Stage is not waiting for approval, current status: ${stageRun.status}`);
    }

    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Pipeline instance ${instanceId} not found`);
    }

    // 完成该阶段
    const output = comment ? `Approved: ${comment}` : 'Approved by human';

    // 先更新输出（不改变状态）
    const db = queries.getDb();
    db.prepare('UPDATE pipeline_stage_runs SET output = ? WHERE id = ?').run(output, stageRunId);

    // 通过状态机转换状态
    await stateMachine.transition('stage', stageRunId, 'completed', 'human');
    queries.advancePipelineStage(instanceId);

    console.log(`[Executor] Stage ${stageRunId} approved`);

    // 恢复流水线
    if (instance.status === 'paused') {
      await stateMachine.transition('pipeline', instanceId, 'running', 'human');
      // 继续执行下一阶段
      await this.executeNextStage(instanceId);
    }
  }

  /**
   * 审批拒绝
   */
  async rejectStage(instanceId: number, stageRunId: number, comment?: string): Promise<void> {
    const stageRun = queries.getStageRunById(stageRunId);
    if (!stageRun) {
      throw new Error(`Stage run ${stageRunId} not found`);
    }
    if (stageRun.status !== 'waiting_approval') {
      throw new Error(`Stage is not waiting for approval, current status: ${stageRun.status}`);
    }

    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Pipeline instance ${instanceId} not found`);
    }

    // 标记失败
    const error = comment ? `Rejected: ${comment}` : 'Rejected by human';
    await this.handleStageFailure(instanceId, stageRunId, error);
  }

  /**
   * 重试失败阶段
   */
  async retryStage(instanceId: number, stageRunId: number): Promise<void> {
    const stageRun = queries.getStageRunById(stageRunId);
    if (!stageRun) {
      throw new Error(`Stage run ${stageRunId} not found`);
    }
    if (stageRun.status !== 'failed') {
      throw new Error(`Stage is not failed, current status: ${stageRun.status}`);
    }

    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Pipeline instance ${instanceId} not found`);
    }

    // 重置状态
    await stateMachine.transition('stage', stageRunId, 'pending', 'human');

    // 恢复流水线
    if (instance.status === 'failed') {
      await stateMachine.transition('pipeline', instanceId, 'running', 'human');
      await stateMachine.transition('task', instance.taskId, 'running', 'human');
    }

    console.log(`[Executor] Retrying stage ${stageRunId}`);

    // 重新执行
    await this.executeStage(instanceId, stageRunId);
  }

  /**
   * 跳过失败阶段
   */
  async skipStage(instanceId: number, stageRunId: number): Promise<void> {
    const stageRun = queries.getStageRunById(stageRunId);
    if (!stageRun) {
      throw new Error(`Stage run ${stageRunId} not found`);
    }
    if (stageRun.status !== 'failed') {
      throw new Error(`Stage is not failed, current status: ${stageRun.status}`);
    }

    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Pipeline instance ${instanceId} not found`);
    }

    // 标记跳过
    queries.updateStageRunStatus(stageRunId, 'skipped', 'Skipped by human');
    await stateMachine.transition('stage', stageRunId, 'skipped', 'human');
    queries.advancePipelineStage(instanceId);

    console.log(`[Executor] Stage ${stageRunId} skipped`);

    // 恢复流水线
    if (instance.status === 'failed') {
      await stateMachine.transition('pipeline', instanceId, 'running', 'human');
      await stateMachine.transition('task', instance.taskId, 'running', 'human');
    }

    // 继续执行下一阶段
    await this.executeNextStage(instanceId);
  }

  /**
   * 停止流水线
   */
  async stop(instanceId: number): Promise<void> {
    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) return;

    // 将 running 状态的阶段重置为 pending
    for (const stage of instance.stageRuns) {
      if (stage.status === 'running') {
        queries.updateStageRunStatus(stage.id, 'pending');
      }
    }

    await stateMachine.transition('pipeline', instanceId, 'cancelled', 'human');

    console.log(`[Executor] Pipeline ${instanceId} stopped`);
  }

  /**
   * 暂停流水线
   * 当前步骤会继续执行完成，后续步骤暂停
   */
  async pause(instanceId: number): Promise<void> {
    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Pipeline instance ${instanceId} not found`);
    }

    if (instance.status !== 'running') {
      throw new Error(`Pipeline is not running, current status: ${instance.status}`);
    }

    await stateMachine.transition('pipeline', instanceId, 'paused', 'human');

    console.log(`[Executor] Pipeline ${instanceId} paused`);
  }

  /**
   * 继续流水线
   */
  async resume(instanceId: number): Promise<void> {
    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Pipeline instance ${instanceId} not found`);
    }

    if (instance.status !== 'paused') {
      throw new Error(`Pipeline is not paused, current status: ${instance.status}`);
    }

    await stateMachine.transition('pipeline', instanceId, 'running', 'human');

    console.log(`[Executor] Pipeline ${instanceId} resumed`);

    // 继续执行下一阶段
    await this.executeNextStage(instanceId);
  }

  /**
   * 重拾 Step
   * 从指定 step 重新执行，该 step 及后续所有步骤状态改为 pending
   */
  async retryFrom(instanceId: number, stageKey: string): Promise<void> {
    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Pipeline instance ${instanceId} not found`);
    }

    // 找到指定 step 的索引
    const targetIndex = instance.stageRuns.findIndex(sr => sr.stageKey === stageKey);
    if (targetIndex === -1) {
      throw new Error(`Stage "${stageKey}" not found in pipeline`);
    }

    // 该 step 及后续所有步骤状态改为 pending
    for (let i = targetIndex; i < instance.stageRuns.length; i++) {
      const stage = instance.stageRuns[i];
      // 只重置非 pending 的步骤
      if (stage.status !== 'pending') {
        await stateMachine.transition('stage', stage.id, 'pending', 'human');
      }
    }

    // 流水线状态改为 running
    if (instance.status !== 'running') {
      await stateMachine.transition('pipeline', instanceId, 'running', 'human');
      await stateMachine.transition('task', instance.taskId, 'running', 'human');
    }

    console.log(`[Executor] Pipeline ${instanceId} retrying from stage "${stageKey}"`);

    // 执行该 step
    await this.executeStage(instanceId, instance.stageRuns[targetIndex].id);
  }

  /**
   * 获取流水线进度
   */
  getProgress(instanceId: number): {
    instanceId: number;
    status: string;
    currentStage: string | null;
    totalStages: number;
    completedStages: number;
    failedStages: number;
    stages: Array<{
      key: string;
      label: string;
      status: string;
    }>;
  } | null {
    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) return null;

    const completedCount = instance.stageRuns.filter(
      sr => sr.status === 'completed' || sr.status === 'skipped'
    ).length;
    const failedCount = instance.stageRuns.filter(sr => sr.status === 'failed').length;

    const currentStage = instance.stageRuns.find(sr =>
      sr.status === 'running' || sr.status === 'waiting_approval'
    );

    return {
      instanceId,
      status: instance.status,
      currentStage: currentStage?.stageKey || null,
      totalStages: instance.stageRuns.length,
      completedStages: completedCount,
      failedStages: failedCount,
      stages: instance.stageRuns.map(sr => ({
        key: sr.stageKey,
        label: sr.stepLabel || sr.stageKey,
        status: sr.status,
      })),
    };
  }

  /**
   * 获取阶段元信息
   */
  private getStageMeta(instance: PipelineInstance, stageKey: string): {
    label: string;
    phaseKey: string;
    actorType: 'agent' | 'human' | 'system';
    action: string;
    agentId?: string;
    humanRole?: string;
    componentId?: number;
  } {
    // 从模板中查找阶段定义
    const templateStages = instance.templatePhases
      ? flattenPhases(instance.templatePhases)
      : [];

    const stageDef = templateStages.find(s => s.key === stageKey);

    if (stageDef) {
      return {
        label: stageDef.label,
        phaseKey: stageDef.phaseKey || 'development',
        actorType: stageDef.actorType,
        action: stageDef.action,
        agentId: stageDef.agentId,
        humanRole: stageDef.humanRole,
        componentId: stageDef.componentId,
      };
    }

    // 从 stageRun 中获取信息
    const stageRun = instance.stageRuns.find(sr => sr.stageKey === stageKey);
    if (stageRun) {
      return {
        label: stageRun.stepLabel || stageKey,
        phaseKey: stageRun.phaseKey || 'development',
        actorType: 'agent', // 默认
        action: stageKey,
        agentId: stageRun.agentId,
      };
    }

    // 默认值
    return {
      label: stageKey,
      phaseKey: 'development',
      actorType: 'agent',
      action: stageKey,
    };
  }
}

export const pipelineExecutor = new PipelineExecutor();
