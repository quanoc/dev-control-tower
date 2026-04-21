/**
 * Context Builder - Layered Context Design
 *
 * Builds StepContext with layered context: Task → Phase → Step
 * Based on InputContract to determine what context to include.
 */

import * as queries from '../db/queries.js';
import type {
  StepContext,
  StepOutput,
  TaskContext,
  PhaseContext,
  StepLevelContext,
} from './types.js';
import type { RuntimeContext, PhaseKey, InputContract, OutputContract } from '@pipeline/shared';

export class ContextBuilder {
  /**
   * Build layered context for a step execution.
   */
  build(instanceId: number, stageKey: string): StepContext {
    // 1. Get pipeline instance
    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Pipeline instance ${instanceId} not found`);
    }

    // 2. Get task info
    const task = instance.taskId ? queries.getTaskById(instance.taskId) : null;

    // 3. Get current stage run
    const currentStageRun = instance.stageRuns?.find((sr: any) => sr.stageKey === stageKey);
    if (!currentStageRun) {
      throw new Error(`Stage run not found for stage ${stageKey}`);
    }

    // 4. Get stage definition from template
    const stageDef = this.getStageDefinition(instance, stageKey);

    // 5. Get instance's runtime context
    const runtimeContext = queries.getRuntimeContext(instanceId) ?? undefined;

    // 6. Build layered context
    const taskContext = this.buildTaskContext(task);
    const phaseContext = this.buildPhaseContext(
      stageDef?.phaseKey,
      runtimeContext
    );
    const stepLevelContext = this.buildStepLevelContext(instance, stageKey);

    // 7. Calculate progress
    const currentIndex = instance.stageRuns?.findIndex((sr: any) => sr.stageKey === stageKey) ?? 0;
    const totalStages = instance.stageRuns?.length ?? 1;
    const progress = `${currentIndex + 1}/${totalStages}`;

    return {
      task: taskContext,
      phase: phaseContext,
      step: stepLevelContext,
      currentStep: {
        key: stageKey,
        label: stageDef?.label ?? stageKey,
        action: stageDef?.action ?? '',
        phaseKey: stageDef?.phaseKey as PhaseKey | undefined,
        goal: stageDef?.goal ?? '',
        criteria: stageDef?.criteria,
        inputContract: stageDef?.inputContract,
        outputContract: stageDef?.outputContract,
      },
      runtimeContext,
      pipeline: {
        templateName: instance.templateName ?? '',
        progress,
      },
    };
  }

  /**
   * Build task-level context (shared across all phases).
   */
  private buildTaskContext(task: any): TaskContext {
    return {
      id: task?.id ?? 0,
      title: task?.title ?? '',
      description: task?.description ?? '',
      background: task?.background,
      constraints: task?.constraints ?? [],
    };
  }

  /**
   * Build phase-level context (shared within the same phase).
   */
  private buildPhaseContext(
    phaseKey: string | undefined,
    runtimeContext: RuntimeContext | undefined
  ): PhaseContext | undefined {
    if (!phaseKey) return undefined;

    // Get phase-level constraints and artifacts from runtime context
    const constraints = runtimeContext?.constraintsByPhase?.[phaseKey] ?? [];
    const artifacts = runtimeContext?.artifactsByPhase?.[phaseKey] ?? [];

    // Get decisions made in this phase
    const decisions = (runtimeContext?.keyDecisions ?? [])
      .filter(d => d.phase === phaseKey)
      .map(d => ({
        from: d.from,
        decision: d.decision,
        reason: d.reason,
      }));

    return {
      key: phaseKey as PhaseKey,
      label: this.getPhaseLabel(phaseKey),
      goal: this.getPhaseGoal(phaseKey),
      constraints,
      decisions,
      artifacts,
    };
  }

  /**
   * Build step-level context (specific to current step).
   */
  private buildStepLevelContext(
    instance: any,
    currentStageKey: string
  ): StepLevelContext {
    const previousOutput = this.getPreviousOutput(instance, currentStageKey);
    const history = this.getStepHistory(instance, currentStageKey);

    return {
      previousOutput,
      history: history.length > 0 ? history : undefined,
    };
  }

  /**
   * Get previous completed stage's output.
   */
  private getPreviousOutput(instance: any, currentStageKey: string): StepOutput | undefined {
    if (!instance.stageRuns) return undefined;

    const currentIndex = instance.stageRuns.findIndex((sr: any) => sr.stageKey === currentStageKey);
    if (currentIndex <= 0) return undefined;

    // Find previous completed stage
    for (let i = currentIndex - 1; i >= 0; i--) {
      const prevStage = instance.stageRuns[i];
      if (prevStage.status === 'completed' && prevStage.structuredOutput) {
        try {
          const output = typeof prevStage.structuredOutput === 'string'
            ? JSON.parse(prevStage.structuredOutput)
            : prevStage.structuredOutput;

          if (output && output.nextStepInput) {
            return {
              artifacts: output.artifacts || [],
              nextStepInput: output.nextStepInput,
            };
          }
        } catch {
          // Failed to parse, continue to earlier stage
        }
      }
    }

    return undefined;
  }

  /**
   * Get step execution history (for retry scenarios).
   */
  private getStepHistory(
    instance: any,
    currentStageKey: string
  ): Array<{ stageKey: string; attempt: number; result: 'success' | 'failure'; error?: string }> {
    if (!instance.stageRuns) return [];

    const currentStage = instance.stageRuns.find((sr: any) => sr.stageKey === currentStageKey);
    if (!currentStage) return [];

    const history: Array<{ stageKey: string; attempt: number; result: 'success' | 'failure'; error?: string }> = [];

    // Check if this step has failed before
    if (currentStage.status === 'failed' || currentStage.error) {
      history.push({
        stageKey: currentStageKey,
        attempt: 1,
        result: 'failure',
        error: currentStage.error,
      });
    }

    return history;
  }

  /**
   * Get stage definition from pipeline template.
   */
  private getStageDefinition(instance: any, stageKey: string): {
    key: string;
    label: string;
    action: string;
    phaseKey?: string;
    goal: string;
    criteria?: string[];
    inputContract?: InputContract;
    outputContract?: OutputContract;
    agentId?: string;
    humanRole?: string;
    actorType: 'agent' | 'human' | 'system';
  } | null {
    const stages = instance.stages || [];
    const stage = stages.find((s: any) => s.key === stageKey);

    if (!stage) return null;

    return {
      key: stage.key,
      label: stage.label,
      action: stage.action,
      phaseKey: stage.phaseKey,
      goal: stage.goal ?? this.inferGoal(stage.action, stage.label),
      criteria: stage.criteria,
      inputContract: stage.inputContract,
      outputContract: stage.outputContract,
      agentId: stage.agentId,
      humanRole: stage.humanRole,
      actorType: stage.actorType || 'agent',
    };
  }

  /**
   * Get phase label.
   */
  private getPhaseLabel(phaseKey: string): string {
    const labels: Record<string, string> = {
      planning: '规划阶段',
      development: '开发阶段',
      testing: '测试阶段',
      deployment: '部署阶段',
      review: '评审阶段',
    };
    return labels[phaseKey] ?? phaseKey;
  }

  /**
   * Get phase goal.
   */
  private getPhaseGoal(phaseKey: string): string {
    const goals: Record<string, string> = {
      planning: '明确需求，制定计划',
      development: '实现功能代码',
      testing: '验证功能正确性',
      deployment: '部署到目标环境',
      review: '审查代码质量',
    };
    return goals[phaseKey] ?? `完成${this.getPhaseLabel(phaseKey)}`;
  }

  /**
   * Infer goal from action type if not defined.
   */
  private inferGoal(action: string, label: string): string {
    const goalMap: Record<string, string> = {
      analyze: '分析需求，输出需求文档',
      design: '设计架构方案，输出架构文档',
      code: '实现功能代码，提交 PR',
      test: '编写并运行测试，输出测试报告',
      review: '审查代码质量，输出审查意见',
      approve: '审批通过或拒绝',
      document: '编写技术文档',
      deploy: '部署到目标环境',
      lint: '检查代码规范',
      build: '构建项目产物',
      security_scan: '扫描安全漏洞',
      test_e2e: '运行端到端测试',
    };

    return goalMap[action] ?? `完成 ${label}`;
  }
}
