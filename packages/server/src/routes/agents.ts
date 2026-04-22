import { Router, type Router as RouterType } from 'express';
import * as queries from '../db/queries.js';
import { OpenClawAgentClient } from '../openclaw/agent.js';
import { ClaudeAgentClient } from '../openclaw/claude-agent.js';
import { getSkillDescription, getSkillContent } from '../openclaw/skills.js';
import { syncAgents } from '../db/agent-sync.js';

const router: RouterType = Router();
const openclawClient = new OpenClawAgentClient();
const claudeClient = new ClaudeAgentClient();

// POST /api/agents/sync - Force sync agents from OpenClaw and Claude
router.post('/sync', async (_req, res) => {
  try {
    syncAgents();
    const agents = queries.getAllAgents();
    res.json({ success: true, count: agents.length, agents });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /api/agents - List all agents (from database)
router.get('/', (_req, res) => {
  const agents = queries.getAllAgents();
  res.json(agents);
});

// GET /api/agents/claude - List Claude Code agents
router.get('/claude', async (_req, res) => {
  try {
    const claudeAgents = await claudeClient.listAgents();
    res.json(claudeAgents);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /api/agents/openclaw - List OpenClaw agents
router.get('/openclaw', async (_req, res) => {
  try {
    const stdout = require('node:child_process').execSync('openclaw agents list --json', {
      encoding: 'utf-8',
      timeout: 30000,
    });

    if (!stdout) {
      return res.json([]);
    }

    const agents = JSON.parse(stdout);
    const result = agents.map((a: any) => ({
      id: a.id,
      name: a.name,
      description: a.identityName || a.name,
    }));

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// POST /api/agents - Create a custom agent
router.post('/', (req, res) => {
  const { name, role, emoji, description, model, systemPrompt, tools, icon, tags } = req.body;

  if (!name || !role) {
    return res.status(400).json({ error: 'name and role are required' });
  }

  const agentId = `custom-${Date.now()}`;

  queries.upsertAgent({
    id: agentId,
    name,
    role,
    emoji: emoji || '🤖',
    description: description || '',
    workspace: '',
    agentDir: '',
    skills: [],
    status: 'idle',
    source: 'custom',
    model: model || 'sonnet',
    systemPrompt: systemPrompt || '',
    tools: tools || [],
    icon,
    tags: tags || [],
  });

  const agent = queries.getAgentById(agentId);
  res.status(201).json(agent);
});

// PUT /api/agents/:id - Update a custom agent
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, role, emoji, description, model, systemPrompt, tools, icon, tags } = req.body;

  const existing = queries.getAgentById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  // Only allow updating custom agents
  if (existing.source !== 'custom') {
    return res.status(403).json({ error: 'Only custom agents can be updated' });
  }

  queries.upsertAgent({
    ...existing,
    name: name ?? existing.name,
    role: role ?? existing.role,
    emoji: emoji ?? existing.emoji,
    description: description ?? existing.description,
    model: model ?? existing.model,
    systemPrompt: systemPrompt ?? existing.systemPrompt,
    tools: tools ?? existing.tools,
    icon: icon ?? existing.icon,
    tags: tags ?? existing.tags,
  });

  const agent = queries.getAgentById(id);
  res.json(agent);
});

// DELETE /api/agents/:id - Delete a custom agent
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  const existing = queries.getAgentById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  // Only allow deleting custom agents
  if (existing.source !== 'custom') {
    return res.status(403).json({ error: 'Only custom agents can be deleted' });
  }

  const db = require('../db/index.js').getDb();
  db.prepare('DELETE FROM agents WHERE id = ?').run(id);

  res.status(204).send();
});

// GET /api/agents/:agentId/skills/:skillId/content - Get skill full content (must be before /:id)
router.get('/:agentId/skills/:skillId/content', (req, res) => {
  const agent = queries.getAgentById(req.params.agentId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const result = getSkillContent(agent, req.params.skillId);
  if (!result) return res.status(404).json({ error: `Skill "${req.params.skillId}" not found` });

  res.json(result);
});

// GET /api/agents/:id - Get agent details
router.get('/:id', (req, res) => {
  const agent = queries.getAgentById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// GET /api/agents/:id/status - Get agent live status
router.get('/:id/status', async (req, res) => {
  const agent = queries.getAgentById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  try {
    if (agent.source === 'claude') {
      // For Claude agents, just return as alive if it's a known agent
      res.json({ id: agent.id, alive: true, lastSeen: new Date().toISOString() });
    } else {
      const status = await openclawClient.getAgentStatus(req.params.id);
      res.json(status);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// POST /api/agents/:id/command - Send command to agent
router.post('/:id/command', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const agent = queries.getAgentById(req.params.id);

    let result;
    if (agent?.source === 'claude' || agent?.source === 'custom') {
      result = await claudeClient.sendMessage(req.params.id, message, {
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        tools: agent.tools,
      });
    } else {
      result = await openclawClient.sendMessage(req.params.id, message);
    }

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /api/skills/:id/description - Get skill description
router.get('/skills/:id/description', async (req, res) => {
  try {
    const desc = await getSkillDescription(req.params.id);
    res.json(desc);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(404).json({ error: message });
  }
});

export default router;
