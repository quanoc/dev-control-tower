/**
 * Prompt Generator
 *
 * Generates action-specific prompts for agent execution using:
 * 1. Structured context from ContextBuilder
 * 2. Action-specific templates
 * 3. Input parameters for the action
 */

import type { ChainContext, StructuredOutput } from './types';
import type { Agent } from '@pipeline/shared';

/**
 * Action-specific prompt templates.
 */
const ACTION_PROMPTS: Record<string, { instruction: string; outputFormat: string }> = {
  requirements_analysis: {
    instruction: `Analyze the task requirements and produce a clear, structured requirements document.

Focus on:
1. Core functional requirements
2. Non-functional requirements (performance, security, scalability)
3. User acceptance criteria
4. Technical constraints
5. Dependencies and assumptions`,
    outputFormat: `Provide your output in this structured format:

## Summary
[One paragraph summary of the requirements analysis]

## Key Points
- [Point 1]
- [Point 2]
- [Point 3]

## Decisions
- **Decision**: [Decision] - **Reason**: [Why this decision was made]

## Risks
- [Risk 1]
- [Risk 2]

## Artifacts
- [Document URL or reference]`,
  },

  architecture_design: {
    instruction: `Design the system architecture based on the requirements analysis.

Focus on:
1. High-level architecture pattern (microservices, monolith, etc.)
2. Key components and their responsibilities
3. Data flow and interactions
4. Technology choices and rationale
5. Scalability and performance considerations`,
    outputFormat: `Provide your output in this structured format:

## Summary
[One paragraph summary of the architecture design]

## Key Points
- [Architecture pattern chosen]
- [Key components]
- [Data flow]

## Decisions
- **Decision**: [Technology/Pattern] - **Reason**: [Why]

## Risks
- [Potential architectural risks]

## Artifacts
- [Architecture diagram URL]
- [Design document URL]`,
  },

  tech_design: {
    instruction: `Create detailed technical design based on architecture design.

Focus on:
1. API specifications
2. Database schema
3. Module/class structure
4. Interface definitions
5. Implementation approach`,
    outputFormat: `Provide your output in this structured format:

## Summary
[One paragraph summary of the technical design]

## Key Points
- [API endpoints]
- [Database tables]
- [Key modules]

## Decisions
- **Decision**: [Implementation approach] - **Reason**: [Why]

## Artifacts
- [API spec URL]
- [Schema design URL]`,
  },

  code: {
    instruction: `Implement the functionality according to the technical design.

Focus on:
1. Writing clean, maintainable code
2. Following project conventions
3. Proper error handling
4. Testability considerations
5. Documentation where necessary`,
    outputFormat: `Provide your output in this structured format:

## Summary
[One paragraph summary of what was implemented]

## Key Points
- [Features implemented]
- [Files modified/created]

## Decisions
- **Decision**: [Implementation choice] - **Reason**: [Why]

## Artifacts
- [PR URL]
- [Commit URL]`,
  },

  code_review: {
    instruction: `Review the code implementation for quality, correctness, and best practices.

Focus on:
1. Code correctness
2. Design patterns and conventions
3. Potential bugs or issues
4. Performance considerations
5. Security concerns`,
    outputFormat: `Provide your output in this structured format:

## Summary
[One paragraph summary of the review findings]

## Key Points
- [Major findings]
- [Recommendations]

## Decisions
- **Decision**: [Approved/Changes needed] - **Reason**: [Why]

## Risks
- [Issues that need attention]

## Artifacts
- [Review report URL]`,
  },

  unit_test: {
    instruction: `Write unit tests for the implemented code.

Focus on:
1. Test coverage of core functionality
2. Edge cases and error scenarios
3. Test isolation and reliability
4. Clear test naming and organization
5. Assertion clarity`,
    outputFormat: `Provide your output in this structured format:

## Summary
[One paragraph summary of test coverage]

## Key Points
- [Test cases written]
- [Coverage percentage]

## Decisions
- **Decision**: [Test approach] - **Reason**: [Why]

## Artifacts
- [Test report URL]`,
  },

  integration_test: {
    instruction: `Write integration tests for the system components.

Focus on:
1. Integration scenarios
2. API endpoint testing
3. Database interactions
4. Service communication
5. Error handling flows`,
    outputFormat: `Provide your output in this structured format:

## Summary
[One paragraph summary of integration test coverage]

## Key Points
- [Integration scenarios tested]
- [Coverage areas]

## Decisions
- **Decision**: [Test approach] - **Reason**: [Why]

## Artifacts
- [Integration test report URL]`,
  },

  security_scan: {
    instruction: `Analyze the code for security vulnerabilities and concerns.

Focus on:
1. OWASP Top 10 vulnerabilities
2. Authentication and authorization
3. Input validation and sanitization
4. Data protection
5. Dependency security`,
    outputFormat: `Provide your output in this structured format:

## Summary
[One paragraph summary of security analysis]

## Key Points
- [Vulnerabilities found]
- [Security measures in place]

## Decisions
- **Decision**: [Security status] - **Reason**: [Why]

## Risks
- [Security risks identified]

## Artifacts
- [Security report URL]`,
  },

  deploy: {
    instruction: `Prepare and execute deployment of the implemented changes.

Focus on:
1. Deployment preparation checklist
2. Environment configuration
3. Rollout strategy
4. Monitoring setup
5. Rollback plan`,
    outputFormat: `Provide your output in this structured format:

## Summary
[One paragraph summary of deployment status]

## Key Points
- [Deployment steps completed]
- [Environment deployed to]

## Decisions
- **Decision**: [Deployment strategy] - **Reason**: [Why]

## Artifacts
- [Deploy URL]
- [Deployment log URL]`,
  },

  documentation: {
    instruction: `Create documentation for the implemented functionality.

Focus on:
1. User documentation
2. API documentation
3. Architecture overview
4. Configuration guide
5. Troubleshooting guide`,
    outputFormat: `Provide your output in this structured format:

## Summary
[One paragraph summary of documentation created]

## Key Points
- [Documentation sections]
- [Coverage areas]

## Artifacts
- [Documentation URL]`,
  },

  // Default template for unknown action types
  _default: {
    instruction: `Execute the assigned task based on the provided context.

Focus on:
1. Understanding the requirements
2. Following best practices
3. Producing quality output
4. Documenting key decisions`,
    outputFormat: `Provide your output in this structured format:

## Summary
[One paragraph summary]

## Key Points
- [Key point 1]
- [Key point 2]

## Decisions
- **Decision**: [Decision] - **Reason**: [Why]

## Artifacts
- [Artifact URLs]`,
  },
};

/**
 * PromptGenerator generates prompts for agent execution.
 */
export class PromptGenerator {
  /**
   * Generate a complete prompt for agent execution.
   *
   * @param context - ChainContext with relevant previous outputs
   * @param agent - Agent to execute
   * @param inputParams - Input parameters for this action
   * @returns Complete prompt string
   */
  generate(
    context: ChainContext,
    agent: Agent,
    inputParams: Record<string, any>
  ): string {
    const actionPrompt = ACTION_PROMPTS[context.actionType] || ACTION_PROMPTS._default;

    const sections: string[] = [];

    // 1. Agent identity section
    sections.push(this.buildAgentSection(agent));

    // 2. Task section (current action)
    sections.push(this.buildTaskSection(context, actionPrompt, inputParams));

    // 3. Context section (relevant previous outputs)
    if (context.relevantOutputs.length > 0) {
      sections.push(this.buildContextSection(context));
    }

    // 4. Artifacts section (accumulated from previous stages)
    if (context.accumulatedArtifacts.length > 0) {
      sections.push(this.buildArtifactsSection(context));
    }

    // 5. Approvals section (approval history)
    if (context.approvals.length > 0) {
      sections.push(this.buildApprovalsSection(context));
    }

    // 6. Pipeline/Task info section
    if (context.pipelineInfo || context.taskInfo) {
      sections.push(this.buildInfoSection(context));
    }

    // 7. Output format reminder
    sections.push(this.buildOutputFormatSection(actionPrompt));

    return sections.join('\n\n---\n\n');
  }

  /**
   * Build agent identity section.
   */
  private buildAgentSection(agent: Agent): string {
    return `## Agent Role

You are **${agent.name}**, an AI agent specialized in ${agent.description || 'software development tasks'}.

${agent.skills?.length > 0 ? `Available skills: ${agent.skills.map((s: { name: string }) => s.name).join(', ')}` : ''}`;
  }

  /**
   * Build task section with action-specific instructions.
   */
  private buildTaskSection(
    context: ChainContext,
    actionPrompt: { instruction: string; outputFormat: string },
    inputParams: Record<string, any>
  ): string {
    let section = `## Current Task

**Action Type**: ${context.actionType}
**Stage**: ${context.currentStageKey}

### Instructions

${actionPrompt.instruction}`;

    // Add input parameters if present
    if (inputParams && Object.keys(inputParams).length > 0) {
      section += `\n\n### Input Parameters\n\n`;
      for (const [key, value] of Object.entries(inputParams)) {
        section += `- **${key}**: ${JSON.stringify(value)}\n`;
      }
    }

    return section;
  }

  /**
   * Build context section from relevant previous outputs.
   */
  private buildContextSection(context: ChainContext): string {
    let section = `## Context from Previous Stages

The following outputs from previous pipeline stages are relevant to your task:

`;

    for (const output of context.relevantOutputs) {
      section += this.formatOutputSummary(output);
      section += '\n\n';
    }

    return section.trim();
  }

  /**
   * Format a single output summary for context.
   */
  private formatOutputSummary(output: {
    stageKey: string;
    stageRunId: number;
    status: string;
    output: StructuredOutput;
  }): string {
    const lines: string[] = [];

    lines.push(`### ${output.stageKey} (Status: ${output.status})`);

    if (output.output.summary) {
      lines.push(`**Summary**: ${output.output.summary}`);
    }

    if (output.output.keyPoints.length > 0) {
      lines.push(`**Key Points**:`);
      for (const point of output.output.keyPoints) {
        lines.push(`- ${point}`);
      }
    }

    if (output.output.decisions.length > 0) {
      lines.push(`**Decisions**:`);
      for (const d of output.output.decisions) {
        lines.push(`- **${d.decision}** - Reason: ${d.reason}`);
      }
    }

    if (output.output.risks && output.output.risks.length > 0) {
      lines.push(`**Risks**:`);
      for (const risk of output.output.risks) {
        lines.push(`- ${risk}`);
      }
    }

    if (output.output.artifacts.length > 0) {
      lines.push(`**Artifacts**:`);
      for (const artifact of output.output.artifacts) {
        lines.push(`- [${artifact.title || artifact.type}](${artifact.url})`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build artifacts section.
   */
  private buildArtifactsSection(context: ChainContext): string {
    let section = `## Accumulated Artifacts

The following artifacts have been produced in previous stages:

`;

    for (const artifact of context.accumulatedArtifacts) {
      section += `- **${artifact.type}**: [${artifact.title || artifact.url}](${artifact.url})\n`;
    }

    return section;
  }

  /**
   * Build approvals section.
   */
  private buildApprovalsSection(context: ChainContext): string {
    let section = `## Approval History

`;

    for (const approval of context.approvals) {
      const status = approval.approved ? '✅ Approved' : '❌ Rejected';
      section += `- **${approval.stageKey}**: ${status}`;
      if (approval.comment) {
        section += ` - "${approval.comment}"`;
      }
      section += '\n';
    }

    return section;
  }

  /**
   * Build pipeline/task info section.
   */
  private buildInfoSection(context: ChainContext): string {
    let section = `## Background Information

`;

    if (context.pipelineInfo) {
      section += `**Pipeline**: ${context.pipelineInfo.name}\n`;
      if (context.pipelineInfo.description) {
        section += `Description: ${context.pipelineInfo.description}\n`;
      }
    }

    if (context.taskInfo) {
      section += `**Task**: ${context.taskInfo.title}\n`;
      if (context.taskInfo.description) {
        section += `Description: ${context.taskInfo.description}\n`;
      }
      if (context.taskInfo.requirements) {
        section += `\n### Task Requirements\n\n${context.taskInfo.requirements}\n`;
      }
    }

    return section;
  }

  /**
   * Build output format reminder section.
   */
  private buildOutputFormatSection(
    actionPrompt: { instruction: string; outputFormat: string }
  ): string {
    return `## Expected Output Format

${actionPrompt.outputFormat}

**Important**: Ensure your output follows this structured format so it can be parsed and passed to subsequent pipeline stages.`;
  }

  /**
   * Get the action prompt template for a given action type.
   */
  getActionPrompt(actionType: string): { instruction: string; outputFormat: string } {
    return ACTION_PROMPTS[actionType] || ACTION_PROMPTS._default;
  }
}