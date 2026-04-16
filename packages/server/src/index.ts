import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, closeDb } from './db/index.js';
import * as queries from './db/queries.js';
import agentsRouter from './routes/agents.js';
import tasksRouter from './routes/tasks.js';
import pipelinesRouter from './routes/pipelines.js';
import { DEFAULT_PIPELINE_PHASES } from '@pipeline/shared';
import { initializeAgentTags } from './db/agent-sync.js';
import { pipelineScheduler } from './engine/scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENCLAW_CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH || '/root/.openclaw/openclaw.json';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/agents', agentsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/pipelines', pipelinesRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});
app.get('/api/agents/:id/definitions', (req, res) => {
  try {
    const agent = queries.getAgentById(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const result: {
      identity?: string;
      agents?: string;
      soul?: string;
      tools?: string;
      bootstrap?: string;
      heartbeat?: string;
      user?: string;
    } = {};

    // 1. IDENTITY.md - agent 自己的目录
    const identityPath = join(agent.agentDir, 'IDENTITY.md');
    if (existsSync(identityPath)) {
      result.identity = readFileSync(identityPath, 'utf-8');
    }

    // Agent 自己的工作目录
    const AGENT_WORKSPACE = agent.workspace;

    // 辅助函数：只从 agent workspace 读，没有返回 undefined
    const readAgentFile = (filename: string): string | undefined => {
      if (!AGENT_WORKSPACE) return undefined;
      const agentPath = join(AGENT_WORKSPACE, filename);
      if (existsSync(agentPath)) {
        return readFileSync(agentPath, 'utf-8');
      }
      return undefined;
    };

    // 2. AGENTS.md
    result.agents = readAgentFile('AGENTS.md');

    // 3. SOUL.md
    result.soul = readAgentFile('SOUL.md');

    // 4. TOOLS.md
    result.tools = readAgentFile('TOOLS.md');

    // 5. BOOTSTRAP.md
    result.bootstrap = readAgentFile('BOOTSTRAP.md');

    // 6. HEARTBEAT.md
    result.heartbeat = readAgentFile('HEARTBEAT.md');

    // 7. USER.md
    result.user = readAgentFile('USER.md');

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Sync agents from OpenClaw and Claude
async function syncAllAgents(): Promise<void> {
  try {
    const config = JSON.parse(readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8'));
    const agents = config.agents?.list || [];
    const skillsEntries = config.skills?.entries || {};

    for (const agentConfig of agents) {
      // Skip the main/claude entry
      if (agentConfig.id === 'main' || agentConfig.id === 'claude') continue;

      // Read agent IDENTITY.md for description
      let description = '';
      let emoji = '';
      let role = agentConfig.id;
      try {
        const identityPath = join(agentConfig.agentDir, 'IDENTITY.md');
        const identity = readFileSync(identityPath, 'utf-8');

        const emojiMatch = identity.match(/\*\*Emoji\*\*:\s*(.+)/);
        if (emojiMatch) emoji = emojiMatch[1].trim();

        const roleMatch = identity.match(/\*\*Role\*\*:\s*(.+)/);
        if (roleMatch) role = roleMatch[1].trim();

        const descMatch = identity.match(/## 能力特点\n([\s\S]*?)(?:\n##|$)/);
        if (descMatch) description = descMatch[1].trim();
      } catch {
        description = `Agent ${agentConfig.name || agentConfig.id}`;
      }

      // Build skills list from openclaw.json skills.entries
      const skills = Object.entries(skillsEntries).map(([id, entry]: [string, any]) => ({
        id,
        name: id,
        enabled: entry.enabled !== false,
      }));

      // Use type field for persistence
      queries.upsertAgent({
        id: agentConfig.id,
        name: agentConfig.name || agentConfig.id,
        role,
        emoji: emoji || '🤖',
        description,
        workspace: agentConfig.workspace || '',
        agentDir: agentConfig.agentDir || '',
        skills,
        status: 'idle',
        source: 'openclaw',
      });
    }

    // Also sync Claude agents
    try {
      const { syncAgents } = await import('./db/agent-sync.js');
      syncAgents(); // This function is synchronous
    } catch (err) {
      console.error('[Sync] Failed to sync Claude agents:', err);
    }

// Ensure default pipeline template exists
    const templates = queries.getAllTemplates();
    if (templates.length === 0) {
      queries.createTemplate(
        '标准研发流程',
        '完整的研发流水线：需求分析 → 架构设计 → 代码开发 → 测试验证 → 文档输出 → 部署上线',
        DEFAULT_PIPELINE_PHASES
      );
    }

    // Ensure default pipeline components exist
    const components = queries.listComponents();
    if (components.total === 0) {
      console.log('[Init] Creating default pipeline components...');
      // Agent actions
      queries.createComponent({ name: '需求分析', description: '分析和拆解需求', actor_type: 'agent', action: 'analyze', icon: '📊' });
      queries.createComponent({ name: '架构设计', description: '系统架构和技术设计', actor_type: 'agent', action: 'design', icon: '🏗️' });
      queries.createComponent({ name: '代码开发', description: '编写和修改代码', actor_type: 'agent', action: 'code', icon: '💻' });
      queries.createComponent({ name: '代码评审', description: '审查代码质量', actor_type: 'agent', action: 'review', icon: '👀' });
      queries.createComponent({ name: '测试验证', description: '执行测试用例', actor_type: 'agent', action: 'test', icon: '🧪' });
      queries.createComponent({ name: '文档输出', description: '生成技术文档', actor_type: 'agent', action: 'document', icon: '📚' });
      queries.createComponent({ name: '部署上线', description: '部署到生产环境', actor_type: 'agent', action: 'deploy', icon: '🚀' });
      // Human gates
      queries.createComponent({ name: '审批', description: '必须通过的审批关卡', actor_type: 'human', action: 'approve', icon: '✅' });
      queries.createComponent({ name: '评审', description: '人工评审环节', actor_type: 'human', action: 'review', icon: '👤' });
      // System flows
      queries.createComponent({ name: '代码检查', description: 'Lint 和静态分析', actor_type: 'system', action: 'lint', icon: '🔍' });
      queries.createComponent({ name: '构建编译', description: '编译和构建流程', actor_type: 'system', action: 'build', icon: '⚙️' });
      queries.createComponent({ name: '安全扫描', description: '安全漏洞扫描', actor_type: 'system', action: 'security_scan', icon: '🔒' });
      queries.createComponent({ name: 'E2E 测试', description: '端到端自动化测试', actor_type: 'system', action: 'test_e2e', icon: '🖥️' });
      queries.createComponent({ name: '代码拉取', description: '从仓库拉取代码', actor_type: 'system', action: 'code_pull', icon: '📥' });
      queries.createComponent({ name: '代码合并', description: '合并目标分支代码', actor_type: 'system', action: 'code_merge', icon: '🔀' });
    }

    console.log(`[Sync] Synced ${agents.filter((a: any) => a.id !== 'main' && a.id !== 'claude').length} OpenClaw agents`);
  } catch (err) {
    console.error('[Sync] Failed to sync agents:', err);
  }
}

// Initialize
async function start() {
  // Initialize database
  getDb();
  console.log('[Server] Database initialized');

  // Sync agents
  await syncAllAgents();

  // Initialize tags for agents without tags (data migration)
  initializeAgentTags();

  // Start pipeline scheduler (恢复卡住的流水线 + 超时检测)
  pipelineScheduler.start();
  console.log('[Server] Pipeline scheduler started');

  // Start server
  app.listen(PORT, () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Server] Shutting down...');
  pipelineScheduler.stop();
  closeDb();
  process.exit(0);
});

start().catch(console.error);
