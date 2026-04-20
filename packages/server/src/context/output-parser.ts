/**
 * Output Parser
 *
 * Parses raw agent output into structured StructuredOutput format.
 * Supports multiple output formats: Markdown, JSON, and mixed formats.
 */

import type { Artifact, ArtifactType } from '../executors/interface';
import type { StructuredOutput, ParsedOutput, ContextBuilderConfig } from './types';
import { DEFAULT_CONTEXT_CONFIG } from './types';

/**
 * OutputParser extracts structured information from agent output.
 */
export class OutputParser {
  private config: ContextBuilderConfig;

  constructor(config?: Partial<ContextBuilderConfig>) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  }

  /**
   * Parse raw agent output into structured format.
   *
   * @param rawOutput - Raw output text from agent
   * @param actionType - Action type for context-specific parsing
   * @returns ParsedOutput with structured data and confidence level
   */
  parse(rawOutput: string, actionType: string): ParsedOutput {
    const warnings: string[] = [];
    let confidence = 0;

    // Try JSON parsing first (highest confidence)
    const jsonResult = this.tryParseJson(rawOutput);
    if (jsonResult) {
      return {
        structured: jsonResult,
        confidence: 1,
        warnings: [],
      };
    }

    // Try structured Markdown parsing
    const markdownResult = this.parseMarkdown(rawOutput);
    confidence = this.calculateConfidence(markdownResult, actionType);

    // Check for missing fields
    if (!markdownResult.summary) {
      warnings.push('Could not extract summary from output');
    }
    if (markdownResult.keyPoints.length === 0) {
      warnings.push('Could not extract key points from output');
    }

    // Ensure summary is within limit
    if (markdownResult.summary.length > this.config.maxSummaryLength) {
      markdownResult.summary = markdownResult.summary.slice(0, this.config.maxSummaryLength);
      warnings.push(`Summary truncated to ${this.config.maxSummaryLength} characters`);
    }

    // Ensure key points are within limit
    if (markdownResult.keyPoints.length > this.config.maxKeyPoints) {
      markdownResult.keyPoints = markdownResult.keyPoints.slice(0, this.config.maxKeyPoints);
      warnings.push(`Key points truncated to ${this.config.maxKeyPoints} items`);
    }

    return {
      structured: markdownResult,
      confidence,
      warnings,
    };
  }

  /**
   * Try to parse output as JSON.
   */
  private tryParseJson(output: string): StructuredOutput | null {
    // Try to find JSON in the output
    const jsonMatch = output.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        return null;
      }
    }

    // Try direct JSON parse
    try {
      const parsed = JSON.parse(output);
      if (parsed.summary || parsed.keyPoints) {
        return {
          summary: parsed.summary || '',
          keyPoints: parsed.keyPoints || [],
          decisions: parsed.decisions || [],
          risks: parsed.risks || [],
          artifacts: parsed.artifacts || [],
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Parse structured Markdown output.
   */
  private parseMarkdown(output: string): StructuredOutput {
    return {
      summary: this.extractSummary(output),
      keyPoints: this.extractKeyPoints(output),
      decisions: this.extractDecisions(output),
      risks: this.extractRisks(output),
      artifacts: this.extractArtifacts(output),
      rawOutputRef: this.config.includeRawOutputRef ? `output-${Date.now()}` : undefined,
    };
  }

  /**
   * Extract summary from markdown output.
   */
  private extractSummary(output: string): string {
    // Try explicit Summary section
    const summarySection = output.match(/## Summary\s*\n([\s\S]*?)(?=\n##|\n---|\n$)/);
    if (summarySection) {
      return this.cleanText(summarySection[1]);
    }

    // Try first paragraph after title
    const firstParagraph = output.match(/^#.*\n+([^#\n].+)/);
    if (firstParagraph) {
      return this.cleanText(firstParagraph[1]);
    }

    // Try first non-empty paragraph
    const firstBlock = output.match(/([^\n#].+)/);
    if (firstBlock) {
      return this.cleanText(firstBlock[1]);
    }

    // Fallback: truncate output
    return this.cleanText(output.slice(0, this.config.maxSummaryLength));
  }

  /**
   * Extract key points from markdown output.
   */
  private extractKeyPoints(output: string): string[] {
    // Try Key Points section
    const keyPointsSection = output.match(/## Key Points\s*\n([\s\S]*?)(?=\n##|\n---|\n$)/);
    if (keyPointsSection) {
      return this.extractBulletPoints(keyPointsSection[1]);
    }

    // Try bullet points anywhere
    const bullets = output.match(/(?:^|\n)[-*]\s+(.+)/g);
    if (bullets) {
      return bullets
        .map(b => b.replace(/[-*]\s+/, '').trim())
        .filter(b => b.length > 0)
        .slice(0, this.config.maxKeyPoints);
    }

    return [];
  }

  /**
   * Extract decisions from markdown output.
   */
  private extractDecisions(output: string): Array<{ decision: string; reason: string }> {
    const decisions: Array<{ decision: string; reason: string }> = [];

    // Try Decisions section with specific format
    const decisionsSection = output.match(/## Decisions\s*\n([\s\S]*?)(?=\n##|\n---|\n$)/);
    if (decisionsSection) {
      // Match "**Decision**: ... - **Reason**: ..." format
      const decisionMatches = decisionsSection[1].matchAll(
        /\*?\*?Decision\*?\*?:?\s*(.+?)\s*-\s*\*?\*?Reason\*?\*?:?\s*(.+)/g
      );
      for (const match of decisionMatches) {
        decisions.push({
          decision: this.cleanText(match[1]),
          reason: this.cleanText(match[2]),
        });
      }

      // Also try simple bullet format
      if (decisions.length === 0) {
        const bullets = this.extractBulletPoints(decisionsSection[1]);
        for (const bullet of bullets) {
          decisions.push({
            decision: bullet,
            reason: 'Not specified',
          });
        }
      }
    }

    return decisions;
  }

  /**
   * Extract risks from markdown output.
   */
  private extractRisks(output: string): string[] {
    const risksSection = output.match(/## Risks\s*\n([\s\S]*?)(?=\n##|\n---|\n$)/);
    if (risksSection) {
      return this.extractBulletPoints(risksSection[1]);
    }

    // Also check for "Concerns" or "Issues" sections
    const concernsSection = output.match(/## (?:Concerns|Issues)\s*\n([\s\S]*?)(?=\n##|\n---|\n$)/);
    if (concernsSection) {
      return this.extractBulletPoints(concernsSection[1]);
    }

    return [];
  }

  /**
   * Extract artifacts from markdown output.
   */
  private extractArtifacts(output: string): Artifact[] {
    const artifacts: Artifact[] = [];

    // Try Artifacts section
    const artifactsSection = output.match(/## Artifacts\s*\n([\s\S]*?)(?=\n##|\n---|\n$)/);
    if (artifactsSection) {
      // Match markdown links: [title](url)
      const linkMatches = artifactsSection[1].matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
      for (const match of linkMatches) {
        artifacts.push(this.createArtifact(match[2], match[1]));
      }

      // Also match plain URLs
      const urlMatches = artifactsSection[1].matchAll(/(https?:\/\/[^\s]+)/g);
      for (const match of urlMatches) {
        // Skip if already captured as link
        const alreadyExists = artifacts.some(a => a.url === match[1]);
        if (!alreadyExists) {
          artifacts.push(this.createArtifact(match[1]));
        }
      }
    }

    // Also scan entire output for PR/commit/deploy URLs
    const prPattern = /https?:\/\/[^/]+\/[^/]+\/[^/]+\/pull\/(\d+)/g;
    const commitPattern = /https?:\/\/[^/]+\/[^/]+\/[^/]+\/commit\/([a-f0-9]+)/g;
    const issuePattern = /https?:\/\/[^/]+\/[^/]+\/[^/]+\/issues\/(\d+)/g;

    for (const match of output.matchAll(prPattern)) {
      const url = match[0];
      if (!artifacts.some(a => a.url === url)) {
        artifacts.push({ type: 'pr', url, title: `PR #${match[1]}` });
      }
    }

    for (const match of output.matchAll(commitPattern)) {
      const url = match[0];
      if (!artifacts.some(a => a.url === url)) {
        artifacts.push({ type: 'commit', url, title: `Commit ${match[1].slice(0, 7)}` });
      }
    }

    for (const match of output.matchAll(issuePattern)) {
      const url = match[0];
      if (!artifacts.some(a => a.url === url)) {
        artifacts.push({ type: 'other', url, title: `Issue #${match[1]}` });
      }
    }

    return artifacts;
  }

  /**
   * Extract bullet points from text.
   */
  private extractBulletPoints(text: string): string[] {
    const bullets = text.match(/(?:^|\n)[-*]\s+(.+)/g);
    if (bullets) {
      return bullets
        .map(b => b.replace(/[-*]\s+/, '').trim())
        .filter(b => b.length > 0);
    }
    return [];
  }

  /**
   * Clean text by removing markdown formatting.
   */
  private cleanText(text: string): string {
    return text
      .replace(/```[\w]*\n?/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\n+/g, ' ')
      .trim();
  }

  /**
   * Create an artifact from URL and optional title.
   */
  private createArtifact(url: string, title?: string): Artifact {
    const type = this.inferArtifactType(url);
    return {
      type,
      url,
      title: title || this.generateDefaultTitle(url, type),
    };
  }

  /**
   * Infer artifact type from URL.
   */
  private inferArtifactType(url: string): ArtifactType {
    if (url.includes('/pull/') || url.includes('/pr/')) return 'pr';
    if (url.includes('/commit/')) return 'commit';
    if (url.includes('/deploy') || url.includes('/release')) return 'deploy';
    if (url.includes('/test') || url.includes('/coverage')) return 'test_report';
    if (url.includes('/lint') || url.includes('/eslint')) return 'lint_report';
    if (url.includes('/security') || url.includes('/scan')) return 'security_report';
    if (url.includes('/build') || url.includes('/artifact')) return 'build_artifact';
    if (url.includes('/docs') || url.includes('/documentation')) return 'document';
    return 'other';
  }

  /**
   * Generate default title for artifact.
   */
  private generateDefaultTitle(url: string, type: ArtifactType): string {
    const parts = url.split('/');
    const lastPart = parts[parts.length - 1] || '';

    switch (type) {
      case 'pr':
        return `PR ${lastPart}`;
      case 'commit':
        return `Commit ${lastPart.slice(0, 7)}`;
      case 'deploy':
        return `Deployment ${lastPart}`;
      case 'test_report':
        return 'Test Report';
      case 'lint_report':
        return 'Lint Report';
      case 'security_report':
        return 'Security Report';
      case 'build_artifact':
        return 'Build Artifact';
      case 'document':
        return 'Documentation';
      default:
        return lastPart || 'Artifact';
    }
  }

  /**
   * Calculate confidence level based on extracted fields.
   */
  private calculateConfidence(output: StructuredOutput, actionType: string): number {
    let confidence = 0;

    // Summary presence (most important)
    if (output.summary.length > 10) confidence += 0.3;
    else if (output.summary.length > 0) confidence += 0.1;

    // Key points presence
    if (output.keyPoints.length >= 3) confidence += 0.2;
    else if (output.keyPoints.length > 0) confidence += 0.1;

    // Decisions presence (important for certain actions)
    if (['architecture_design', 'tech_design', 'code', 'code_review'].includes(actionType)) {
      if (output.decisions.length > 0) confidence += 0.2;
    }

    // Artifacts presence (important for output-producing actions)
    if (['code', 'deploy', 'documentation', 'unit_test'].includes(actionType)) {
      if (output.artifacts.length > 0) confidence += 0.2;
    }

    // Risks presence (important for analysis actions)
    if (['requirements_analysis', 'architecture_design', 'security_scan'].includes(actionType)) {
      if (output.risks && output.risks.length > 0) confidence += 0.1;
    }

    return Math.min(confidence, 1);
  }
}