import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from './index.js';
import type { Agent } from '@pipeline/shared';

const CLAUDE_AGENTS_DIR = join(process.env.HOME || '/root', '.claude', 'agents');

interface OpenClawAgent {
  id: string;
  name: string;
  identityName?: string;
  identityEmoji?: string;
  workspace: string;
  agentDir: string;
  model: string;
}

interface ClaudeLocalAgent {
  id: string;
  name: string;
  description: string;
  model?: string;
  tools?: string[];
}

/**
 * Sync agents from OpenClaw and Claude sources to database.
 */
export function syncAgents(): void {
  const db = getDb();
  const now = new Date().toISOString();

  console.log('[AgentSync] Starting agent sync...');

  // Sync OpenClaw agents
  try {
    const openclawData = execSync('openclaw agents list --json', {
      encoding: 'utf-8',
      timeout: 30000,
    });
    const openclawAgents: OpenClawAgent[] = JSON.parse(openclawData);

    for (const agent of openclawAgents) {
      db.prepare(`
        INSERT INTO agents (id, name, type, role, emoji, description, path, metadata, last_sync, updated_at)
        VALUES (?, ?, 'openclaw', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          emoji = COALESCE(excluded.emoji, agents.emoji),
          description = COALESCE(excluded.description, agents.description),
          path = excluded.path,
          metadata = excluded.metadata,
          last_sync = excluded.last_sync,
          type = 'openclaw',
          updated_at = CURRENT_TIMESTAMP
      `).run(
        agent.id,
        agent.name,
        agent.name, // role (use name as default)
        agent.identityEmoji || '',
        agent.identityName || agent.name,
        agent.workspace || agent.agentDir,
        JSON.stringify({ model: agent.model }),
        now
      );
    }
    console.log(`[AgentSync] Synced ${openclawAgents.length} OpenClaw agents`);
  } catch (err) {
    console.error('[AgentSync] Failed to sync OpenClaw agents:', err);
  }

  // Sync Claude local agents
  try {
    if (existsSync(CLAUDE_AGENTS_DIR)) {
      const files = readdirSync(CLAUDE_AGENTS_DIR).filter(f => f.endsWith('.md'));
      let syncedCount = 0;

      for (const file of files) {
        try {
          const content = readFileSync(join(CLAUDE_AGENTS_DIR, file), 'utf-8');
          const agentId = file.replace('.md', '');

          // Parse YAML frontmatter
          const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
          let name = agentId;
          let description = '';
          let model = '';
          let tools: string[] = [];

          if (frontmatterMatch) {
            const yaml = frontmatterMatch[1];
            const nameMatch = yaml.match(/name:\s*(.+)/);
            const descMatch = yaml.match(/description:\s*['"]?(.+?)['"]?(?:\n|$)/);
            const modelMatch = yaml.match(/model:\s*(.+)/);
            const toolsMatch = yaml.match(/tools:\s*\[([^\]]+)\]/);

            name = nameMatch ? nameMatch[1].trim() : agentId;
            description = descMatch ? descMatch[1].trim() : '';
            model = modelMatch ? modelMatch[1].trim() : '';
            if (toolsMatch) {
              tools = toolsMatch[1].split(',').map(t => t.trim().replace(/"/g, ''));
            }
          }

          db.prepare(`
            INSERT INTO agents (id, name, type, role, description, metadata, last_sync, updated_at)
            VALUES (?, ?, 'claude', ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = COALESCE(excluded.description, agents.description),
              metadata = excluded.metadata,
              last_sync = excluded.last_sync,
              type = 'claude',
              updated_at = CURRENT_TIMESTAMP
          `).run(
            agentId,
            name,
            name, // role (use name as default)
            description,
            JSON.stringify({ model, tools }),
            now
          );
          syncedCount++;
        } catch (err) {
          console.error('[AgentSync] Failed to read Claude agent file:', file, err);
        }
      }
      console.log(`[AgentSync] Synced ${syncedCount} Claude agents`);
    }
  } catch (err) {
    console.error('[AgentSync] Failed to sync Claude agents:', err);
  }

  console.log('[AgentSync] Agent sync completed');
}

/**
 * Get agent type from database.
 */
export function getAgentType(agentId: string): string | undefined {
  const db = getDb();
  const row = db.prepare('SELECT type FROM agents WHERE id = ?').get(agentId) as { type: string } | undefined;
  return row?.type;
}

/**
 * Get all agents grouped by type.
 */
export function getAgentsByType(): { openclaw: Agent[]; claude: Agent[]; custom: Agent[] } {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM agents ORDER BY type, name').all() as any[];

  const result = {
    openclaw: [] as Agent[],
    claude: [] as Agent[],
    custom: [] as Agent[],
  };

  for (const row of rows) {
    const agent = rowToAgent(row);
    if (row.type === 'openclaw') {
      result.openclaw.push(agent);
    } else if (row.type === 'claude') {
      result.claude.push(agent);
    } else {
      result.custom.push(agent);
    }
  }

  return result;
}

function rowToAgent(row: any): Agent {
  const metadata = JSON.parse(row.metadata || '{}');
  return {
    id: row.id,
    name: row.name,
    role: row.role || '',
    emoji: row.emoji || '',
    description: row.description || '',
    workspace: row.path || '',
    agentDir: row.path || '',
    skills: JSON.parse(row.skills || '[]'),
    status: row.status as Agent['status'],
    currentTaskId: row.current_task_id,
    updatedAt: row.updated_at,
    source: row.type,
    model: row.model || metadata.model,
    systemPrompt: row.system_prompt,
    tools: JSON.parse(row.tools || '[]'),
    icon: row.emoji,
  };
}