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
app.get('/api/agents/:id/identity', (req, res) => {
  try {
    const agent = queries.getAgentById(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const identityPath = join(agent.agentDir, 'IDENTITY.md');
    if (!existsSync(identityPath)) {
      return res.json({ content: '', description: '' });
    }
    const content = readFileSync(identityPath, 'utf-8');
    res.json({ content });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Sync agents from OpenClaw config
function syncAgentsFromOpenClaw(): void {
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
      });
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

    console.log(`[Sync] Synced ${agents.filter((a: any) => a.id !== 'main' && a.id !== 'claude').length} agents from OpenClaw config`);
  } catch (err) {
    console.error('[Sync] Failed to sync agents from OpenClaw config:', err);
  }
}

// Initialize
async function start() {
  // Initialize database
  getDb();
  console.log('[Server] Database initialized');

  // Sync agents
  syncAgentsFromOpenClaw();

  // Start server
  app.listen(PORT, () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Server] Shutting down...');
  closeDb();
  process.exit(0);
});

start().catch(console.error);
