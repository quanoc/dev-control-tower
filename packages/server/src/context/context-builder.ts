/**
 * Context Builder
 *
 * Builds ChainContext for agent execution by:
 * 1. Fetching previous stage outputs from database
 * 2. Filtering by dependency rules (only relevant context)
 * 3. Constructing structured ChainContext object
 */

import type { Artifact, ArtifactType } from '../executors/interface';
import type { StageRun } from '@pipeline/shared';
import type {
  ChainContext,
  StructuredOutput,
  StageOutputSummary,
  ContextBuilderConfig,
  ContextDependencyRule,
} from './types';
import { DEFAULT_CONTEXT_CONFIG } from './types';
import { getDependencyRule, getRelevantStageKeys } from './context-dependencies';
import { getDb } from '../db/index';

/**
 * ContextBuilder builds execution context for agents.
 */
export class ContextBuilder {
  private config: ContextBuilderConfig;

  constructor(config?: Partial<ContextBuilderConfig>) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  }

  /**
   * Build ChainContext for a stage execution.
   *
   * @param pipelineInstanceId - Pipeline instance ID
   * @param currentStageKey - The stage being executed
   * @param actionType - The action type for this stage
   * @returns ChainContext ready for agent execution
   */
  async build(
    pipelineInstanceId: number,
    currentStageKey: string,
    actionType: string
  ): Promise<ChainContext> {
    const rule = getDependencyRule(actionType);

    // Fetch all stage runs for this pipeline instance
    const stageRuns = await this.fetchStageRuns(pipelineInstanceId);

    // Filter stage runs by dependency rules
    const relevantOutputs = this.filterByDependency(stageRuns, actionType, rule);

    // Accumulate all artifacts from previous stages
    const accumulatedArtifacts = this.accumulateArtifacts(stageRuns);

    // Fetch approvals if needed
    const approvals = rule.needsApprovals
      ? await this.fetchApprovals(pipelineInstanceId)
      : [];

    // Fetch pipeline info if needed
    const pipelineInfo = rule.needsPipelineInfo
      ? await this.fetchPipelineInfo(pipelineInstanceId)
      : undefined;

    // Fetch task info if needed
    const taskInfo = rule.needsTaskInfo
      ? await this.fetchTaskInfo(pipelineInstanceId)
      : undefined;

    return {
      pipelineInstanceId,
      currentStageKey,
      actionType,
      relevantOutputs,
      accumulatedArtifacts,
      approvals,
      pipelineInfo,
      taskInfo,
    };
  }

  /**
   * Fetch all stage runs for a pipeline instance.
   */
  private async fetchStageRuns(instanceId: number): Promise<StageRun[]> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM pipeline_stage_runs
      WHERE pipeline_instance_id = ?
      ORDER BY created_at ASC
    `).all(instanceId) as any[];

    return rows.map(this.rowToStageRun);
  }

  /**
   * Convert database row to StageRun with structured output parsing.
   */
  private rowToStageRun(row: any): StageRun {
    // Parse structured_output if present
    let structuredOutput: StructuredOutput | null = null;
    if (row.structured_output) {
      try {
        structuredOutput = JSON.parse(row.structured_output);
      } catch {
        structuredOutput = null;
      }
    }

    // Parse artifacts (support both old string[] and new Artifact[])
    let artifacts: Artifact[] = [];
    if (row.artifacts) {
      try {
        const parsed = JSON.parse(row.artifacts);
        if (Array.isArray(parsed)) {
          if (parsed.length > 0 && typeof parsed[0] === 'string') {
            // Old format: string[] - convert to Artifact[]
            artifacts = parsed.map(url => ({
              type: 'other' as ArtifactType,
              url,
            }));
          } else {
            // New format: Artifact[]
            artifacts = parsed;
          }
        }
      } catch {
        artifacts = [];
      }
    }

    return {
      id: row.id,
      instanceId: row.instance_id,
      stageKey: row.stage_key,
      phaseKey: row.phase_key ?? undefined,
      stepLabel: row.step_label ?? undefined,
      agentId: row.agent_id,
      status: row.status,
      input: row.input,
      output: row.output,
      structuredOutput,
      artifacts,
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      error: row.error ?? undefined,
    };
  }

  /**
   * Filter stage runs by dependency rules.
   * Returns StageOutputSummary for relevant stages.
   */
  private filterByDependency(
    stageRuns: StageRun[],
    actionType: string,
    rule: ContextDependencyRule
  ): StageOutputSummary[] {
    const { required, optional } = getRelevantStageKeys(actionType);

    const relevantKeys = [...required, ...optional];
    const summaries: StageOutputSummary[] = [];

    for (const run of stageRuns) {
      // Skip the current stage (we're building context for it)
      if (run.stageKey === rule.actionType) continue;

      // Only include completed or failed stages with output
      if (run.status !== 'completed' && run.status !== 'failed') continue;

      // Check if this stage is relevant
      if (!relevantKeys.includes(run.stageKey)) continue;

      // Build summary
      const summary = this.buildSummary(run, relevantKeys.includes(run.stageKey) && required.includes(run.stageKey));
      summaries.push(summary);
    }

    // Sort by stage key order (required first, then optional)
    return summaries.sort((a, b) => {
      const aRequired = required.includes(a.stageKey);
      const bRequired = required.includes(b.stageKey);
      if (aRequired && !bRequired) return -1;
      if (!aRequired && bRequired) return 1;
      return 0;
    });
  }

  /**
   * Build StageOutputSummary from a StageRun.
   */
  private buildSummary(run: StageRun, isRequired: boolean): StageOutputSummary {
    // If structured output exists, use it directly
    if (run.structuredOutput) {
      return {
        stageKey: run.stageKey,
        stageRunId: run.id,
        status: run.status as 'completed' | 'failed' | 'skipped',
        output: run.structuredOutput,
        completedAt: run.completedAt ?? undefined,
      };
    }

    // Otherwise, build minimal structured output from raw output
    const minimalOutput: StructuredOutput = {
      summary: this.extractMinimalSummary(run.output || ''),
      keyPoints: [],
      decisions: [],
      artifacts: run.artifacts || [],
      rawOutputRef: `stage-${run.id}`,
    };

    return {
      stageKey: run.stageKey,
      stageRunId: run.id,
      status: run.status as 'completed' | 'failed' | 'skipped',
      output: minimalOutput,
      completedAt: run.completedAt ?? undefined,
    };
  }

  /**
   * Extract minimal summary from raw output text.
   */
  private extractMinimalSummary(output: string): string {
    // Truncate to max summary length
    const truncated = output.slice(0, this.config.maxSummaryLength);
    // Remove markdown formatting artifacts
    const cleaned = truncated
      .replace(/```[\w]*\n?/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/\n+/g, ' ')
      .trim();
    return cleaned.slice(0, this.config.maxSummaryLength);
  }

  /**
   * Accumulate all artifacts from completed stages.
   */
  private accumulateArtifacts(stageRuns: StageRun[]): Artifact[] {
    const artifacts: Artifact[] = [];

    for (const run of stageRuns) {
      if (run.status !== 'completed') continue;
      if (run.artifacts && run.artifacts.length > 0) {
        artifacts.push(...run.artifacts);
      }
    }

    return artifacts;
  }

  /**
   * Fetch approval decisions for this pipeline instance.
   */
  private async fetchApprovals(instanceId: number): Promise<Array<{
    stageKey: string;
    approved: boolean;
    comment?: string;
    approvedAt?: string;
  }>> {
    const db = getDb();
    // Query approvals from stage runs with approval action
    const rows = db.prepare(`
      SELECT stage_key, status, output, completed_at
      FROM pipeline_stage_runs
      WHERE pipeline_instance_id = ?
        AND action_type = 'approval'
        AND status IN ('completed', 'failed')
    `).all(instanceId) as any[];

    return rows.map(row => {
      let comment: string | undefined;
      if (row.output) {
        // Try to extract comment from approval output
        const match = row.output.match(/Comment:\s*(.+)/i);
        comment = match ? match[1].trim() : undefined;
      }

      return {
        stageKey: row.stage_key,
        approved: row.status === 'completed',
        comment,
        approvedAt: row.completed_at,
      };
    });
  }

  /**
   * Fetch pipeline instance info.
   */
  private async fetchPipelineInfo(instanceId: number): Promise<{
    name: string;
    description?: string;
    createdAt: string;
  } | undefined> {
    const db = getDb();
    const row = db.prepare(`
      SELECT pi.*, pt.name as template_name, pt.description as template_description
      FROM pipeline_instances pi
      JOIN pipeline_templates pt ON pi.template_id = pt.id
      WHERE pi.id = ?
    `).get(instanceId) as any;

    if (!row) return undefined;

    return {
      name: row.template_name,
      description: row.template_description,
      createdAt: row.created_at,
    };
  }

  /**
   * Fetch task info associated with pipeline instance.
   */
  private async fetchTaskInfo(instanceId: number): Promise<{
    title: string;
    description?: string;
    requirements?: string;
  } | undefined> {
    const db = getDb();
    const row = db.prepare(`
      SELECT title, description, requirements
      FROM tasks
      WHERE pipeline_instance_id = ?
    `).get(instanceId) as any;

    if (!row) return undefined;

    return {
      title: row.title,
      description: row.description,
      requirements: row.requirements,
    };
  }
}