/**
 * Context Types - Layered Context Design
 *
 * Supports layered context: Task → Phase → Step
 * Each step has clear input/output contracts.
 */

import type { Artifact } from '../executors/interface';
import type { RuntimeContext, InputContract, OutputContract, PhaseKey } from '@pipeline/shared';

// ─── Step Output Types ───────────────────────────────────────────

/**
 * Information passed to the next step.
 * The agent decides what's relevant for the next step.
 */
export interface NextStepInput {
  /** One-line summary of what was done */
  summary: string;

  /** Key deliverables/outputs for the next step */
  keyPoints?: string[];

  /** Decisions made that affect downstream steps */
  decisions?: Array<{
    decision: string;
    reason?: string;
  }>;

  /** Recommendations for the next step */
  recommendations?: string[];

  /** Any additional context (flexible) */
  [key: string]: unknown;
}

/**
 * Structured output from a step execution.
 * Agent outputs this format directly.
 */
export interface StepOutput {
  /** Artifacts produced (docs, PRs, deployments) */
  artifacts: Artifact[];

  /** Information for the next step */
  nextStepInput: NextStepInput;
}

// ─── Layered Context Types ────────────────────────────────────────

/**
 * 任务级上下文：所有 Agent 共享
 */
export interface TaskContext {
  id: number;
  title: string;
  description: string;
  background?: string;
  constraints: string[];
}

/**
 * 阶段级上下文：同一 Phase 内共享
 */
export interface PhaseContext {
  key: PhaseKey;
  label: string;
  goal: string;
  constraints: string[];
  decisions: Array<{
    from: string;
    decision: string;
    reason?: string;
  }>;
  artifacts: Artifact[];
}

/**
 * 步骤级上下文：仅当前 Step
 */
export interface StepLevelContext {
  /** 直接前序输出 */
  previousOutput?: StepOutput;
  /** 历史记录（如评审失败记录） */
  history?: Array<{
    stageKey: string;
    attempt: number;
    result: 'success' | 'failure';
    error?: string;
  }>;
}

/**
 * Context for executing a step.
 * Contains layered context: Task → Phase → Step
 */
export interface StepContext {
  /** 任务级上下文 */
  task: TaskContext;

  /** 阶段级上下文 */
  phase?: PhaseContext;

  /** 步骤级上下文 */
  step: StepLevelContext;

  /** 当前步骤信息 */
  currentStep: {
    key: string;
    label: string;
    action: string;
    phaseKey?: PhaseKey;
    goal: string;
    criteria?: string[];
    inputContract?: InputContract;
    outputContract?: OutputContract;
  };

  /** 共享上下文（完整引用） */
  runtimeContext?: RuntimeContext;

  /** Pipeline info */
  pipeline: {
    templateName: string;
    progress: string;
  };
}

// ─── Parsing Types ────────────────────────────────────────────────

/**
 * Parsed result from agent output.
 */
export interface ParsedOutput {
  /** Successfully parsed structured output */
  output: StepOutput | null;

  /** Raw output if parsing failed */
  rawOutput: string;

  /** Whether parsing succeeded */
  success: boolean;

  /** Error message if parsing failed */
  error?: string;

  /** Validation errors if output contract violated */
  validationErrors?: string[];
}

// ─── Stage Definition ─────────────────────────────────────────────

/**
 * Stage definition with goal and contracts.
 */
export interface StageDefinition {
  key: string;
  label: string;
  action: string;
  agentId?: string;
  humanRole?: string;
  actorType: 'agent' | 'human' | 'system';
  phaseKey?: PhaseKey;

  /** Goal for this step */
  goal: string;

  /** Input contract */
  inputContract?: InputContract;

  /** Output contract */
  outputContract?: OutputContract;

  /** Review/execution criteria */
  criteria?: string[];
}
