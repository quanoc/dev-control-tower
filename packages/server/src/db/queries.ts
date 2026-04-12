import { getDb } from './index.js';
import type {
  Agent,
  SkillEntry,
  Task,
  PipelineTemplate,
  PipelineInstance,
  PipelinePhase,
  PipelineStage,
  StageRun,
  StateTransitionLog,
} from '@pipeline/shared';
import { flattenPhases, groupStagesIntoPhases } from '@pipeline/shared';

// ─── Agent Queries ─────────────────────────────────────────────

export function getAllAgents(): Agent[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM agents ORDER BY id').all() as any[];
  return rows.map(rowToAgent);
}

export function getAgentById(id: string): Agent | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as any;
  return row ? rowToAgent(row) : undefined;
}

export function upsertAgent(agent: Partial<Agent> & { id: string }): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO agents (id, name, role, emoji, description, workspace, agent_dir, skills, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      role = excluded.role,
      emoji = excluded.emoji,
      description = excluded.description,
      workspace = excluded.workspace,
      agent_dir = excluded.agent_dir,
      skills = excluded.skills,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    agent.id,
    agent.name ?? '',
    agent.role ?? '',
    agent.emoji ?? '',
    agent.description ?? '',
    agent.workspace ?? '',
    agent.agentDir ?? '',
    JSON.stringify(agent.skills ?? []),
    agent.status ?? 'idle'
  );
}

export function updateAgentStatus(id: string, status: string, currentTaskId: number | null = null): void {
  const db = getDb();
  db.prepare(
    'UPDATE agents SET status = ?, current_task_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(status, currentTaskId, id);
}

// ─── Task Queries ──────────────────────────────────────────────

export function getAllTasks(status?: string): Task[] {
  const db = getDb();
  let sql = 'SELECT * FROM tasks';
  const params: any[] = [];
  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ' ORDER BY created_at DESC';
  const tasks = (db.prepare(sql).all(...params) as any[]).map(row => {
    const pipeline = getPipelineInstanceByTaskId(row.id);
    return rowToTask(row, pipeline);
  });
  return tasks;
}

export function getTaskById(id: number): Task | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
  if (!row) return undefined;
  const pipeline = getPipelineInstanceByTaskId(id);
  return rowToTask(row, pipeline);
}

export function createTask(title: string, description: string, createdBy = 'human'): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO tasks (title, description, created_by) VALUES (?, ?, ?)'
  ).run(title, description, createdBy);
  return result.lastInsertRowid as number;
}

export function updateTaskStatus(id: number, status: string): void {
  const db = getDb();
  const completedAt = status === 'completed' || status === 'failed' || status === 'cancelled'
    ? new Date().toISOString()
    : null;
  db.prepare(
    'UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP, completed_at = COALESCE(?, completed_at) WHERE id = ?'
  ).run(status, completedAt, id);
}

// ─── Pipeline Template Queries ─────────────────────────────────

export function getAllTemplates(): PipelineTemplate[] {
  const db = getDb();
  return (db.prepare('SELECT * FROM pipeline_templates ORDER BY id').all() as any[]).map(rowToTemplate);
}

export function getTemplateById(id: number): PipelineTemplate | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM pipeline_templates WHERE id = ?').get(id) as any;
  return row ? rowToTemplate(row) : undefined;
}

export function createTemplate(name: string, description: string, phases: PipelinePhase[], complexity: string = 'medium'): number {
  const db = getDb();
  const stages = flattenPhases(phases);
  const result = db.prepare(
    'INSERT INTO pipeline_templates (name, description, phases, stages, complexity) VALUES (?, ?, ?, ?, ?)'
  ).run(name, description, JSON.stringify(phases), JSON.stringify(stages), complexity);
  return result.lastInsertRowid as number;
}

export function updateTemplate(id: number, name: string, description: string, phases: PipelinePhase[], complexity: string = 'medium'): boolean {
  const db = getDb();
  const stages = flattenPhases(phases);
  const result = db.prepare(
    'UPDATE pipeline_templates SET name = ?, description = ?, phases = ?, stages = ?, complexity = ? WHERE id = ?'
  ).run(name, description, JSON.stringify(phases), JSON.stringify(stages), complexity, id);
  return result.changes > 0;
}

export function deleteTemplate(id: number): boolean {
  const db = getDb();
  // Use transaction to delete related records
  db.exec('BEGIN IMMEDIATE');
  try {
    // Disable foreign key checks temporarily
    db.exec('PRAGMA foreign_keys = OFF');

    // First get all instance IDs for this template
    const instances = db.prepare('SELECT id FROM pipeline_instances WHERE template_id = ?').all(id) as { id: number }[];
    const instanceIds = instances.map(i => i.id);

    // Delete stage runs for these instances
    if (instanceIds.length > 0) {
      const placeholders = instanceIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM pipeline_stage_runs WHERE instance_id IN (${placeholders})`).run(...instanceIds);
    }

    // Delete related pipeline instances
    db.prepare('DELETE FROM pipeline_instances WHERE template_id = ?').run(id);

    // Then delete the template
    const result = db.prepare('DELETE FROM pipeline_templates WHERE id = ?').run(id);

    // Re-enable foreign key checks
    db.exec('PRAGMA foreign_keys = ON');

    db.exec('COMMIT');
    return result.changes > 0;
  } catch (err) {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('ROLLBACK');
    throw err;
  }
}

// ─── Pipeline Component Queries ────────────────────────────────

export interface PipelineComponent {
  id: number;
  name: string;
  description: string | null;
  actor_type: string;
  action: string;
  agent_id: string | null;
  human_role: string | null;
  icon: string | null;
  execution: string;
  optional: number;
  created_at: string;
}

export interface ListComponentsResult {
  items: PipelineComponent[];
  total: number;
  page: number;
  limit: number;
}

export function listComponents(options: {
  actorType?: string;
  search?: string;
  page?: number;
  limit?: number;
} = {}): ListComponentsResult {
  const { actorType, search, page = 1, limit = 12 } = options;
  const db = getDb();

  let whereClause = '1=1';
  const params: any[] = [];

  if (actorType && actorType !== 'all') {
    whereClause += ' AND actor_type = ?';
    params.push(actorType);
  }

  if (search) {
    whereClause += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }

  const countResult = db.prepare(`SELECT COUNT(*) as total FROM pipeline_components WHERE ${whereClause}`).get(...params) as { total: number };
  const total = countResult.total;

  const offset = (page - 1) * limit;
  const items = db.prepare(`
    SELECT * FROM pipeline_components
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as PipelineComponent[];

  return { items, total, page, limit };
}

export function getComponentById(id: number): PipelineComponent | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM pipeline_components WHERE id = ?').get(id) as PipelineComponent | undefined;
}

export function createComponent(data: {
  name: string;
  description?: string;
  actor_type: string;
  action: string;
  agent_id?: string;
  human_role?: string;
  icon?: string;
  execution?: string;
  optional?: boolean;
}): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO pipeline_components (name, description, actor_type, action, agent_id, human_role, icon, execution, optional)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name,
    data.description || null,
    data.actor_type,
    data.action,
    data.agent_id || null,
    data.human_role || null,
    data.icon || null,
    data.execution || 'serial',
    data.optional ? 1 : 0
  );
  return result.lastInsertRowid as number;
}

export function updateComponent(id: number, data: {
  name?: string;
  description?: string;
  actor_type?: string;
  action?: string;
  agent_id?: string;
  human_role?: string;
  icon?: string;
  execution?: string;
  optional?: boolean;
}): boolean {
  const db = getDb();
  const existing = getComponentById(id);
  if (!existing) return false;

  const result = db.prepare(`
    UPDATE pipeline_components SET
      name = ?,
      description = ?,
      actor_type = ?,
      action = ?,
      agent_id = ?,
      human_role = ?,
      icon = ?,
      execution = ?,
      optional = ?
    WHERE id = ?
  `).run(
    data.name ?? existing.name,
    data.description ?? existing.description,
    data.actor_type ?? existing.actor_type,
    data.action ?? existing.action,
    data.agent_id ?? existing.agent_id,
    data.human_role ?? existing.human_role,
    data.icon ?? existing.icon,
    data.execution ?? existing.execution,
    data.optional !== undefined ? (data.optional ? 1 : 0) : existing.optional,
    id
  );
  return result.changes > 0;
}

export function deleteComponent(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM pipeline_components WHERE id = ?').run(id);
  return result.changes > 0;
}

// ─── Pipeline Instance Queries ─────────────────────────────────

export function getPipelineInstanceByTaskId(taskId: number): PipelineInstance | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM pipeline_instances WHERE task_id = ?').get(taskId) as any;
  return row ? rowToInstanceWithStages(row) : undefined;
}

export function getPipelineInstanceById(id: number): PipelineInstance | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM pipeline_instances WHERE id = ?').get(id) as any;
  return row ? rowToInstanceWithStages(row) : undefined;
}

export function getAllPipelineInstances(): PipelineInstance[] {
  const db = getDb();
  return (db.prepare(
    'SELECT * FROM pipeline_instances ORDER BY created_at DESC'
  ).all() as any[]).map(rowToInstanceWithStages);
}

export function createPipelineInstance(taskId: number, templateId: number | null, stages: PipelineStage[]): number {
  const db = getDb();
  const txn = db.transaction(() => {
    const instanceResult = db.prepare(
      'INSERT INTO pipeline_instances (task_id, template_id) VALUES (?, ?)'
    ).run(taskId, templateId);
    const instanceId = instanceResult.lastInsertRowid as number;

    const insertStage = db.prepare(
      'INSERT INTO pipeline_stage_runs (instance_id, stage_key, phase_key, step_label, agent_id) VALUES (?, ?, ?, ?, ?)'
    );
    for (const stage of stages) {
      // Provide default agent_id for human/system stages
      const agentId = stage.agentId || stage.humanRole || stage.action || 'system';
      insertStage.run(instanceId, stage.key, stage.phaseKey, stage.label, agentId);
    }

    return instanceId;
  });

  return txn();
}

export function updatePipelineInstanceStatus(id: number, status: string, currentStageIndex?: number): void {
  const db = getDb();
  const completedAt = status === 'completed' || status === 'failed'
    ? new Date().toISOString()
    : null;
  db.prepare(
    'UPDATE pipeline_instances SET status = ?, current_stage_index = COALESCE(?, current_stage_index), completed_at = COALESCE(?, completed_at) WHERE id = ?'
  ).run(status, currentStageIndex, completedAt, id);
}

export function advancePipelineStage(instanceId: number): void {
  const db = getDb();
  db.prepare(
    'UPDATE pipeline_instances SET current_stage_index = current_stage_index + 1 WHERE id = ?'
  ).run(instanceId);
}

// ─── Stage Run Queries ─────────────────────────────────────────

export function getStageRunsByInstanceId(instanceId: number): StageRun[] {
  const db = getDb();
  return (db.prepare(
    'SELECT * FROM pipeline_stage_runs WHERE instance_id = ? ORDER BY id'
  ).all(instanceId) as any[]).map(rowToStageRun);
}

export function getStageRun(instanceId: number, stageKey: string): StageRun | undefined {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM pipeline_stage_runs WHERE instance_id = ? AND stage_key = ?'
  ).get(instanceId, stageKey) as any;
  return row ? rowToStageRun(row) : undefined;
}

export function updateStageRunStatus(id: number, status: string, error?: string): void {
  const db = getDb();
  const now = status === 'running' ? new Date().toISOString() : null;
  const completed = status === 'completed' || status === 'failed' ? new Date().toISOString() : null;
  db.prepare(
    `UPDATE pipeline_stage_runs SET status = ?, started_at = COALESCE(?, started_at),
     completed_at = COALESCE(?, completed_at), error = ? WHERE id = ?`
  ).run(status, now, completed, error ?? null, id);
}

export function setStageRunOutput(id: number, output: string, artifacts: string[] = []): void {
  const db = getDb();
  db.prepare(
    'UPDATE pipeline_stage_runs SET output = ?, artifacts = ?, status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(output, JSON.stringify(artifacts), 'completed', id);
}

export function setStageRunInput(id: number, input: string): void {
  const db = getDb();
  db.prepare('UPDATE pipeline_stage_runs SET input = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(input, id);
}

// ─── State Transition Log Queries ──────────────────────────────

export function logStateTransition(
  entityType: string,
  entityId: number,
  fromState: string | null,
  toState: string,
  triggeredBy: string,
  metadata: Record<string, unknown> | null = null
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO state_transition_log (entity_type, entity_id, from_state, to_state, triggered_by, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(entityType, entityId, fromState, toState, triggeredBy, metadata ? JSON.stringify(metadata) : null);
}

export function getRecentTransitions(limit = 50): StateTransitionLog[] {
  const db = getDb();
  return (db.prepare(
    'SELECT * FROM state_transition_log ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as any[]).map(row => ({
    id: row.id as number,
    entityType: row.entity_type as StateTransitionLog['entityType'],
    entityId: row.entity_id as number,
    fromState: row.from_state as string | null,
    toState: row.to_state as string,
    triggeredBy: row.triggered_by as StateTransitionLog['triggeredBy'],
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
    createdAt: row.created_at as string,
  }));
}

// ─── Row Mappers ───────────────────────────────────────────────

function rowToAgent(row: any): Agent {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    emoji: row.emoji,
    description: row.description,
    workspace: row.workspace,
    agentDir: row.agent_dir,
    skills: JSON.parse(row.skills || '[]') as SkillEntry[],
    status: row.status as Agent['status'],
    currentTaskId: row.current_task_id,
    updatedAt: row.updated_at,
  };
}

function rowToTask(row: any, pipeline?: PipelineInstance | undefined): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdBy: row.created_by,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    pipeline: pipeline || null,
  };
}

function rowToTemplate(row: any): PipelineTemplate {
  // Prefer phases column (nested DSL)
  if (row.phases) {
    const phases: PipelinePhase[] = JSON.parse(row.phases);
    const stages = flattenPhases(phases);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      phases,
      stages,
      complexity: row.complexity || 'medium',
      createdAt: row.created_at,
    };
  }
  // Fallback: flat stages (legacy v1)
  const stages: PipelineStage[] = JSON.parse(row.stages || '[]').map((s: any) => ({
    ...s,
    type: s.type || 'agent_action',
    execution: s.execution || 'serial',
    phaseKey: s.phaseKey || 'development',
  }));
  const phases = groupStagesIntoPhases(stages);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    phases,
    stages,
    complexity: row.complexity || 'medium',
    createdAt: row.created_at,
  };
}

function rowToInstanceWithStages(row: any): PipelineInstance {
  const db = getDb();
  const stageRows = db.prepare(
    'SELECT * FROM pipeline_stage_runs WHERE instance_id = ? ORDER BY id'
  ).all(row.id) as any[];

  // Get template info if template exists
  let templateName: string | undefined;
  let templatePhases: PipelinePhase[] | undefined;
  let templateStages: PipelineStage[] = [];
  if (row.template_id) {
    const template = db.prepare('SELECT name, phases, stages FROM pipeline_templates WHERE id = ?').get(row.template_id) as { name: string; phases: string; stages: string } | undefined;
    if (template) {
      templateName = template.name;
      if (template.phases) {
        templatePhases = JSON.parse(template.phases);
      }
      if (template.stages) {
        templateStages = JSON.parse(template.stages);
      }
    }
  }

  // Create lookup map from template stages
  const stageLookup = new Map(templateStages.map(s => [s.key, s]));

  // Enrich stageRuns with data from template if missing
  const enrichedStageRuns = stageRows.map(sr => {
    const templateStage = stageLookup.get(sr.stage_key);
    return {
      ...rowToStageRun(sr),
      // Use stored value, or fall back to template
      phaseKey: sr.phase_key || templateStage?.phaseKey,
      stepLabel: sr.step_label || templateStage?.label,
    };
  });

  return {
    id: row.id,
    taskId: row.task_id,
    templateId: row.template_id,
    templateName,
    templatePhases,
    status: row.status,
    currentStageIndex: row.current_stage_index,
    stageRuns: enrichedStageRuns,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function rowToStageRun(row: any): StageRun {
  return {
    id: row.id,
    instanceId: row.instance_id,
    stageKey: row.stage_key,
    phaseKey: row.phase_key,
    stepLabel: row.step_label,
    agentId: row.agent_id,
    status: row.status,
    input: row.input,
    output: row.output,
    artifacts: JSON.parse(row.artifacts || '[]'),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    error: row.error,
  };
}
