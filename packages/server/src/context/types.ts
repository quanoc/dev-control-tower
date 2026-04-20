/**
 * Context Types - Simplified
 *
 * Each step produces structured output with artifacts and info for the next step.
 */

import type { Artifact } from '../executors/interface';
import type { RuntimeContext } from '@pipeline/shared';

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

/**
 * Context for executing a step.
 * Contains task info, shared context, and previous step's output.
 */
export interface StepContext {
  /** Task information */
  task: {
    id: number;
    title: string;
    description: string;
  };

  /** Current step info */
  currentStep: {
    key: string;
    label: string;
    action: string;
    goal: string;
    expectedOutput: string[];
    nextStepHint?: string;
  };

  /** 任务级别的共享上下文（优先使用） */
  runtimeContext?: RuntimeContext;

  /** Previous step's output (保留用于追溯) */
  previousOutput?: StepOutput;

  /** Pipeline info */
  pipeline: {
    templateName: string;
    progress: string; // e.g., "2/5"
  };
}

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
}

/**
 * Stage definition with goal and expected output.
 */
export interface StageDefinition {
  key: string;
  label: string;
  action: string;
  agentId?: string;
  humanRole?: string;
  actorType: 'agent' | 'human' | 'system';
  phaseKey?: string;

  /** Goal for this step */
  goal: string;

  /** Expected output format hints */
  expectedOutput: string[];

  /** Hint for what info to provide to next step */
  nextStepHint?: string;
}
