// Shared type definitions for the AI Pipeline Dashboard
// Two-level pipeline DSL: phases (level 1) → steps (level 2)

// ─── Agent Types ───────────────────────────────────────────────

export type AgentStatus = 'idle' | 'busy' | 'error' | 'offline';
export type AgentSource = 'openclaw' | 'claude' | 'custom';
export type AgentModel = 'sonnet' | 'opus' | 'haiku';

export interface Agent {
  id: string;
  name: string;
  role: string;
  emoji: string;
  description: string;
  workspace: string;
  agentDir: string;
  skills: SkillEntry[];
  status: AgentStatus;
  currentTaskId: number | null;
  updatedAt: string;
  // Extended fields for multi-agent support
  source?: AgentSource;
  model?: AgentModel;
  systemPrompt?: string;
  tools?: string[];
  icon?: string;
  tags?: string[];
}

export interface SkillEntry {
  id: string;
  name: string;
  enabled: boolean;
}

// ─── Task Types ────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: number;
  title: string;
  description: string;
  createdBy: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  pipeline: PipelineInstance | null;
}

// ─── Pipeline Types ────────────────────────────────────────────

/** Actor who performs the step */
export type ActorType = 'agent' | 'human' | 'system';

/** Agent-driven action types */
export type AgentActionType =
  | 'analyze'       // 需求/技术分析
  | 'design'        // 架构/技术设计
  | 'code'          // 代码开发
  | 'review'        // 代码/方案评审
  | 'test'          // 测试执行
  | 'document'      // 文档生成
  | 'deploy';       // 部署操作

/** Human gate types */
export type HumanGateType =
  | 'approve'       // 审批（阻断式，必须通过）
  | 'review';       // 评审（提出意见，可选阻断）

/** System automated flow types */
export type SystemFlowType =
  | 'lint'          // 代码检查
  | 'build'         // 构建编译
  | 'security_scan' // 安全扫描
  | 'test_e2e'      // E2E 测试
  | 'code_pull'     // 代码拉取
  | 'code_merge';   // 代码合并

/** Project complexity levels */
export type PipelineComplexity = 'small' | 'medium' | 'large';

// ─── Phase Types (Level 1) ─────────────────────────────────────

/**
 * Phase = 研发过程的第一层（需求阶段、设计阶段、开发阶段、测试阶段、上线阶段）
 * Phases execute strictly in order (serial between phases).
 */
/** Standard phase keys */
export type StandardPhaseKey = 'requirements' | 'design' | 'development' | 'testing' | 'deployment';
/** PhaseKey supports standard keys + custom user-defined keys */
export type PhaseKey = StandardPhaseKey | (string & {});

export interface PhaseDef {
  key: PhaseKey;
  label: string;
  icon: string;
  color: string;
  description: string;
}

export const PHASES: PhaseDef[] = [
  { key: 'requirements',  label: '需求阶段', icon: '📊', color: 'purple',  description: '需求分析、拆解和评审' },
  { key: 'design',        label: '设计阶段', icon: '🏗️', color: 'cyan',    description: '前端设计、架构设计' },
  { key: 'development',   label: '开发阶段', icon: '💻', color: 'emerald', description: '编码实现' },
  { key: 'testing',       label: '测试阶段', icon: '🧪', color: 'amber',   description: '单元测试、集成测试、接口测试' },
  { key: 'deployment',    label: '上线阶段', icon: '🚀', color: 'blue',    description: '部署和上线' },
];

export const PHASE_BY_KEY = new Map(PHASES.map(p => [p.key, p]));

export const STANDARD_PHASE_KEYS = new Set(PHASES.map(p => p.key));

export function isStandardPhase(key: string): boolean {
  return STANDARD_PHASE_KEYS.has(key);
}

export function getPhaseDef(key: string): PhaseDef | undefined {
  return PHASE_BY_KEY.get(key as StandardPhaseKey);
}

/** Create a custom phase definition */
export function customPhase(key: string, label: string, icon = '📌', color = 'gray'): PhaseDef {
  return { key, label, icon, color, description: label };
}

// ─── Pipeline Step (Level 2) ───────────────────────────────────

/** How steps within a phase are executed */
export type ExecutionMode = 'serial' | 'parallel';

/**
 * PipelineStep = a single executable unit within a phase.
 * Each step is performed by an actor (agent, human, or system).
 * Step can optionally reference a reusable pipeline component.
 */
export interface PipelineStep {
  key: string;
  label: string;
  actorType: ActorType;
  action: AgentActionType | HumanGateType | SystemFlowType;
  agentId?: string;
  humanRole?: string;
  optional: boolean;
  icon: string;
  /** Optional reference to a reusable pipeline component */
  componentId?: number;
}

// ─── Pipeline Phase (Level 1 container) ────────────────────────

/**
 * PipelinePhase = a group of steps within a phase of the R&D workflow.
 * Steps are executed in batches: steps within a batch execute in parallel,
 * batches execute sequentially (serially).
 */
export interface PipelinePhase {
  phaseKey: PhaseKey;
  label: string;
  icon: string;
  steps: PipelineStep[];
  /**
   * Batch configuration: each number represents how many steps are in that batch.
   * Steps within a batch execute in parallel, batches execute serially.
   * Example: [2, 1, 3] means: 2 parallel → 1 serial → 3 parallel
   * If not specified, defaults to all steps serial: [1, 1, 1, ...]
   */
  batches?: number[];
}

// ─── Flattened Stage (for executor / backward compat) ──────────

/**
 * Flattened representation of a PipelineStep with phase context.
 * Used by the executor and for backward compatibility.
 */
export interface PipelineStage {
  key: string;
  label: string;
  actorType: ActorType;
  action: AgentActionType | HumanGateType | SystemFlowType;
  agentId?: string;
  humanRole?: string;
  optional: boolean;
  icon: string;
  phaseKey: PhaseKey;
  /** Batch index this stage belongs to within its phase */
  batchIndex?: number;
  // ─── Backward compatibility (legacy v1 fields) ───────────
  /** @deprecated Use actorType + action instead */
  type?: 'agent_action' | 'human_approval' | 'fixed_flow';
  /** @deprecated Use agentId instead */
  approverRole?: string;
  /** @deprecated Use action instead */
  flowKey?: string;
  /** @deprecated Phase-level batches configuration */
  execution?: ExecutionMode;
}

/** Flatten nested phases to a serializable stage list for executor */
export function flattenPhases(phases: PipelinePhase[]): PipelineStage[] {
  const stages: PipelineStage[] = [];
  for (const phase of phases) {
    const batches = phase.batches || phase.steps.map(() => 1); // Default: all serial
    let stepIdx = 0;
    let batchIdx = 0;
    for (const batchSize of batches) {
      for (let i = 0; i < batchSize && stepIdx < phase.steps.length; i++) {
        const step = phase.steps[stepIdx++];
        stages.push({ ...step, phaseKey: phase.phaseKey, batchIndex: batchIdx });
      }
      batchIdx++;
    }
  }
  return stages;
}

/** Group flat stages back into phases for editing */
export function groupStagesIntoPhases(stages: PipelineStage[]): PipelinePhase[] {
  const phaseMap = new Map<PhaseKey, { steps: PipelineStep[]; batches: number[] }>();

  for (const stage of stages) {
    if (!phaseMap.has(stage.phaseKey)) {
      phaseMap.set(stage.phaseKey, { steps: [], batches: [] });
    }
    const group = phaseMap.get(stage.phaseKey)!;
    const { phaseKey, batchIndex, execution, ...step } = stage;
    group.steps.push(step as PipelineStep);
    // Track batch indices
    if (batchIndex !== undefined) {
      while (group.batches.length <= batchIndex) {
        group.batches.push(0);
      }
      group.batches[batchIndex]++;
    }
  }

  // Convert to phases
  const result: PipelinePhase[] = [];
  for (const [phaseKey, { steps, batches }] of phaseMap) {
    const def = getPhaseDef(phaseKey);
    result.push({
      phaseKey,
      label: def?.label || phaseKey,
      icon: def?.icon || '📌',
      steps,
      batches: batches.length > 0 ? batches : steps.map(() => 1),
    });
  }
  return result;
}

export type PipelineInstanceStatus = 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
export type StageRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting_approval';

export interface PipelineTemplate {
  id: number;
  name: string;
  description: string;
  /** Nested two-level structure (primary) */
  phases: PipelinePhase[];
  /** Flattened stages for executor (derived from phases) */
  stages: PipelineStage[];
  /** Project complexity level */
  complexity: PipelineComplexity;
  createdAt: string;
}

export interface PipelineInstance {
  id: number;
  taskId: number;
  templateId: number | null;
  templateName?: string;
  templatePhases?: PipelinePhase[];
  status: PipelineInstanceStatus;
  currentStageIndex: number;
  stageRuns: StageRun[];
  createdAt: string;
  completedAt: string | null;
}

export interface StageRun {
  id: number;
  instanceId: number;
  stageKey: string;
  phaseKey?: string;
  stepLabel?: string;
  agentId: string;
  status: StageRunStatus;
  input: string | null;
  output: string | null;
  artifacts: string[];
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

// ─── State Transition Log ──────────────────────────────────────

export interface StateTransitionLog {
  id: number;
  entityType: 'task' | 'pipeline' | 'stage';
  entityId: number;
  fromState: string | null;
  toState: string;
  triggeredBy: 'human' | 'system' | 'agent';
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ─── API Types ─────────────────────────────────────────────────

export interface CreateTaskRequest {
  title: string;
  description: string;
  templateId?: number;
}

export interface CreatePipelineInstanceRequest {
  taskId: number;
  templateId: number;
}

export interface AgentCommandRequest {
  message: string;
  stageKey?: string;
}

// ─── WebSocket Events ──────────────────────────────────────────

export type WSEventType =
  | 'agent:status_change'
  | 'task:updated'
  | 'task:created'
  | 'pipeline:stage_complete'
  | 'pipeline:stage_failed'
  | 'pipeline:completed'
  | 'pipeline:failed'
  | 'state:transition';

export interface WSEvent {
  type: WSEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

// ─── Stage Metadata ────────────────────────────────────────────

export interface StageActionDef {
  key: AgentActionType | HumanGateType | SystemFlowType;
  label: string;
  icon: string;
  description: string;
  defaultPhase: PhaseKey;
}

export const AGENT_ACTIONS: StageActionDef[] = [
  { key: 'analyze',  label: '需求分析',   icon: '📊', description: '分析和拆解需求',             defaultPhase: 'requirements' },
  { key: 'design',   label: '架构设计',   icon: '🏗️', description: '系统架构和技术设计',         defaultPhase: 'design' },
  { key: 'code',     label: '代码开发',   icon: '💻', description: '编写和修改代码',             defaultPhase: 'development' },
  { key: 'review',   label: '代码评审',   icon: '👀', description: '审查代码质量',               defaultPhase: 'development' },
  { key: 'test',     label: '测试验证',   icon: '🧪', description: '执行测试用例',               defaultPhase: 'testing' },
  { key: 'document', label: '文档输出',   icon: '📚', description: '生成技术文档',               defaultPhase: 'development' },
  { key: 'deploy',   label: '部署上线',   icon: '🚀', description: '部署到生产环境',             defaultPhase: 'deployment' },
];

export const HUMAN_GATES: StageActionDef[] = [
  { key: 'approve', label: '审批',   icon: '✅', description: '必须通过的审批关卡', defaultPhase: 'design' },
  { key: 'review',  label: '评审',   icon: '👤', description: '人工评审环节',       defaultPhase: 'development' },
];

export const SYSTEM_FLOWS: StageActionDef[] = [
  { key: 'lint',          label: '代码检查',   icon: '🔍', description: 'Lint 和静态分析',    defaultPhase: 'development' },
  { key: 'build',         label: '构建编译',   icon: '⚙️', description: '编译和构建流程',     defaultPhase: 'testing' },
  { key: 'security_scan', label: '安全扫描',   icon: '🔒', description: '安全漏洞扫描',       defaultPhase: 'testing' },
  { key: 'test_e2e',      label: 'E2E 测试',   icon: '🖥️', description: '端到端自动化测试',   defaultPhase: 'testing' },
  { key: 'code_pull',     label: '代码拉取',   icon: '📥', description: '从仓库拉取代码',     defaultPhase: 'development' },
  { key: 'code_merge',    label: '代码合并',   icon: '🔀', description: '合并目标分支代码',   defaultPhase: 'development' },
];

export function actionToActorType(action: string): ActorType {
  if (AGENT_ACTIONS.some(a => a.key === action)) return 'agent';
  if (HUMAN_GATES.some(a => a.key === action)) return 'human';
  return 'system';
}

export function getActionDef(action: string): StageActionDef | undefined {
  return [...AGENT_ACTIONS, ...HUMAN_GATES, ...SYSTEM_FLOWS].find(a => a.key === action);
}

// ─── Preset Pipeline Templates (Nested DSL) ────────────────────

function step(key: string, label: string, actorType: ActorType, action: AgentActionType | HumanGateType | SystemFlowType, opts: { agentId?: string; humanRole?: string; optional?: boolean; icon?: string } = {}): PipelineStep {
  const def = getActionDef(action);
  return {
    key,
    label,
    actorType,
    action,
    agentId: opts.agentId,
    humanRole: opts.humanRole,
    optional: opts.optional ?? false,
    icon: opts.icon || def?.icon || '⚙️',
  };
}

function phase(phaseKey: PhaseKey, steps: PipelineStep[], opts?: { label?: string; icon?: string; batches?: number[] }): PipelinePhase {
  const def = getPhaseDef(phaseKey);
  return {
    phaseKey,
    label: opts?.label || def?.label || phaseKey,
    icon: opts?.icon || def?.icon || '📌',
    steps,
    batches: opts?.batches || steps.map(() => 1), // Default: all serial
  };
}

export const PRESET_TEMPLATES: Record<PipelineComplexity, { name: string; description: string; phases: PipelinePhase[] }> = {
  small: {
    name: '小需求流水线',
    description: '适用于小型需求，快速交付',
    phases: [
      phase('requirements', [
        step('req_analysis', '需求分析', 'agent', 'analyze', { agentId: 'xiaoxi-pm' }),
      ]),
      phase('design', [
        step('architecture', '架构设计', 'agent', 'design', { agentId: 'zhangjia-arch' }),
      ]),
      phase('development', [
        step('development', '代码开发', 'agent', 'code', { agentId: 'magerd' }),
      ]),
      phase('testing', [
        step('unit_test', '单元测试', 'agent', 'test', { agentId: 'xiaozhi-test' }),
      ]),
      phase('deployment', [
        step('deployment', '部署上线', 'agent', 'deploy', { agentId: 'xiaoyun-ops' }),
      ]),
    ],
  },
  medium: {
    name: '标准研发流水线',
    description: '适用于中等规模需求，包含人工评审、多类型测试',
    phases: [
      phase('requirements', [
        step('req_analysis', '需求分析', 'agent', 'analyze', { agentId: 'xiaoxi-pm' }),
        step('req_review', '需求评审', 'human', 'review', { humanRole: 'product_owner' }),
      ]),
      phase('design', [
        step('architecture', '架构设计', 'agent', 'design', { agentId: 'zhangjia-arch' }),
      ]),
      phase('development', [
        step('development', '代码开发', 'agent', 'code', { agentId: 'magerd' }),
        step('code_review', '代码评审', 'human', 'review', { humanRole: 'senior_dev' }),
      ]),
      phase('testing', [
        step('unit_test', '单元测试', 'agent', 'test', { agentId: 'xiaozhi-test' }),
        step('integration_test', '集成测试', 'agent', 'test', { agentId: 'xiaozhi-test' }),
        step('test_e2e', 'E2E测试', 'system', 'test_e2e'),
      ], { batches: [2, 1] }), // unit + integration parallel, then e2e serial
      phase('deployment', [
        step('deployment', '部署上线', 'agent', 'deploy', { agentId: 'xiaoyun-ops' }),
      ]),
    ],
  },
  large: {
    name: '完整研发流水线',
    description: '适用于大型项目，含架构设计、多重评审、安全扫描',
    phases: [
      phase('requirements', [
        step('req_analysis', '需求分析', 'agent', 'analyze', { agentId: 'xiaoxi-pm' }),
        step('req_review', '需求评审', 'human', 'review', { humanRole: 'product_owner' }),
      ]),
      phase('design', [
        step('architecture', '架构设计', 'agent', 'design', { agentId: 'zhangjia-arch' }),
        step('arch_approval', '架构审批', 'human', 'approve', { humanRole: 'architect' }),
      ]),
      phase('development', [
        step('lint', '代码检查', 'system', 'lint'),
        step('development', '代码开发', 'agent', 'code', { agentId: 'magerd' }),
        step('code_review', '代码评审', 'human', 'review', { humanRole: 'senior_dev' }),
        step('documentation', '文档输出', 'agent', 'document', { agentId: 'xiaowen-docs' }),
      ], { batches: [1, 1, 2] }), // lint serial, dev serial, review+doc parallel
      phase('testing', [
        step('unit_test', '单元测试', 'agent', 'test', { agentId: 'xiaozhi-test' }),
        step('integration_test', '集成测试', 'agent', 'test', { agentId: 'xiaozhi-test' }),
        step('security_scan', '安全扫描', 'system', 'security_scan'),
        step('test_e2e', 'E2E测试', 'system', 'test_e2e'),
      ], { batches: [2, 2] }), // unit+integration parallel, then scan+e2e parallel
      phase('deployment', [
        step('deployment', '部署上线', 'agent', 'deploy', { agentId: 'xiaoyun-ops' }),
        step('deploy_approval', '上线审批', 'human', 'approve', { humanRole: 'tech_lead' }),
      ]),
    ],
  },
};

export const DEFAULT_PIPELINE_PHASES: PipelinePhase[] = PRESET_TEMPLATES.medium.phases;
export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = flattenPhases(DEFAULT_PIPELINE_PHASES);

// ─── State Transition Rules ────────────────────────────────────

export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending:    ['running', 'cancelled'],
  running:    ['completed', 'failed', 'cancelled'],
  completed:  [],
  failed:     ['pending'],
  cancelled:  [],
};

export const PIPELINE_TRANSITIONS: Record<PipelineInstanceStatus, PipelineInstanceStatus[]> = {
  pending:   ['running', 'cancelled'],
  running:   ['completed', 'failed', 'paused'],
  completed: [],
  failed:    ['pending'],
  paused:    ['running', 'cancelled'],
  cancelled: [],
};

export const STAGE_TRANSITIONS: Record<StageRunStatus, StageRunStatus[]> = {
  pending:        ['running', 'skipped'],
  running:        ['completed', 'failed', 'waiting_approval'],
  waiting_approval: ['completed', 'failed'],
  completed:      [],
  failed:         ['pending'],
  skipped:        [],
};
