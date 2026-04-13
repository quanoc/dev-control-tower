import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const execAsync = promisify(exec);

export interface AgentResponse {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

export interface ClaudeAgentInfo {
  id: string;
  name: string;
  description?: string;
  model?: string;
}

const CLAUDE_BIN = 'claude';
const CLAUDE_AGENTS_DIR = join(process.env.HOME || '/root', '.claude', 'agents');
const AGENT_TIMEOUT = 600; // seconds

/**
 * Client for Claude Code CLI agent execution.
 */
export class ClaudeAgentClient {
  /**
   * Send a message to a Claude agent and wait for response.
   * Uses the `claude` CLI command with -p (print) and --output-format json.
   */
  async sendMessage(agentId: string, message: string, options?: {
    systemPrompt?: string;
    model?: string;
    tools?: string[];
  }): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Build command with options
      const args = [
        '-p',
        '--output-format', 'json',
        '--dangerously-skip-permissions',
      ];

      // Add system prompt if provided
      if (options?.systemPrompt) {
        args.push('--system-prompt', options.systemPrompt);
      }

      // Add model if specified
      if (options?.model) {
        args.push('--model', options.model);
      }

      // Add allowed tools if specified
      if (options?.tools && options.tools.length > 0) {
        args.push('--allowed-tools', options.tools.join(','));
      }

      // Add agent if specified (for built-in agents)
      if (agentId && !agentId.startsWith('custom-')) {
        args.push('--agent', agentId);
      }

      // Add custom agent definition if it's a custom agent
      if (agentId.startsWith('custom-')) {
        const customAgentName = agentId.replace('custom-', '');
        args.push('--agents', JSON.stringify({
          [customAgentName]: {
            description: 'Custom agent',
            prompt: options?.systemPrompt || 'You are a helpful assistant.',
          }
        }));
        args.push('--agent', customAgentName);
      }

      // Add the message as argument
      args.push('--', message);

      const cmd = `${CLAUDE_BIN} ${args.join(' ')}`;

      const { stdout } = await execAsync(cmd, {
        timeout: AGENT_TIMEOUT * 1000,
        maxBuffer: 50 * 1024 * 1024, // 50MB
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY,
        },
      });

      const duration = Date.now() - startTime;

      // Parse JSON output
      try {
        const parsed = JSON.parse(stdout);
        const output = parsed.result || parsed.text || parsed.output || stdout;
        return { success: true, output, duration };
      } catch {
        // Not JSON, use raw output
        return { success: true, output: stdout.trim(), duration };
      }
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const error = err.stderr || err.message || 'Unknown error';
      return { success: false, output: err.stdout || '', error, duration };
    }
  }

  /**
   * List available Claude agents from local files.
   * Reads from ~/.claude/agents/*.md
   */
  async listAgents(): Promise<ClaudeAgentInfo[]> {
    try {
      if (!existsSync(CLAUDE_AGENTS_DIR)) {
        console.log('[ClaudeAgentClient] Agents directory not found:', CLAUDE_AGENTS_DIR);
        return [];
      }

      const files = readdirSync(CLAUDE_AGENTS_DIR).filter(f => f.endsWith('.md'));
      const agents: ClaudeAgentInfo[] = [];

      for (const file of files) {
        try {
          const content = readFileSync(join(CLAUDE_AGENTS_DIR, file), 'utf-8');
          const agentId = file.replace('.md', '');

          // Parse YAML frontmatter
          const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
          if (frontmatterMatch) {
            const yaml = frontmatterMatch[1];
            const nameMatch = yaml.match(/name:\s*(.+)/);
            const descMatch = yaml.match(/description:\s*['"]?(.+?)['"]?(?:\n|$)/);
            const modelMatch = yaml.match(/model:\s*(.+)/);

            agents.push({
              id: agentId,
              name: nameMatch ? nameMatch[1].trim() : agentId,
              description: descMatch ? descMatch[1].trim() : '',
              model: modelMatch ? modelMatch[1].trim() : undefined,
            });
          } else {
            // Fallback: use filename as id
            agents.push({
              id: agentId,
              name: agentId,
              description: '',
            });
          }
        } catch (err) {
          console.error('[ClaudeAgentClient] Failed to read agent file:', file, err);
        }
      }

      return agents;
    } catch (err) {
      console.error('[ClaudeAgentClient] Failed to list agents:', err);
      return [];
    }
  }}
