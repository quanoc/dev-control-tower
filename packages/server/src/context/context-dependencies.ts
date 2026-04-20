/**
 * Context Dependency Rules
 *
 * Defines what context each action type needs from previous pipeline stages.
 * This ensures agents receive only relevant context, not full history.
 */

import type { ContextDependencyRule } from './types';

/**
 * Mapping of action types to their context dependency rules.
 */
export const CONTEXT_DEPENDENCY_RULES: Record<string, ContextDependencyRule> = {
  // Requirements Analysis - only needs task info and pipeline info
  requirements_analysis: {
    actionType: 'requirements_analysis',
    requiredOutputs: [],
    optionalOutputs: [],
    needsAccumulatedArtifacts: false,
    needsApprovals: false,
    needsTaskInfo: true,
    needsPipelineInfo: true,
    maxContextTokens: 500,
  },

  // Architecture Design - needs requirements analysis output
  architecture_design: {
    actionType: 'architecture_design',
    requiredOutputs: ['requirements_analysis'],
    optionalOutputs: [],
    needsAccumulatedArtifacts: false,
    needsApprovals: false,
    needsTaskInfo: true,
    needsPipelineInfo: true,
    maxContextTokens: 1500,
  },

  // Technical Design - needs architecture + requirements
  tech_design: {
    actionType: 'tech_design',
    requiredOutputs: ['architecture_design', 'requirements_analysis'],
    optionalOutputs: [],
    needsAccumulatedArtifacts: true,
    needsApprovals: false,
    needsTaskInfo: true,
    needsPipelineInfo: true,
    maxContextTokens: 2000,
  },

  // Code - needs tech design + architecture + requirements
  code: {
    actionType: 'code',
    requiredOutputs: ['tech_design', 'architecture_design', 'requirements_analysis'],
    optionalOutputs: [],
    needsAccumulatedArtifacts: true,
    needsApprovals: true,
    needsTaskInfo: true,
    needsPipelineInfo: true,
    maxContextTokens: 3000,
  },

  // Code Review - needs code + tech design
  code_review: {
    actionType: 'code_review',
    requiredOutputs: ['code'],
    optionalOutputs: ['tech_design', 'architecture_design'],
    needsAccumulatedArtifacts: true,
    needsApprovals: true,
    needsTaskInfo: false,
    needsPipelineInfo: false,
    maxContextTokens: 2000,
  },

  // Unit Test - needs code + architecture for API understanding
  unit_test: {
    actionType: 'unit_test',
    requiredOutputs: ['code'],
    optionalOutputs: ['architecture_design'],
    needsAccumulatedArtifacts: true,
    needsApprovals: true,
    needsTaskInfo: false,
    needsPipelineInfo: false,
    maxContextTokens: 2000,
  },

  // Integration Test - needs code + unit test
  integration_test: {
    actionType: 'integration_test',
    requiredOutputs: ['code', 'unit_test'],
    optionalOutputs: ['architecture_design'],
    needsAccumulatedArtifacts: true,
    needsApprovals: true,
    needsTaskInfo: false,
    needsPipelineInfo: false,
    maxContextTokens: 2000,
  },

  // Lint - needs code
  lint: {
    actionType: 'lint',
    requiredOutputs: ['code'],
    optionalOutputs: [],
    needsAccumulatedArtifacts: true,
    needsApprovals: false,
    needsTaskInfo: false,
    needsPipelineInfo: false,
    maxContextTokens: 500,
  },

  // Build - needs code + lint report
  build: {
    actionType: 'build',
    requiredOutputs: ['code'],
    optionalOutputs: ['lint'],
    needsAccumulatedArtifacts: true,
    needsApprovals: false,
    needsTaskInfo: false,
    needsPipelineInfo: false,
    maxContextTokens: 500,
  },

  // Security Scan - needs code + architecture
  security_scan: {
    actionType: 'security_scan',
    requiredOutputs: ['code'],
    optionalOutputs: ['architecture_design'],
    needsAccumulatedArtifacts: true,
    needsApprovals: true,
    needsTaskInfo: false,
    needsPipelineInfo: false,
    maxContextTokens: 1500,
  },

  // Deploy - needs code + tests + security scan
  deploy: {
    actionType: 'deploy',
    requiredOutputs: ['code', 'unit_test', 'integration_test', 'security_scan'],
    optionalOutputs: ['build', 'lint'],
    needsAccumulatedArtifacts: true,
    needsApprovals: true,
    needsTaskInfo: true,
    needsPipelineInfo: true,
    maxContextTokens: 2500,
  },

  // Documentation - needs code + architecture + requirements
  documentation: {
    actionType: 'documentation',
    requiredOutputs: ['code'],
    optionalOutputs: ['architecture_design', 'requirements_analysis'],
    needsAccumulatedArtifacts: true,
    needsApprovals: false,
    needsTaskInfo: true,
    needsPipelineInfo: true,
    maxContextTokens: 2000,
  },

  // Approval - minimal context, just current stage output
  approval: {
    actionType: 'approval',
    requiredOutputs: [],
    optionalOutputs: [],
    needsAccumulatedArtifacts: false,
    needsApprovals: false,
    needsTaskInfo: true,
    needsPipelineInfo: true,
    maxContextTokens: 500,
  },

  // Default fallback for unknown action types
  _default: {
    actionType: '_default',
    requiredOutputs: [],
    optionalOutputs: [],
    needsAccumulatedArtifacts: true,
    needsApprovals: true,
    needsTaskInfo: true,
    needsPipelineInfo: true,
    maxContextTokens: 1500,
  },
};

/**
 * Get the dependency rule for a given action type.
 */
export function getDependencyRule(actionType: string): ContextDependencyRule {
  return CONTEXT_DEPENDENCY_RULES[actionType] || CONTEXT_DEPENDENCY_RULES._default;
}

/**
 * Check if a stage output is required for a given action type.
 */
export function isOutputRequired(
  actionType: string,
  stageKey: string
): boolean {
  const rule = getDependencyRule(actionType);
  return rule.requiredOutputs.includes(stageKey);
}

/**
 * Check if a stage output is optional for a given action type.
 */
export function isOutputOptional(
  actionType: string,
  stageKey: string
): boolean {
  const rule = getDependencyRule(actionType);
  return rule.optionalOutputs?.includes(stageKey) ?? false;
}

/**
 * Get all stage keys that should be passed to an action.
 */
export function getRelevantStageKeys(actionType: string): {
  required: string[];
  optional: string[];
} {
  const rule = getDependencyRule(actionType);
  return {
    required: rule.requiredOutputs,
    optional: rule.optionalOutputs ?? [],
  };
}

/**
 * Get all supported action types.
 */
export function getSupportedActionTypes(): string[] {
  return Object.keys(CONTEXT_DEPENDENCY_RULES).filter(k => k !== '_default');
}