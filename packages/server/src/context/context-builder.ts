/**
 * Context Builder - Simplified
 *
 * Builds StepContext for executing a step.
 * Reads shared runtime context from task, plus previous step's output.
 */

import * as queries from '../db/queries.js';
import type { StepContext, StepOutput, StageDefinition } from './types.js';

/**
 * ContextBuilder creates the context for a step execution.
 */
export class ContextBuilder {
  /**
   * Build context for a step execution.
   *
   * @param instanceId - Pipeline instance ID
   * @param stageKey - Current stage key
   * @returns StepContext for the step
   */
  build(
    instanceId: number,
    stageKey: string
  ): StepContext {
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

    // 5. Get instance's runtime context (共享上下文)
    const runtimeContext = queries.getRuntimeContext(instanceId) ?? undefined;

    // 6. Get previous stage's output (保留用于追溯)
    const previousOutput = this.getPreviousOutput(instance, stageKey);

    // 7. Calculate progress
    const currentIndex = instance.stageRuns?.findIndex((sr: any) => sr.stageKey === stageKey) ?? 0;
    const totalStages = instance.stageRuns?.length ?? 1;
    const progress = `${currentIndex + 1}/${totalStages}`;

    return {
      task: {
        id: task?.id ?? 0,
        title: task?.title ?? '',
        description: task?.description ?? '',
      },
      currentStep: {
        key: stageKey,
        label: stageDef?.label ?? stageKey,
        action: stageDef?.action ?? '',
        goal: stageDef?.goal ?? '',
        expectedOutput: stageDef?.expectedOutput ?? [],
        nextStepHint: stageDef?.nextStepHint,
      },
      runtimeContext,
      previousOutput,
      pipeline: {
        templateName: instance.templateName ?? '',
        progress,
      },
    };
  }

  /**
   * Get stage definition from pipeline template.
   */
  private getStageDefinition(instance: any, stageKey: string): StageDefinition | null {
    // Parse stages from template
    const stages = instance.stages || [];
    const stage = stages.find((s: any) => s.key === stageKey);

    if (!stage) return null;

    return {
      key: stage.key,
      label: stage.label,
      action: stage.action,
      agentId: stage.agentId,
      humanRole: stage.humanRole,
      actorType: stage.actorType,
      phaseKey: stage.phaseKey,
      goal: stage.goal ?? this.inferGoal(stage.action, stage.label),
      expectedOutput: stage.expectedOutput ?? this.inferExpectedOutput(stage.action),
      nextStepHint: stage.nextStepHint,
    };
  }

  /**
   * Get previous completed stage's output.
   */
  private getPreviousOutput(instance: any, currentStageKey: string): StepOutput | undefined {
    if (!instance.stageRuns) return undefined;

    // Find current stage index
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

  /**
   * Infer expected output from action type if not defined.
   */
  private inferExpectedOutput(action: string): string[] {
    const outputMap: Record<string, string[]> = {
      analyze: ['需求文档', '核心功能列表'],
      design: ['架构文档', '技术选型'],
      code: ['PR 链接', '代码变更'],
      test: ['测试报告', '覆盖率'],
      review: ['审查意见'],
      document: ['文档链接'],
      deploy: ['部署链接', '版本号'],
      lint: ['Lint 报告'],
      build: ['构建产物'],
      security_scan: ['安全报告'],
      test_e2e: ['测试结果'],
    };

    return outputMap[action] ?? ['产出物'];
  }
}
