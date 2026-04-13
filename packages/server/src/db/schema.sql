-- AI Pipeline Dashboard Database Schema

-- Agent configuration table (unified for OpenClaw, Claude, and custom agents)
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'openclaw',  -- 'openclaw' | 'claude' | 'custom'
    role TEXT NOT NULL DEFAULT '',           -- 角色 (如 PM, RD, 架构师)
    emoji TEXT,                               -- 图标
    description TEXT,                         -- 描述
    path TEXT,                                 -- 路径 (workspace 或 agent_dir)
    skills TEXT DEFAULT '[]',
    status TEXT DEFAULT 'idle',
    current_task_id INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Extended fields for multi-agent support
    model TEXT,                                -- 'sonnet' | 'opus' | 'haiku' (claude/custom only)
    system_prompt TEXT,                        -- custom system prompt (custom only)
    tools TEXT DEFAULT '[]',                  -- allowed tools (claude/custom only)
    metadata TEXT DEFAULT '{}',                -- 额外信息 JSON
    last_sync TEXT,                            -- 最后同步时间
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Task table
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    created_by TEXT DEFAULT 'human',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- Pipeline component table (reusable step units)
CREATE TABLE IF NOT EXISTS pipeline_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    actor_type TEXT NOT NULL,  -- 'agent' | 'human' | 'system'
    action TEXT NOT NULL,      -- 'analyze' | 'design' | 'code' | 'review' | 'test' | 'document' | 'deploy' | 'approve' | 'review' | 'lint' | 'build' | 'security_scan' | 'test_e2e' | 'code_pull' | 'code_merge'
    agent_id TEXT,
    human_role TEXT,
    icon TEXT,
    optional INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Pipeline template table
CREATE TABLE IF NOT EXISTS pipeline_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    stages TEXT NOT NULL,
    phases TEXT,
    complexity TEXT DEFAULT 'medium',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Pipeline instance table (one per task)
CREATE TABLE IF NOT EXISTS pipeline_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    template_id INTEGER REFERENCES pipeline_templates(id),
    status TEXT DEFAULT 'pending',
    current_stage_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- Pipeline stage run table
CREATE TABLE IF NOT EXISTS pipeline_stage_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL REFERENCES pipeline_instances(id),
    stage_key TEXT NOT NULL,
    phase_key TEXT,
    step_label TEXT,
    agent_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    input TEXT,
    output TEXT,
    artifacts TEXT DEFAULT '[]',
    started_at DATETIME,
    completed_at DATETIME,
    error TEXT
);

-- State transition log (audit trail)
CREATE TABLE IF NOT EXISTS state_transition_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    from_state TEXT,
    to_state TEXT NOT NULL,
    triggered_by TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_instances_task_id ON pipeline_instances(task_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stage_runs_instance_id ON pipeline_stage_runs(instance_id);
CREATE INDEX IF NOT EXISTS idx_state_transition_log_entity ON state_transition_log(entity_type, entity_id);
