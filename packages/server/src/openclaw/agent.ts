import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface AgentResponse {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
}

export interface AgentStatus {
  id: string;
  alive: boolean;
  lastSeen: string | null;
}

const OPENCLAW_BIN = 'openclaw';
const AGENT_TIMEOUT = 600; // seconds

export class OpenClawAgentClient {
  /**
   * Send a message to an OpenClaw agent and wait for response.
   * Uses the `openclaw agent` CLI command with --json flag.
   */
  async sendMessage(agentId: string, message: string): Promise<AgentResponse> {
    const startTime = Date.now();
    const escapedMessage = message.replace(/'/g, "'\\''");

    try {
      const { stdout } = await execAsync(
        `${OPENCLAW_BIN} agent --agent ${agentId} --message '${escapedMessage}' --json`,
        {
          timeout: AGENT_TIMEOUT * 1000,
          maxBuffer: 50 * 1024 * 1024, // 50MB
        }
      );

      const duration = Date.now() - startTime;
      let output = stdout.trim();

      // Try to parse JSON output
      try {
        const parsed = JSON.parse(output);
        output = parsed.text || parsed.output || parsed.reply || output;
      } catch {
        // Not JSON, use raw output
      }

      return { success: true, output, duration };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const error = err.stderr || err.message || 'Unknown error';
      return { success: false, output: err.stdout || '', error, duration };
    }
  }

  /**
   * Check if an agent is alive by checking its session state.
   */
  async getAgentStatus(agentId: string): Promise<AgentStatus> {
    try {
      const { stdout } = await execAsync(
        `${OPENCLAW_BIN} agents list`,
        { timeout: 10000 }
      );
      const alive = stdout.includes(agentId);
      return { id: agentId, alive, lastSeen: alive ? new Date().toISOString() : null };
    } catch {
      return { id: agentId, alive: false, lastSeen: null };
    }
  }
}
