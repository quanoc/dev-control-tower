/**
 * Context Builder Types
 *
 * Defines the interfaces for structured context passing between pipeline stages.
 */

import type { Artifact, ArtifactType } from '../executors/interface';

/**
 * Structured output from a pipeline stage execution.
 * This is the format stored in database and passed to subsequent stages.
 */
export interface StructuredOutput {
  /** Concise summary of what was accomplished (max 200 characters) */
  summary: string;

  /** Key points extracted from output (max 5 items) */
  keyPoints: string[];

  /** Decisions made during execution */
  decisions: Array<{
    decision: string;
    reason: string;
    impact?: string;
  }>;

  /** Risks identified (optional) */
  risks?: string[];

  /** Artifacts produced (PRs, documents, reports, etc.) */
  artifacts: Artifact[];

  /** Raw output reference (file path or truncated content, for debugging) */
  rawOutputRef?: string;
}

/**
 * Summary of a stage output for context building.
 * Used when passing context to subsequent stages.
 */
export interface StageOutputSummary {
  /** Stage key (e.g., 'requirements_analysis', 'code') */
  stageKey: string;

  /** Stage run ID */
  stageRunId: number;

  /** Execution status */
  status: 'completed' | 'failed' | 'skipped';

  /** Structured output */
  output: StructuredOutput;

  /** When this stage completed */
  completedAt?: string;
}

/**
 * Context passed to an agent for execution.
 * Contains relevant previous outputs filtered by dependency rules.
 */
export interface ChainContext {
  /** Pipeline instance ID */
  pipelineInstanceId: number;

  /** Current stage key being executed */
  currentStageKey: string;

  /** Action type being executed */
  actionType: string;

  /** Relevant previous stage outputs (filtered by dependency rules) */
  relevantOutputs: StageOutputSummary[];

  /** All accumulated artifacts from previous stages */
  accumulatedArtifacts: Artifact[];

  /** Approval decisions from previous stages */
  approvals: Array<{
    stageKey: string;
    approved: boolean;
    comment?: string;
    approvedAt?: string;
  }>;

  /** Pipeline metadata */
  pipelineInfo?: {
    name: string;
    description?: string;
    createdAt: string;
  };

  /** Task information (if associated) */
  taskInfo?: {
    title: string;
    description?: string;
    requirements?: string;
  };
}

/**
 * Dependency rule defining what context a stage/action needs.
 */
export interface ContextDependencyRule {
  /** The action type this rule applies to */
  actionType: string;

  /** Stage keys whose outputs are required */
  requiredOutputs: string[];

  /** Stage keys whose outputs are optional but helpful */
  optionalOutputs?: string[];

  /** Whether accumulated artifacts are needed */
  needsAccumulatedArtifacts: boolean;

  /** Whether approval history is needed */
  needsApprovals: boolean;

  /** Whether task info is needed */
  needsTaskInfo: boolean;

  /** Whether pipeline info is needed */
  needsPipelineInfo: boolean;

  /** Maximum tokens for context section (approximate) */
  maxContextTokens?: number;
}

/**
 * Result of parsing agent output into structured format.
 */
export interface ParsedOutput {
  /** Successfully parsed structured output */
  structured: StructuredOutput;

  /** Confidence level of parsing (0-1) */
  confidence: number;

  /** Parsing warnings (e.g., couldn't extract some fields) */
  warnings: string[];
}

/**
 * Configuration for context building.
 */
export interface ContextBuilderConfig {
  /** Maximum number of key points to extract */
  maxKeyPoints: number;

  /** Maximum summary length in characters */
  maxSummaryLength: number;

  /** Whether to include raw output reference */
  includeRawOutputRef: boolean;

  /** Default max context tokens */
  defaultMaxContextTokens: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONTEXT_CONFIG: ContextBuilderConfig = {
  maxKeyPoints: 5,
  maxSummaryLength: 200,
  includeRawOutputRef: true,
  defaultMaxContextTokens: 2000,
};