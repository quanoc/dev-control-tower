/**
 * Output Parser - Simplified
 *
 * Parses agent output as JSON. If parsing fails, returns raw output as fallback.
 * Supports OpenClaw response format: { result: { payloads: [{ text: "..." }] } }
 */

import type { StepOutput, ParsedOutput, NextStepInput } from './types.js';
import type { Artifact, ArtifactType } from '../executors/interface';

/**
 * OutputParser extracts structured StepOutput from agent output.
 * Expects JSON format, falls back to raw output if parsing fails.
 */
export class OutputParser {
  /**
   * Parse raw agent output into StepOutput.
   * Tries JSON parsing first, then extracts URLs as artifacts.
   */
  parse(rawOutput: string): ParsedOutput {
    // 1. Try to extract from OpenClaw response format first
    const openclawOutput = this.tryExtractOpenClawResponse(rawOutput);
    const textToParse = openclawOutput || rawOutput;

    // 2. Try to find JSON in the output
    const jsonOutput = this.tryParseJson(textToParse);
    if (jsonOutput) {
      return {
        output: jsonOutput,
        rawOutput,
        success: true,
      };
    }

    // 3. Fallback: extract URLs as artifacts, use raw as summary
    const artifacts = this.extractUrls(textToParse);
    const fallbackOutput: StepOutput = {
      artifacts,
      nextStepInput: {
        summary: this.truncate(textToParse, 300),
      },
    };

    return {
      output: fallbackOutput,
      rawOutput,
      success: true,
      error: 'JSON parsing failed, using fallback extraction',
    };
  }

  /**
   * Try to extract text from OpenClaw response format.
   * Format: { result: { payloads: [{ text: "..." }] } }
   */
  private tryExtractOpenClawResponse(output: string): string | null {
    try {
      const parsed = JSON.parse(output);

      // Check for OpenClaw response structure
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;

        // Try result.payloads[0].text
        if (obj.result && typeof obj.result === 'object') {
          const result = obj.result as Record<string, unknown>;
          if (Array.isArray(result.payloads) && result.payloads.length > 0) {
            const firstPayload = result.payloads[0];
            if (firstPayload && typeof firstPayload === 'object' && typeof firstPayload.text === 'string') {
              return firstPayload.text;
            }
          }
        }

        // Try finalAssistantVisibleText (alternative OpenClaw format)
        if (typeof obj.finalAssistantVisibleText === 'string') {
          return obj.finalAssistantVisibleText;
        }

        // Try finalAssistantRawText
        if (typeof obj.finalAssistantRawText === 'string') {
          return obj.finalAssistantRawText;
        }
      }
    } catch {
      // Not valid JSON, return null
    }

    return null;
  }

  /**
   * Try to parse JSON from output.
   * Supports: pure JSON, JSON in code block, or JSON embedded in text.
   */
  private tryParseJson(output: string): StepOutput | null {
    // Try JSON code block first
    const jsonBlockMatch = output.match(/```json\s*\n([\s\S]*?)\n```/);
    if (jsonBlockMatch) {
      try {
        return this.validateStepOutput(JSON.parse(jsonBlockMatch[1]));
      } catch {
        // Continue to other methods
      }
    }

    // Try finding JSON object in output
    const jsonObjectMatch = output.match(/\{[\s\S]*"artifacts"[\s\S]*"nextStepInput"[\s\S]*\}/);
    if (jsonObjectMatch) {
      try {
        return this.validateStepOutput(JSON.parse(jsonObjectMatch[0]));
      } catch {
        // Continue to other methods
      }
    }

    // Try direct JSON parse
    try {
      const parsed = JSON.parse(output);
      return this.validateStepOutput(parsed);
    } catch {
      return null;
    }
  }

  /**
   * Validate and normalize StepOutput.
   */
  private validateStepOutput(data: unknown): StepOutput | null {
    if (!data || typeof data !== 'object') return null;

    const obj = data as Record<string, unknown>;

    // Must have nextStepInput
    if (!obj.nextStepInput || typeof obj.nextStepInput !== 'object') {
      return null;
    }

    const nextStepInput = obj.nextStepInput as Record<string, unknown>;

    // nextStepInput must have summary
    if (typeof nextStepInput.summary !== 'string') {
      return null;
    }

    return {
      artifacts: this.normalizeArtifacts(obj.artifacts),
      nextStepInput: nextStepInput as NextStepInput,
    };
  }

  /**
   * Normalize artifacts array.
   */
  private normalizeArtifacts(artifacts: unknown): Artifact[] {
    if (!Array.isArray(artifacts)) return [];

    return artifacts
      .filter((a): a is Record<string, unknown> => a && typeof a === 'object' && typeof a.url === 'string')
      .map((a) => ({
        type: this.inferArtifactType(a.url as string, a.type as string),
        url: a.url as string,
        title: typeof a.title === 'string' ? a.title : undefined,
      }));
  }

  /**
   * Extract URLs from text as artifacts.
   */
  private extractUrls(text: string): Artifact[] {
    const artifacts: Artifact[] = [];

    // PR URLs
    const prPattern = /https?:\/\/[^/]+\/[^/]+\/[^/]+\/pull\/(\d+)/g;
    for (const match of text.matchAll(prPattern)) {
      artifacts.push({ type: 'pr', url: match[0], title: `PR #${match[1]}` });
    }

    // Commit URLs
    const commitPattern = /https?:\/\/[^/]+\/[^/]+\/[^/]+\/commit\/([a-f0-9]+)/g;
    for (const match of text.matchAll(commitPattern)) {
      artifacts.push({ type: 'commit', url: match[0], title: `Commit ${match[1].slice(0, 7)}` });
    }

    // Issue URLs
    const issuePattern = /https?:\/\/[^/]+\/[^/]+\/[^/]+\/issues\/(\d+)/g;
    for (const match of text.matchAll(issuePattern)) {
      artifacts.push({ type: 'other', url: match[0], title: `Issue #${match[1]}` });
    }

    // Generic URLs (limit to 5 to avoid noise)
    const urlPattern = /(https?:\/\/[^\s<>"')\]]+)/g;
    for (const match of text.matchAll(urlPattern)) {
      if (!artifacts.some((a) => a.url === match[1])) {
        artifacts.push({ type: 'other', url: match[1] });
      }
      if (artifacts.length >= 10) break;
    }

    return artifacts;
  }

  /**
   * Infer artifact type from URL.
   */
  private inferArtifactType(url: string, explicitType?: string): ArtifactType {
    if (explicitType) {
      const validTypes: ArtifactType[] = ['document', 'pr', 'commit', 'deploy', 'test_report', 'lint_report', 'security_report', 'build_artifact', 'other'];
      if (validTypes.includes(explicitType as ArtifactType)) {
        return explicitType as ArtifactType;
      }
    }

    if (url.includes('/pull/') || url.includes('/pr/')) return 'pr';
    if (url.includes('/commit/')) return 'commit';
    if (url.includes('/deploy') || url.includes('/release')) return 'deploy';
    if (url.includes('/test') || url.includes('/coverage')) return 'test_report';
    if (url.includes('/lint') || url.includes('/eslint')) return 'lint_report';
    if (url.includes('/security') || url.includes('/scan')) return 'security_report';
    if (url.includes('/build') || url.includes('/artifact')) return 'build_artifact';
    if (url.includes('/docs') || url.endsWith('.md')) return 'document';
    return 'other';
  }

  /**
   * Truncate text to specified length.
   */
  private truncate(text: string, maxLength: number): string {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.slice(0, maxLength - 3) + '...';
  }
}
