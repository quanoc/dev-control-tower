import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from './index.js';
import type { Agent } from '@pipeline/shared';

const CLAUDE_AGENTS_DIR = join(process.env.HOME || '/root', '.claude', 'agents');

// 预定义的标签及其匹配规则
const TAG_RULES = [
  { tag: '需求', patterns: ['pm', 'product', 'req', '需求', '产品', '产品经理'] },
  { tag: '设计', patterns: ['arch', 'design', '架构', '设计', 'architect'] },
  { tag: '开发', patterns: ['dev', 'code', '开发', '工程师', 'coder', 'developer', 'backend', 'frontend', 'fullstack'] },
  { tag: '测试', patterns: ['test', 'qa', '测试', 'quality', '质量保证'] },
  { tag: '文档', patterns: ['doc', 'writer', '文档', '写作', 'write', 'technical writer'] },
  { tag: '部署', patterns: ['ops', 'deploy', '运维', '部署', 'devops', 'sre', 'infrastructure'] },
];

/**
 * 根据 agent id/name/role/description 推断标签
 */
export function inferAgentTags(agentId: string, name: string, role: string, description: string): string[] {
  const text = `${agentId} ${name} ${role} ${description}`.toLowerCase();
  const tags: string[] = [];

  for (const rule of TAG_RULES) {
    if (rule.patterns.some(p => text.includes(p.toLowerCase()))) {
      tags.push(rule.tag);
    }
  }

  return [...new Set(tags)]; // 去重
}

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
      // Read IDENTITY.md for description
      let description = agent.identityName || agent.name;
      try {
        const identityPath = join(agent.agentDir, 'IDENTITY.md');
        if (existsSync(identityPath)) {
          const identityContent = readFileSync(identityPath, 'utf-8');
          // Extract description from IDENTITY.md (use full content or first meaningful section)
          const descMatch = identityContent.match(/## 专业领域[\s\S]*?(?=##|$)/);
          if (descMatch) {
            description = descMatch[0].replace(/## 专业领域/, '').trim();
          } else {
            // Use content after frontmatter if no specific section
            const contentMatch = identityContent.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)/);
            if (contentMatch) {
              description = contentMatch[1].trim().slice(0, 200);
            }
          }
        }
      } catch {
        // Fallback to identityName or name
      }

      const tags = inferAgentTags(agent.id, agent.name, agent.name, description);

      // Determine workspace: main agent uses public workspace, others use their own workspace
      const workspace = agent.id === 'main'
        ? join(process.env.HOME || '/root', '.openclaw', 'workspace')
        : agent.workspace || agent.agentDir;

      db.prepare(`
        INSERT INTO agents (id, name, type, role, emoji, description, path, metadata, last_sync, updated_at, tags)
        VALUES (?, ?, 'openclaw', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          emoji = COALESCE(excluded.emoji, agents.emoji),
          description = excluded.description,
          path = excluded.path,
          metadata = excluded.metadata,
          last_sync = excluded.last_sync,
          type = 'openclaw',
          updated_at = CURRENT_TIMESTAMP,
          tags = COALESCE(agents.tags, excluded.tags)
      `).run(
        agent.id,
        agent.name,
        agent.name, // role (use name as default)
        agent.identityEmoji || '',
        description,
        workspace, // Use agentDir (not workspace) for IDENTITY.md
        JSON.stringify({ model: agent.model }),
        now,
        JSON.stringify(tags)
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

          const tags = inferAgentTags(agentId, name, name, description);

          db.prepare(`
            INSERT INTO agents (id, name, type, role, description, metadata, last_sync, updated_at, tags)
            VALUES (?, ?, 'claude', ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = COALESCE(excluded.description, agents.description),
              metadata = excluded.metadata,
              last_sync = excluded.last_sync,
              type = 'claude',
              updated_at = CURRENT_TIMESTAMP,
              tags = COALESCE(agents.tags, excluded.tags)
          `).run(
            agentId,
            name,
            name, // role (use name as default)
            description,
            JSON.stringify({ model, tools }),
            now,
            JSON.stringify(tags)
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
    tags: JSON.parse(row.tags || '[]'),
  };
}

/**
 * Initialize tags for existing agents that don't have tags.
 * Called on server startup to migrate existing data.
 */
export function initializeAgentTags(): void {
  const db = getDb();
  console.log('[AgentSync] Initializing agent tags...');

  try {
    // Get all agents with empty or null tags
    const rows = db.prepare(`
      SELECT * FROM agents
      WHERE tags IS NULL
         OR tags = '[]'
         OR tags = ''
    `).all() as any[];

    if (rows.length === 0) {
      console.log('[AgentSync] All agents already have tags, skipping initialization');
      return;
    }

    console.log(`[AgentSync] Found ${rows.length} agents without tags, inferring...`);

    let updatedCount = 0;
    for (const row of rows) {
      const agent = rowToAgent(row);
      const tags = inferAgentTags(agent.id, agent.name, agent.role, agent.description);

      if (tags.length > 0) {
        db.prepare('UPDATE agents SET tags = ? WHERE id = ?').run(
          JSON.stringify(tags),
          agent.id
        );
        updatedCount++;
        console.log(`[AgentSync] Added tags [${tags.join(', ')}] to agent "${agent.name}" (${agent.id})`);
      }
    }

    console.log(`[AgentSync] Initialized tags for ${updatedCount} agents`);
  } catch (err) {
    console.error('[AgentSync] Failed to initialize agent tags:', err);
  }
}