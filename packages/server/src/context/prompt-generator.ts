/**
 * Prompt Generator - Layered Context Design
 *
 * Generates prompts based on:
 * - Task context (shared across all phases)
 * - Phase context (shared within phase)
 * - Step context (goal, inputContract, outputContract)
 */

import type { StepContext, StepOutput } from './types.js';
import type { Agent, RuntimeContext, OutputContract } from '@pipeline/shared';

export class PromptGenerator {
  /**
   * Generate a complete prompt for agent execution.
   */
  generate(context: StepContext, agent: Agent): string {
    const sections: string[] = [];

    // 1. Agent identity
    sections.push(this.buildAgentSection(agent));

    // 2. Task context (任务级，所有 Agent 共享)
    sections.push(this.buildTaskContextSection(context));

    // 3. Phase context (阶段级，同 Phase 内共享)
    if (context.phase) {
      sections.push(this.buildPhaseContextSection(context.phase));
    }

    // 4. Step context (步骤级，当前步骤特定)
    sections.push(this.buildStepContextSection(context));

    // 5. Goal and output contract
    sections.push(this.buildGoalSection(context));

    // 6. Output format requirement
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
   * Build task context section (任务级上下文).
   */
  private buildTaskContextSection(context: StepContext): string {
    let section = `## Task Context (Task Level)

**Title**: ${context.task.title}

**Description**: ${context.task.description || 'No description provided'}

**Pipeline**: ${context.pipeline.templateName} (Progress: ${context.pipeline.progress})`;

    if (context.task.background) {
      section += `\n\n**Background**: ${context.task.background}`;
    }

    if (context.task.constraints?.length) {
      section += `\n\n**Task Constraints**:\n`;
      for (const c of context.task.constraints) {
        section += `- ${c}\n`;
      }
    }

    return section;
  }

  /**
   * Build phase context section (阶段级上下文).
   */
  private buildPhaseContextSection(phase: NonNullable<StepContext['phase']>): string {
    let section = `## Phase Context: ${phase.label}

**Phase Goal**: ${phase.goal}`;

    if (phase.constraints?.length) {
      section += `\n\n**Phase Constraints**:\n`;
      for (const c of phase.constraints) {
        section += `- ${c}\n`;
      }
    }

    if (phase.decisions?.length) {
      section += `\n\n**Decisions Made in This Phase**:\n`;
      for (const d of phase.decisions) {
        section += `- **${d.decision}** (from ${d.from})`;
        if (d.reason) section += ` - ${d.reason}`;
        section += '\n';
      }
    }

    if (phase.artifacts?.length) {
      section += `\n\n**Phase Artifacts**:\n`;
      for (const a of phase.artifacts) {
        section += `- [${a.title || a.type}](${a.url})\n`;
      }
    }

    return section;
  }

  /**
   * Build step context section (步骤级上下文).
   */
  private buildStepContextSection(context: StepContext): string {
    const sections: string[] = [];

    // Previous step's output
    if (context.step.previousOutput) {
      sections.push(this.buildPreviousOutputSection(context.step.previousOutput));
    }

    // Step history (for retries)
    if (context.step.history?.length) {
      sections.push(this.buildHistorySection(context.step.history));
    }

    if (sections.length === 0) {
      return `## Step Context

This is the first step in this phase.`;
    }

    return sections.join('\n\n');
  }

  /**
   * Build previous step's output section.
   */
  private buildPreviousOutputSection(previousOutput: StepOutput): string {
    let section = `## Previous Step's Output

**Summary**: ${previousOutput.nextStepInput.summary}`;

    if (previousOutput.nextStepInput.keyPoints?.length) {
      section += `\n\n**Key Points**:\n`;
      for (const point of previousOutput.nextStepInput.keyPoints) {
        section += `- ${point}\n`;
      }
    }

    if (previousOutput.nextStepInput.decisions?.length) {
      section += `\n\n**Decisions Made**:\n`;
      for (const d of previousOutput.nextStepInput.decisions) {
        section += `- **${d.decision}**`;
        if (d.reason) section += ` (Reason: ${d.reason})`;
        section += '\n';
      }
    }

    if (previousOutput.nextStepInput.recommendations?.length) {
      section += `\n\n**Recommendations for This Step**:\n`;
      for (const r of previousOutput.nextStepInput.recommendations) {
        section += `- ${r}\n`;
      }
    }

    if (previousOutput.artifacts?.length) {
      section += `\n\n**Artifacts**:\n`;
      for (const a of previousOutput.artifacts) {
        section += `- [${a.title || a.type}](${a.url})\n`;
      }
    }

    return section;
  }

  /**
   * Build history section (for retry scenarios).
   */
  private buildHistorySection(
    history: Array<{ stageKey: string; attempt: number; result: 'success' | 'failure'; error?: string }>
  ): string {
    let section = `## Previous Attempts

This step has been attempted before:\n`;

    for (const h of history) {
      section += `- Attempt ${h.attempt}: **${h.result.toUpperCase()}**`;
      if (h.error) section += ` - ${h.error}`;
      section += '\n';
    }

    section += '\nPlease learn from previous attempts and avoid the same mistakes.';

    return section;
  }

  /**
   * Build goal section with input/output contracts.
   */
  private buildGoalSection(context: StepContext): string {
    const { currentStep } = context;
    let section = `## Your Goal

**${currentStep.goal}**`;

    // Input contract - what this step needs
    if (currentStep.inputContract) {
      const input = currentStep.inputContract;
      section += `\n\n### Input Requirements`;

      if (input.requires?.length) {
        section += `\nYou need the following inputs:\n`;
        for (const r of input.requires) {
          section += `- ${r}\n`;
        }
      }

      if (input.focusFields?.length) {
        section += `\nFocus on these fields:\n`;
        for (const f of input.focusFields) {
          section += `- ${f}\n`;
        }
      }

      if (input.hint) {
        section += `\n**Hint**: ${input.hint}`;
      }
    }

    // Output contract - what this step should produce
    if (currentStep.outputContract) {
      section += this.buildOutputContractSection(currentStep.outputContract);
    }

    // Review criteria
    if (currentStep.criteria?.length) {
      section += `\n\n### Success Criteria\n`;
      for (const c of currentStep.criteria) {
        section += `- ${c}\n`;
      }
    }

    return section;
  }

  /**
   * Build output contract section.
   */
  private buildOutputContractSection(contract: OutputContract): string {
    let section = `\n\n### Expected Output`;

    if (contract.requiredFields?.length) {
      section += `\nYou MUST provide:\n`;
      for (const field of contract.requiredFields) {
        const def = contract.fields?.[field];
        if (def) {
          section += `- **${field}** (${def.type})`;
          if (def.description) section += `: ${def.description}`;
          if (def.required !== false) section += ` (required)`;
          section += '\n';
        } else {
          section += `- **${field}** (required)\n`;
        }
      }
    }

    if (contract.example) {
      section += `\n**Example**:\n\`\`\`json\n${JSON.stringify(contract.example, null, 2)}\n\`\`\``;
    }

    return section;
  }

  /**
   * Build output format section - requires JSON output.
   */
  private buildOutputFormatSection(context: StepContext): string {
    const { currentStep } = context;

    // Generate field hints based on output contract
    let fieldExamples = `
    "summary": "One-line summary of what you did",`;

    if (currentStep.outputContract?.requiredFields) {
      for (const field of currentStep.outputContract.requiredFields) {
        if (field !== 'summary') {
          fieldExamples += `
    "${field}": "...",`;
        }
      }
    }

    return `## Output Format (IMPORTANT)

You MUST output your result in the following JSON format:

\`\`\`json
{
  "artifacts": [
    { "type": "pr|document|deploy|test_report|other", "url": "https://...", "title": "..." }
  ],
  "nextStepInput": {${fieldExamples}
    "keyPoints": ["Key point 1", "Key point 2"],
    "decisions": [
      { "decision": "What you decided", "reason": "Why you decided this" }
    ],
    "recommendations": ["Suggestion for the next step"]
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
