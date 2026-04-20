/**
 * Prompt Generator - Simplified
 *
 * Generates prompts based on step's goal, expectedOutput, and nextStepHint.
 * Requires agent to output JSON format.
 */

import type { StepContext, StepOutput } from './types.js';
import type { Agent } from '@pipeline/shared';

/**
 * PromptGenerator generates prompts for agent execution.
 */
export class PromptGenerator {
  /**
   * Generate a complete prompt for agent execution.
   */
  generate(
    context: StepContext,
    agent: Agent
  ): string {
    const sections: string[] = [];

    // 1. Agent identity
    sections.push(this.buildAgentSection(agent));

    // 2. Task info
    sections.push(this.buildTaskSection(context));

    // 3. Previous step's output (if any)
    if (context.previousOutput) {
      sections.push(this.buildPreviousOutputSection(context.previousOutput));
    }

    // 4. Current step's goal and expected output
    sections.push(this.buildGoalSection(context));

    // 5. Output format requirement
    sections.push(this.buildOutputFormatSection(context));

    return sections.join('\n\n---\n\n');
  }

  /**
   * Build agent identity section.
   */
  private buildAgentSection(agent: Agent): string {
    return `## Agent Role

You are **${agent.name}**, an AI agent.
${agent.description ? `\n${agent.description}` : ''}`;
  }

  /**
   * Build task info section.
   */
  private buildTaskSection(context: StepContext): string {
    return `## Task Information

**Title**: ${context.task.title}

**Description**: ${context.task.description || 'No description provided'}

**Pipeline**: ${context.pipeline.templateName} (Progress: ${context.pipeline.progress})`;
  }

  /**
   * Build previous step's output section.
   */
  private buildPreviousOutputSection(previousOutput: StepOutput): string {
    let section = `## Previous Step's Output

The previous step completed with the following results:

### Summary
${previousOutput.nextStepInput.summary}

`;

    if (previousOutput.nextStepInput.keyPoints?.length) {
      section += `### Key Points\n`;
      for (const point of previousOutput.nextStepInput.keyPoints) {
        section += `- ${point}\n`;
      }
      section += '\n';
    }

    if (previousOutput.nextStepInput.decisions?.length) {
      section += `### Decisions Made\n`;
      for (const d of previousOutput.nextStepInput.decisions) {
        section += `- **${d.decision}**`;
        if (d.reason) section += ` (Reason: ${d.reason})`;
        section += '\n';
      }
      section += '\n';
    }

    if (previousOutput.nextStepInput.recommendations?.length) {
      section += `### Recommendations for This Step\n`;
      for (const r of previousOutput.nextStepInput.recommendations) {
        section += `- ${r}\n`;
      }
      section += '\n';
    }

    if (previousOutput.artifacts?.length) {
      section += `### Artifacts from Previous Step\n`;
      for (const a of previousOutput.artifacts) {
        section += `- [${a.title || a.type}](${a.url})\n`;
      }
    }

    return section.trim();
  }

  /**
   * Build current step's goal section.
   */
  private buildGoalSection(context: StepContext): string {
    let section = `## Your Goal

**${context.currentStep.goal}**

`;

    if (context.currentStep.expectedOutput?.length) {
      section += `### Expected Output\n`;
      for (const output of context.currentStep.expectedOutput) {
        section += `- ${output}\n`;
      }
      section += '\n';
    }

    if (context.currentStep.nextStepHint) {
      section += `### Information for Next Step\n`;
      section += `Please include in your output: ${context.currentStep.nextStepHint}\n`;
    }

    return section.trim();
  }

  /**
   * Build output format section - requires JSON output.
   */
  private buildOutputFormatSection(context: StepContext): string {
    const nextStepHint = context.currentStep.nextStepHint
      ? `\n    // ${context.currentStep.nextStepHint}`
      : '';

    return `## Output Format (IMPORTANT)

You MUST output your result in the following JSON format:

\`\`\`json
{
  "artifacts": [
    { "type": "pr|document|deploy|test_report|other", "url": "https://...", "title": "..." }
  ],
  "nextStepInput": {
    "summary": "One-line summary of what you did (required)",
    "keyPoints": ["Key point 1", "Key point 2"],
    "decisions": [
      { "decision": "What you decided", "reason": "Why you decided this" }
    ],
    "recommendations": ["Suggestion for the next step"]${nextStepHint}
  }
}
\`\`\`

**Important**:
1. Output valid JSON only, no additional text
2. \`summary\` is required in \`nextStepInput\`
3. Include any artifacts (PR links, doc links) you produced
4. Provide useful information for the next step in \`nextStepInput\``;
  }
}
