import { Router, type Router as RouterType } from 'express';
import * as queries from '../db/queries.js';
import { OpenClawAgentClient } from '../openclaw/agent.js';
import { getSkillDescription } from '../openclaw/skills.js';

const router: RouterType = Router();
const agentClient = new OpenClawAgentClient();

// GET /api/agents - List all agents
router.get('/', (_req, res) => {
  const agents = queries.getAllAgents();
  res.json(agents);
});

// GET /api/agents/:id - Get agent details
router.get('/:id', (req, res) => {
  const agent = queries.getAgentById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// GET /api/agents/:id/status - Get agent live status
router.get('/:id/status', async (req, res) => {
  try {
    const status = await agentClient.getAgentStatus(req.params.id);
    res.json(status);
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

    const result = await agentClient.sendMessage(req.params.id, message);
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
