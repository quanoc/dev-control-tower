import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Agent } from '@pipeline/shared';

const CLAUDE_SKILLS_DIR = join(process.env.HOME || '/root', '.claude', 'skills');

// OpenClaw skill search paths
const OPENCLAW_SKILL_SEARCH_PATHS = [
  '/root/.openclaw/skills',
  '/root/.openclaw/extensions',
];

/**
 * Get full SKILL.md content for a specific agent's skill.
 */
export function getSkillContent(agent: Agent, skillId: string): { id: string; name: string; content: string; path: string } | null {
  // Determine skill directory based on agent source
  if (agent.source === 'claude') {
    // Claude agents: ~/.claude/skills/{skillId}
    const skillDir = join(CLAUDE_SKILLS_DIR, skillId);
    return readSkillFile(skillId, skillDir);
  } else if (agent.source === 'openclaw') {
    // OpenClaw agents: search in workspace/agentDir
    const searchPaths = [
      join(agent.workspace || '', 'skills', skillId),
      join(agent.agentDir || '', 'skills', skillId),
    ];
    for (const skillDir of searchPaths) {
      const result = readSkillFile(skillId, skillDir);
      if (result) return result;
    }
    // Also search global OpenClaw paths
    for (const basePath of OPENCLAW_SKILL_SEARCH_PATHS) {
      const result = searchSkillInBase(skillId, basePath);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Read SKILL.md from a specific directory.
 */
function readSkillFile(skillId: string, skillDir: string): { id: string; name: string; content: string; path: string } | null {
  const skillMdPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) return null;

  try {
    const content = readFileSync(skillMdPath, 'utf-8');
    const { name } = parseSkillMarkdown(skillId, content);
    return { id: skillId, name, content, path: skillMdPath };
  } catch {
    return null;
  }
}

/**
 * Search for skill in a base path (direct or nested).
 */
function searchSkillInBase(skillId: string, basePath: string): { id: string; name: string; content: string; path: string } | null {
  if (!existsSync(basePath)) return null;

  // Direct: basePath/{skillId}
  const direct = readSkillFile(skillId, join(basePath, skillId));
  if (direct) return direct;

  // Nested: basePath/*/skills/{skillId} or basePath/*/node_modules/openclaw/skills/{skillId}
  try {
    const entries = readdirSync(basePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const nested = readSkillFile(skillId, join(basePath, entry.name, 'skills', skillId));
      if (nested) return nested;

      const nm = readSkillFile(skillId, join(basePath, entry.name, 'node_modules', 'openclaw', 'skills', skillId));
      if (nm) return nm;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Find and read a skill's SKILL.md file.
 * Searches multiple directories for the skill.
 */
export async function getSkillDescription(skillId: string): Promise<{ id: string; description: string; name: string }> {
  const skillDir = findSkillDir(skillId);
  if (!skillDir) {
    throw new Error(`Skill "${skillId}" not found in any known directory`);
  }

  const skillMdPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    throw new Error(`SKILL.md not found for "${skillId}" at ${skillDir}`);
  }

  const content = readFileSync(skillMdPath, 'utf-8');
  return parseSkillMarkdown(skillId, content);
}

/**
 * Search for a skill directory across known paths.
 */
function findSkillDir(skillId: string): string | null {
  // Also check Claude skills dir
  const claudePath = join(CLAUDE_SKILLS_DIR, skillId);
  if (existsSync(claudePath) && existsSync(join(claudePath, 'SKILL.md'))) {
    return claudePath;
  }

  for (const basePath of OPENCLAW_SKILL_SEARCH_PATHS) {
    if (!existsSync(basePath)) continue;

    // Direct child: /root/.openclaw/skills/{skillId}
    const directPath = join(basePath, skillId);
    if (existsSync(directPath) && existsSync(join(directPath, 'SKILL.md'))) {
      return directPath;
    }

    // Recurse one level deep (for extensions/*/node_modules/openclaw/skills/{skillId})
    try {
      const entries = readdirSync(basePath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const subPath = join(basePath, entry.name, 'skills', skillId);
        if (existsSync(subPath) && existsSync(join(subPath, 'SKILL.md'))) {
          return subPath;
        }
        // Also check node_modules/openclaw/skills/{skillId}
        const nmPath = join(basePath, entry.name, 'node_modules', 'openclaw', 'skills', skillId);
        if (existsSync(nmPath) && existsSync(join(nmPath, 'SKILL.md'))) {
          return nmPath;
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  return null;
}

/**
 * Parse SKILL.md content to extract name and description.
 * Handles both formats:
 * 1. YAML frontmatter: ---\nname: ...\ndescription: ...\n---
 * 2. Markdown heading: # Skill Name\n\nDescription text...
 */
function parseSkillMarkdown(id: string, content: string): { id: string; description: string; name: string } {
  // Try YAML frontmatter first
  const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (yamlMatch) {
    const yamlBlock = yamlMatch[1];
    const nameMatch = yamlBlock.match(/name:\s*(.+)/);
    const descMatch = yamlBlock.match(/description:\s*['"]?(.+?)['"]?(?:\n|$)/);

    return {
      id,
      name: nameMatch ? nameMatch[1].trim() : id,
      description: descMatch ? descMatch[1].trim() : 'No description available',
    };
  }

  // Try markdown: first line is title, rest is description
  const lines = content.split('\n').filter(l => l.trim());
  const titleLine = lines[0] || '';
  const name = titleLine.replace(/^#\s*/, '').trim();

  // Get first paragraph after the title
  const descLines = lines.slice(1);
  const description = descLines
    .filter(l => !l.startsWith('#') && !l.startsWith('##') && !l.startsWith('```'))
    .slice(0, 3)
    .join(' ')
    .trim()
    .substring(0, 500);

  return { id, name: name || id, description: description || 'No description available' };
}
