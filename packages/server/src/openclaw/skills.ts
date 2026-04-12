import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Common skill search paths
const SKILL_SEARCH_PATHS = [
  '/root/.openclaw/skills',
  '/root/.openclaw/extensions',
];

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
  for (const basePath of SKILL_SEARCH_PATHS) {
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
