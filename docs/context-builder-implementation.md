# Context Builder Implementation Design

> 设计日期：2026-04-20
> 目的：定义流水线上下文传递的实现方案

---

## 1. 核心问题

当流水线执行到某个 Agent Step 时，需要：

```
调用 Agent → 传递合适的 Prompt → Agent 执行 → 解析输出 → 存储结果
```

**关键问题**：如何构建"合适的 Prompt"？

---

## 2. 设计原则

基于调研结论：

| 原则 | 说明 |
|------|------|
| **不传全量** | 只传递关键摘要，不传递完整输出 |
| **按需筛选** | 根据 action 类型选择相关的前序上下文 |
| **结构化输出** | 要求 Agent 按预定义格式输出 |
| **长度控制** | 每个摘要限制字数，避免 token 爆炸 |

---

## 3. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Pipeline Executor                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   AgentExecutor.execute()                    │
│                                                              │
│  1. ContextBuilder.build(instanceId, stageRunId, action)     │
│     → ChainContext                                           │
│                                                              │
│  2. PromptGenerator.generate(context, action, agentType)     │
│     → Final Prompt                                           │
│                                                              │
│  3. AgentClient.sendMessage(agentId, prompt)                 │
│     → Raw Output                                             │
│                                                              │
│  4. OutputParser.parse(rawOutput, action)                    │
│     → StructuredOutput                                       │
│                                                              │
│  5. Store structured_output + summary                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 数据结构定义

### 4.1 ChainContext（链式上下文）

```typescript
interface ChainContext {
  // 原始任务信息
  task: {
    id: number;
    title: string;
    description: string;
    createdBy: string;
  };

  // 流水线信息
  pipeline: {
    id: number;
    templateName: string;
    currentStageIndex: number;
    totalStages: number;
  };

  // 当前阶段信息
  currentStage: {
    id: number;
    stageKey: string;
    stepLabel: string;
    action: string;
    agentId: string;
    phaseKey: string;
  };

  // 相关前序输出（按依赖规则筛选）
  relevantOutputs: StageOutputSummary[];

  // 累积产物链接
  accumulatedArtifacts: Artifact[];

  // 审批决策
  approvals: ApprovalRecord[];

  // 失败历史（重试时需要）
  failureHistory?: FailureRecord[];
}

// 前序阶段输出摘要
interface StageOutputSummary {
  stageKey: string;
  stepLabel: string;
  action: string;
  phaseKey: string;
  
  // 核心：摘要（限制200字）
  summary: string;
  
  // 关键点（限制5个）
  keyPoints: string[];
  
  // 决策记录
  decisions: Decision[];
  
  // 产物链接
  artifacts: Artifact[];
  
  // 状态
  status: 'completed' | 'skipped';
}

interface Decision {
  decision: string;      // 决策内容
  reason?: string;       // 决策原因
  impact?: string;       // 影响范围
}

interface ApprovalRecord {
  stageKey: string;
  stepLabel: string;
  approved: boolean;
  comment?: string;
  approvedBy: string;    // humanRole
  approvedAt: string;
}

interface FailureRecord {
  stageKey: string;
  attempt: number;
  error: string;
  partialOutput?: string;
}
```

### 4.2 StructuredOutput（结构化输出）

```typescript
interface StructuredOutput {
  // 摘要（必填，≤200字）
  summary: string;
  
  // 关键点（≤5个）
  keyPoints: string[];
  
  // 决策记录
  decisions: Decision[];
  
  // 风险提示
  risks: string[];
  
  // 后续建议
  recommendations: string[];
  
  // 产物
  artifacts: Artifact[];
  
  // 原始输出（可选，用于调试）
  rawOutput?: string;
}
```

---

## 5. 上下文依赖规则

定义每个 action 需要哪些前序上下文：

```typescript
// 文件：context-dependencies.ts

interface ContextDependency {
  // 需要的前序 action
  requires: string[];
  
  // 是否包含产物
  includeArtifacts: boolean;
  
  // 摘要最大长度
  maxSummaryLength: number;
  
  // 是否包含决策
  includeDecisions: boolean;
}

const CONTEXT_DEPENDENCIES: Record<string, ContextDependency> = {
  // 需求阶段
  'requirements_analysis': {
    requires: [],
    includeArtifacts: false,
    maxSummaryLength: 200,
    includeDecisions: false,
  },
  
  // 设计阶段
  'architecture_design': {
    requires: ['requirements_analysis', 'analyze'],
    includeArtifacts: true,  // 需要需求文档链接
    maxSummaryLength: 300,
    includeDecisions: true,
  },
  
  'design': {
    requires: ['requirements_analysis', 'analyze'],
    includeArtifacts: true,
    maxSummaryLength: 300,
    includeDecisions: true,
  },
  
  // 开发阶段
  'code': {
    requires: ['architecture_design', 'design', 'requirements_analysis'],
    includeArtifacts: true,  // 需要架构文档
    maxSummaryLength: 400,
    includeDecisions: true,
  },
  
  'code_dev': {
    requires: ['code', 'architecture_design'],
    includeArtifacts: true,
    maxSummaryLength: 300,
    includeDecisions: true,
  },
  
  // 测试阶段
  'unit_test': {
    requires: ['code', 'code_dev'],
    includeArtifacts: true,  // 需要PR链接
    maxSummaryLength: 200,
    includeDecisions: false,
  },
  
  'integration_test': {
    requires: ['unit_test', 'code'],
    includeArtifacts: true,
    maxSummaryLength: 200,
    includeDecisions: false,
  },
  
  'test': {
    requires: ['code'],
    includeArtifacts: true,
    maxSummaryLength: 200,
    includeDecisions: false,
  },
  
  // 审查阶段
  'review': {
    requires: ['code', 'code_dev'],
    includeArtifacts: true,  // 需要PR链接
    maxSummaryLength: 200,
    includeDecisions: true,
  },
  
  // 文档阶段
  'document': {
    requires: ['architecture_design', 'code'],
    includeArtifacts: true,
    maxSummaryLength: 200,
    includeDecisions: false,
  },
  
  // 部署阶段
  'deploy': {
    requires: ['code', 'unit_test', 'integration_test', 'security_scan'],
    includeArtifacts: true,  // 需要PR+测试报告
    maxSummaryLength: 200,
    includeDecisions: true,
  },
  
  // 系统动作（不需要太多上下文）
  'lint': {
    requires: ['code'],
    includeArtifacts: true,  // 需要PR链接定位代码
    maxSummaryLength: 100,
    includeDecisions: false,
  },
  
  'build': {
    requires: ['lint'],
    includeArtifacts: false,
    maxSummaryLength: 100,
    includeDecisions: false,
  },
  
  'security_scan': {
    requires: ['code', 'build'],
    includeArtifacts: true,
    maxSummaryLength: 100,
    includeDecisions: false,
  },
  
  'test_e2e': {
    requires: ['build'],
    includeArtifacts: false,
    maxSummaryLength: 100,
    includeDecisions: false,
  },
};

// 默认规则：同 phase 内的前序阶段
function getDefaultDependency(phaseKey: string, previousActions: string[]): ContextDependency {
  return {
    requires: previousActions.filter(a => getPhaseByAction(a) === phaseKey),
    includeArtifacts: true,
    maxSummaryLength: 200,
    includeDecisions: true,
  };
}
```

---

## 6. ContextBuilder 实现

```typescript
// 文件：context-builder.ts

import * as queries from '../db/queries.js';
import { CONTEXT_DEPENDENCIES, getDefaultDependency } from './context-dependencies.js';
import type { ChainContext, StageOutputSummary, Decision } from './types.js';

export class ContextBuilder {
  
  /**
   * 构建链式上下文
   */
  build(
    instanceId: number,
    stageRunId: number,
    action: string
  ): ChainContext {
    // 1. 获取流水线实例
    const instance = queries.getPipelineInstanceById(instanceId);
    if (!instance) {
      throw new Error(`Pipeline instance ${instanceId} not found`);
    }
    
    // 2. 获取任务信息
    const task = queries.getTaskById(instance.taskId);
    
    // 3. 获取当前阶段信息
    const currentStage = instance.stageRuns.find(sr => sr.id === stageRunId);
    if (!currentStage) {
      throw new Error(`Stage run ${stageRunId} not found`);
    }
    
    // 4. 获取前序已完成阶段
    const previousStages = instance.stageRuns.filter(sr =>
      sr.status === 'completed' && sr.id < stageRunId
    );
    
    // 5. 按依赖规则筛选相关阶段
    const dependency = CONTEXT_DEPENDENCIES[action] || getDefaultDependency(
      currentStage.phaseKey || 'development',
      previousStages.map(s => this.extractAction(s.stageKey))
    );
    
    const relevantStages = this.filterByDependency(previousStages, dependency);
    
    // 6. 构建输出摘要
    const relevantOutputs = relevantStages.map(s => this.buildSummary(s, dependency));
    
    // 7. 累积产物
    const accumulatedArtifacts = previousStages.flatMap(s => s.artifacts || []);
    
    // 8. 审批记录
    const approvals = this.extractApprovals(previousStages);
    
    // 9. 失败历史（如果有）
    const failureHistory = this.extractFailureHistory(instance);
    
    return {
      task: {
        id: task?.id || 0,
        title: task?.title || '',
        description: task?.description || '',
        createdBy: task?.createdBy || 'human',
      },
      pipeline: {
        id: instance.id,
        templateName: instance.templateName || '',
        currentStageIndex: instance.currentStageIndex,
        totalStages: instance.stageRuns.length,
      },
      currentStage: {
        id: currentStage.id,
        stageKey: currentStage.stageKey,
        stepLabel: currentStage.stepLabel || currentStage.stageKey,
        action: this.extractAction(currentStage.stageKey),
        agentId: currentStage.agentId,
        phaseKey: currentStage.phaseKey || 'development',
      },
      relevantOutputs,
      accumulatedArtifacts,
      approvals,
      failureHistory,
    };
  }
  
  /**
   * 按依赖规则筛选
   */
  private filterByDependency(
    stages: any[],
    dependency: ContextDependency
  ): any[] {
    return stages.filter(s => {
      const action = this.extractAction(s.stageKey);
      // 检查是否在 requires 列表中
      return dependency.requires.some(req => 
        s.stageKey.includes(req) || action === req
      );
    });
  }
  
  /**
   * 构建阶段输出摘要
   */
  private buildSummary(
    stage: any,
    dependency: ContextDependency
  ): StageOutputSummary {
    const output = stage.output || '';
    
    // 尝试解析结构化输出
    let structured: any = {};
    try {
      structured = JSON.parse(stage.structured_output || '{}');
    } catch {
      // 没有 structure_output，从 output 中提取
      structured = this.extractFromRawOutput(output);
    }
    
    return {
      stageKey: stage.stageKey,
      stepLabel: stage.stepLabel || stage.stageKey,
      action: this.extractAction(stage.stageKey),
      phaseKey: stage.phaseKey || 'development',
      summary: this.limitLength(
        structured.summary || this.extractSummary(output),
        dependency.maxSummaryLength
      ),
      keyPoints: (structured.keyPoints || this.extractKeyPoints(output)).slice(0, 5),
      decisions: dependency.includeDecisions 
        ? (structured.decisions || this.extractDecisions(output))
        : [],
      artifacts: dependency.includeArtifacts 
        ? (stage.artifacts || [])
        : [],
      status: stage.status,
    };
  }
  
  /**
   * 从原始输出提取摘要
   */
  private extractSummary(output: string): string {
    // 匹配常见模式
    const patterns = [
      /摘要[：:]\s*([^\n]+)/,
      /总结[：:]\s*([^\n]+)/,
      /Summary[：:]\s*([^\n]+)/,
      /主要产出[：:]\s*([^\n]+)/,
      /完成内容[：:]\s*([^\n]+)/,
    ];
    
    for (const p of patterns) {
      const match = output.match(p);
      if (match) return match[1].trim();
    }
    
    // 没有匹配，取前200字
    return output.substring(0, 200).trim();
  }
  
  /**
   * 提取关键点
   */
  private extractKeyPoints(output: string): string[] {
    const points: string[] = [];
    
    // 匹配列表模式
    const patterns = [
      /关键点[：:]\s*\n([\s\S]*?)(?:\n\n|\n##|$)/,
      /核心要点[：:]\s*\n([\s\S]*?)(?:\n\n|\n##|$)/,
      /Key Points[：:]\s*\n([\s\S]*?)(?:\n\n|\n##|$)/,
    ];
    
    for (const p of patterns) {
      const match = output.match(p);
      if (match) {
        const lines = match[1].split('\n');
        for (const line of lines) {
          const point = line.replace(/^[-*•]\s*/, '').trim();
          if (point && point.length > 5) {
            points.push(point);
          }
        }
      }
    }
    
    return points.slice(0, 5);
  }
  
  /**
   * 提取决策
   */
  private extractDecisions(output: string): Decision[] {
    const decisions: Decision[] = [];
    
    // 匹配决策模式
    const patterns = [
      /决策[：:]\s*([^\n]+(?:原因[：:][^\n]+)?)/g,
      /Decision[：:]\s*([^\n]+)/g,
      /选择[：:]\s*([^\n]+(?:原因[：:][^\n]+)?)/g,
    ];
    
    for (const p of patterns) {
      const matches = output.matchAll(p);
      for (const m of matches) {
        const text = m[1];
        const decisionMatch = text.match(/(.+?)(?:原因[：:](.+))?$/);
        if (decisionMatch) {
          decisions.push({
            decision: decisionMatch[1].trim(),
            reason: decisionMatch[2]?.trim(),
          });
        }
      }
    }
    
    return decisions;
  }
  
  /**
   * 提取审批记录
   */
  private extractApprovals(stages: any[]): ApprovalRecord[] {
    return stages
      .filter(s => s.output?.includes('Approved') || s.output?.includes('审批通过'))
      .map(s => ({
        stageKey: s.stageKey,
        stepLabel: s.stepLabel || s.stageKey,
        approved: true,
        comment: s.output?.replace('Approved', '').replace('审批通过', '').trim() || undefined,
        approvedBy: s.agentId,
        approvedAt: s.completedAt || '',
      }));
  }
  
  /**
   * 提取失败历史
   */
  private extractFailureHistory(instance: any): FailureRecord[] | undefined {
    const failedStages = instance.stageRuns.filter(sr => sr.status === 'failed');
    if (failedStages.length === 0) return undefined;
    
    // TODO: 从 state_transition_log 获取重试次数
    return failedStages.map(s => ({
      stageKey: s.stageKey,
      attempt: 1,
      error: s.error || '',
      partialOutput: s.output,
    }));
  }
  
  /**
   * 从 stageKey 提取 action
   */
  private extractAction(stageKey: string): string {
    // stageKey 可能是 "step_xxx" 或直接的 action 名
    // 尝试匹配已知 action
    const knownActions = [
      'requirements_analysis', 'analyze', 'architecture_design', 'design',
      'code', 'code_dev', 'unit_test', 'integration_test', 'test',
      'review', 'document', 'deploy', 'lint', 'build', 'security_scan', 'test_e2e',
    ];
    
    for (const action of knownActions) {
      if (stageKey.toLowerCase().includes(action)) {
        return action;
      }
    }
    
    return stageKey;
  }
  
  /**
   * 限制字符串长度
   */
  private limitLength(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen - 3) + '...';
  }
  
  /**
   * 从原始输出提取结构化信息
   */
  private extractFromRawOutput(output: string): any {
    return {
      summary: this.extractSummary(output),
      keyPoints: this.extractKeyPoints(output),
      decisions: this.extractDecisions(output),
    };
  }
}
```

---

## 7. PromptGenerator 实现

```typescript
// 文件：prompt-generator.ts

import type { ChainContext } from './types.js';

export class PromptGenerator {
  
  /**
   * 生成最终 Prompt
   */
  generate(
    context: ChainContext,
    action: string,
    agentType: 'openclaw' | 'claude'
  ): string {
    const sections = [
      this.buildTaskSection(context),
      this.buildContextSection(context, action),
      this.buildDecisionsSection(context),
      this.buildArtifactsSection(context),
      this.buildFailureSection(context),
      this.buildInstructionSection(action, agentType),
      this.buildFormatSection(action),
    ];
    
    return sections.filter(s => s).join('\n\n---\n\n');
  }
  
  /**
   * 任务部分
   */
  private buildTaskSection(context: ChainContext): string {
    const progress = `${context.pipeline.currentStageIndex + 1}/${context.pipeline.totalStages}`;
    
    return `## 任务信息

**标题**: ${context.task.title}

**描述**: ${context.task.description || '无详细描述'}

**流水线**: ${context.pipeline.templateName}（进度: ${progress}）

**当前阶段**: ${context.currentStage.stepLabel}（${context.currentStage.phaseKey}）
`;
  }
  
  /**
   * 前序上下文部分
   */
  private buildContextSection(context: ChainContext, action: string): string {
    if (context.relevantOutputs.length === 0) {
      return '## 前序阶段\n\n无相关前序产出（这是第一个阶段）';
    }
    
    const outputs = context.relevantOutputs.map(o => {
      let section = `### ${o.stepLabel} (${o.action})\n\n`;
      
      // 摘要
      section += `**摘要**: ${o.summary}\n\n`;
      
      // 关键点
      if (o.keyPoints.length > 0) {
        section += `**关键点**:\n`;
        for (const p of o.keyPoints) {
          section += `- ${p}\n`;
        }
        section += '\n';
      }
      
      // 决策
      if (o.decisions.length > 0) {
        section += `**决策**:\n`;
        for (const d of o.decisions) {
          section += `- ${d.decision}`;
          if (d.reason) section += `（原因: ${d.reason}）`;
          section += '\n';
        }
        section += '\n';
      }
      
      // 产物链接
      if (o.artifacts.length > 0) {
        section += `**产物**: `;
        section += o.artifacts.map(a => 
          a.url.startsWith('http') ? `[${a.title || a.type}](${a.url})` : a.url
        ).join(', ');
        section += '\n';
      }
      
      return section;
    }).join('\n');
    
    return `## 前序阶段产出\n\n${outputs}`;
  }
  
  /**
   * 审批决策部分
   */
  private buildDecisionsSection(context: ChainContext): string {
    if (context.approvals.length === 0) {
      return '';
    }
    
    const approvals = context.approvals.map(a => 
      `- ${a.stepLabel}: ${a.approved ? '✅ 通过' : '❌ 拒绝'}`
      + (a.comment ? ` (${a.comment})` : '')
    ).join('\n');
    
    return `## 人工审批结果\n\n${approvals}`;
  }
  
  /**
   * 产物链接部分
   */
  private buildArtifactsSection(context: ChainContext): string {
    if (context.accumulatedArtifacts.length === 0) {
      return '';
    }
    
    const artifacts = context.accumulatedArtifacts.map(a => {
      const icon = this.getArtifactIcon(a.type);
      return `${icon} [${a.title || a.type}](${a.url})`;
    }).join('\n');
    
    return `## 可参考的产物链接\n\n${artifacts}`;
  }
  
  /**
   * 失败历史部分（重试时使用）
   */
  private buildFailureSection(context: ChainContext): string {
    if (!context.failureHistory || context.failureHistory.length === 0) {
      return '';
    }
    
    const failures = context.failureHistory.map(f => 
      `### ${f.stageKey}（第 ${f.attempt} 次尝试）\n\n**错误**: ${f.error}`
      + (f.partialOutput ? `\n\n**部分输出**: ${f.partialOutput.substring(0, 500)}...` : '')
    ).join('\n\n');
    
    return `## 失败历史\n\n本次执行是重试，前序尝试失败：\n\n${failures}\n\n**请吸取前序失败的教训，避免重复错误。**`;
  }
  
  /**
   * 执行指令部分
   */
  private buildInstructionSection(action: string, agentType: string): string {
    const instructions = this.getActionInstructions(action);
    const agentNote = agentType === 'openclaw' 
      ? '（你是 OpenClaw Agent，可以使用配置的 Skills）'
      : '（你是 Claude Agent，请严格遵循指令）';
    
    return `## 执行任务\n\n你需要执行: **${action}**\n\n${instructions}\n\n${agentNote}`;
  }
  
  /**
   * 输出格式要求
   */
  private buildFormatSection(action: string): string {
    return `## 输出格式要求

**请按以下格式输出**，便于后续阶段理解：

### 摘要
[一句话总结本次执行的产出，≤200字]

### 关键点
- [关键点1]
- [关键点2]
- [关键点3]

### 决策（如果有）
- 决策: [决策内容] 原因: [决策原因]

### 产物（如果有产出链接）
- [类型]: [URL]

### 风险提示（如果发现潜在问题）
- [风险1]

---

**重要**: 请确保摘要清晰，关键点简洁，便于后续阶段快速理解你的产出。
`;
  }
  
  /**
   * 获取 action 对应的执行指令
   */
  private getActionInstructions(action: string): string {
    const INSTRUCTIONS: Record<string, string> = {
      'requirements_analysis': `
1. 分析任务描述，提取核心需求
2. 列出功能点、非功能需求
3. 识别边界条件、异常场景
4. 输出需求文档（如有平台支持，上传到飞书文档）
`,
      'architecture_design': `
1. 基于需求设计系统架构
2. 确定技术选型、模块划分
3. 设计 API 接口规范
4. 输出架构设计文档和图示
`,
      'code': `
1. 基于架构设计编写代码
2. 首先编写测试文件（TDD）
3. 实现功能代码
4. 提交 PR 并提供链接
`,
      'code_dev': `
1. 完成代码开发
2. 确保符合架构设计规范
3. 提交代码并提供 PR 链接
`,
      'unit_test': `
1. 编写单元测试
2. 确保覆盖关键路径和边界条件
3. 运行测试确保通过
4. 输出测试报告
`,
      'review': `
1. 审查代码质量、安全性
2. 检查是否符合架构规范
3. 输出审查意见
`,
      'document': `
1. 编写技术文档、API 文档
2. 更新 README、使用指南
3. 上传文档到飞书/其他平台
`,
      'deploy': `
1. 执行部署流程
2. 验证部署成功
3. 输出部署链接
`,
    };
    
    return INSTRUCTIONS[action] || `
执行 ${action} 相关任务：
1. 基于前序产出完成任务
2. 输出执行结果和产物链接
`;
  }
  
  /**
   * 产物图标
   */
  private getArtifactIcon(type: string): string {
    const ICONS: Record<string, string> = {
      'document': '📄',
      'pr': '🔀',
      'commit': '📝',
      'deploy': '🚀',
      'test_report': '🧪',
      'lint_report': '🔍',
      'security_report': '🔒',
      'build_artifact': '📦',
      'other': '📎',
    };
    return ICONS[type] || '📎';
  }
}
```

---

## 8. OutputParser 实现

```typescript
// 文件：output-parser.ts

import type { StructuredOutput, Decision, Artifact, ArtifactType } from './types.js';

export class OutputParser {
  
  /**
   * 解析 Agent 输出
   */
  parse(rawOutput: string, action: string): StructuredOutput {
    return {
      summary: this.extractSummary(rawOutput),
      keyPoints: this.extractKeyPoints(rawOutput),
      decisions: this.extractDecisions(rawOutput),
      risks: this.extractRisks(rawOutput),
      recommendations: this.extractRecommendations(rawOutput),
      artifacts: this.extractArtifacts(rawOutput, action),
      rawOutput,
    };
  }
  
  /**
   * 提取摘要
   */
  private extractSummary(output: string): string {
    // 匹配 "### 摘要" 部分
    const match = output.match(/### 摘要\s*\n([^\n]+)/);
    if (match) return match[1].trim();
    
    // 匹配其他格式
    const patterns = [
      /摘要[：:]\s*([^\n]+)/,
      /总结[：:]\s*([^\n]+)/,
      /Summary[：:]\s*([^\n]+)/,
    ];
    
    for (const p of patterns) {
      const m = output.match(p);
      if (m) return m[1].trim();
    }
    
    // 取第一段（去除空行）
    const firstParagraph = output.split('\n\n')[0].trim();
    if (firstParagraph.length < 200) return firstParagraph;
    
    return output.substring(0, 200).trim() + '...';
  }
  
  /**
   * 提取关键点
   */
  private extractKeyPoints(output: string): string[] {
    const points: string[] = [];
    
    // 匹配 "### 关键点" 部分
    const sectionMatch = output.match(/### 关键点\s*\n([\s\S]*?)(?:\n###|\n\n|$)/);
    if (sectionMatch) {
      const lines = sectionMatch[1].split('\n');
      for (const line of lines) {
        const point = line.replace(/^[-*•]\s*/, '').trim();
        if (point && point.length > 5) points.push(point);
      }
      return points.slice(0, 5);
    }
    
    // 匹配其他格式
    const patterns = [
      /关键点[：:]\s*\n([\s\S]*?)(?:\n\n|\n##|$)/,
      /Key Points[：:]\s*\n([\s\S]*?)(?:\n\n|\n##|$)/,
    ];
    
    for (const p of patterns) {
      const m = output.match(p);
      if (m) {
        const lines = m[1].split('\n');
        for (const line of lines) {
          const point = line.replace(/^[-*•]\s*/, '').trim();
          if (point && point.length > 5) points.push(point);
        }
      }
    }
    
    return points.slice(0, 5);
  }
  
  /**
   * 提取决策
   */
  private extractDecisions(output: string): Decision[] {
    const decisions: Decision[] = [];
    
    // 匹配 "### 决策" 部分
    const sectionMatch = output.match(/### 决策[\（(如果有)\）)]?\s*\n([\s\S]*?)(?:\n###|\n\n|$)/);
    if (sectionMatch) {
      const lines = sectionMatch[1].split('\n');
      for (const line of lines) {
        const cleanLine = line.replace(/^[-*•]\s*/, '').trim();
        if (!cleanLine) continue;
        
        // 解析 "决策: xxx 原因: xxx" 格式
        const parsed = cleanLine.match(/决策[：:]\s*(.+?)(?:原因[：:]\s*(.+))?$/);
        if (parsed) {
          decisions.push({
            decision: parsed[1].trim(),
            reason: parsed[2]?.trim(),
          });
        } else if (cleanLine.length > 5) {
          decisions.push({ decision: cleanLine });
        }
      }
    }
    
    return decisions;
  }
  
  /**
   * 提取风险
   */
  private extractRisks(output: string): string[] {
    const risks: string[] = [];
    
    const match = output.match(/### 风险提示[\（(如果有)\）)]?\s*\n([\s\S]*?)(?:\n###|\n\n|$)/);
    if (match) {
      const lines = match[1].split('\n');
      for (const line of lines) {
        const risk = line.replace(/^[-*•]\s*/, '').trim();
        if (risk && risk.length > 5) risks.push(risk);
      }
    }
    
    return risks;
  }
  
  /**
   * 提取建议
   */
  private extractRecommendations(output: string): string[] {
    const recs: string[] = [];
    
    const patterns = [
      /建议[：:]\s*\n([\s\S]*?)(?:\n\n|\n##|$)/,
      /Recommendations[：:]\s*\n([\s\S]*?)(?:\n\n|\n##|$)/,
      /后续建议[：:]\s*\n([\s\S]*?)(?:\n\n|\n##|$)/,
    ];
    
    for (const p of patterns) {
      const m = output.match(p);
      if (m) {
        const lines = m[1].split('\n');
        for (const line of lines) {
          const rec = line.replace(/^[-*•]\s*/, '').trim();
          if (rec && rec.length > 5) recs.push(rec);
        }
      }
    }
    
    return recs;
  }
  
  /**
   * 提取产物
   */
  private extractArtifacts(output: string, action: string): Artifact[] {
    const artifacts: Artifact[] = [];
    
    // 1. 匹配 "### 产物" 部分
    const sectionMatch = output.match(/### 产物[\（(如果有)\）)]?\s*\n([\s\S]*?)(?:\n###|\n\n|$)/);
    if (sectionMatch) {
      const lines = sectionMatch[1].split('\n');
      for (const line of lines) {
        const cleanLine = line.replace(/^[-*•]\s*/, '').trim();
        if (!cleanLine) continue;
        
        // 解析 "[类型]: [URL]" 格式
        const parsed = cleanLine.match(/\[?([^\]]+)\]?[：:]\s*(\S+)/);
        if (parsed) {
          const typeStr = parsed[1].trim();
          const url = parsed[2].trim();
          artifacts.push({
            type: this.mapArtifactType(typeStr),
            url,
            title: typeStr,
          });
        }
      }
    }
    
    // 2. 直接匹配 URL
    const urlPattern = /(https?:\/\/[^\s]+)|(file:\/\/[^\s]+)|(mock:\/\/[^\s]+)/g;
    const urls = output.matchAll(urlPattern);
    for (const u of urls) {
      if (!artifacts.some(a => a.url === u[0])) {
        artifacts.push({
          type: this.inferArtifactType(u[0], action),
          url: u[0],
          createdAt: new Date().toISOString(),
        });
      }
    }
    
    return artifacts;
  }
  
  /**
   * 映射产物类型
   */
  private mapArtifactType(typeStr: string): ArtifactType {
    const TYPE_MAP: Record<string, ArtifactType> = {
      '文档': 'document',
      'PR': 'pr',
      '代码': 'pr',
      '部署': 'deploy',
      '测试': 'test_report',
      '报告': 'test_report',
      '安全': 'security_report',
      '构建': 'build_artifact',
    };
    
    return TYPE_MAP[typeStr] || 'other';
  }
  
  /**
   * 推断产物类型
   */
  private inferArtifactType(url: string, action: string): ArtifactType {
    if (url.includes('/pull/') || url.includes('pr')) return 'pr';
    if (url.includes('/commit/')) return 'commit';
    if (url.includes('github.com')) return action.includes('code') ? 'pr' : 'document';
    if (url.includes('deploy')) return 'deploy';
    if (url.includes('test')) return 'test_report';
    if (url.includes('security')) return 'security_report';
    if (url.includes('docs') || url.endsWith('.md')) return 'document';
    
    const ACTION_TYPE_MAP: Record<string, ArtifactType> = {
      'requirements_analysis': 'document',
      'architecture_design': 'document',
      'code': 'pr',
      'code_dev': 'pr',
      'unit_test': 'test_report',
      'deploy': 'deploy',
    };
    
    return ACTION_TYPE_MAP[action] || 'other';
  }
}
```

---

## 9. 数据库扩展

```sql
-- 扩展 pipeline_stage_runs 表
ALTER TABLE pipeline_stage_runs 
ADD COLUMN structured_output TEXT DEFAULT '{}';

ALTER TABLE pipeline_stage_runs 
ADD COLUMN context_summary TEXT DEFAULT '';

-- 结构化输出存储格式
-- {
--   "summary": "...",
--   "keyPoints": [...],
--   "decisions": [...],
--   "risks": [...],
--   "recommendations": [...],
--   "artifacts": [...]
-- }
```

---

## 10. AgentExecutor 改造

```typescript
// 改造 agent-executor.ts

import { ContextBuilder } from './context-builder.js';
import { PromptGenerator } from './prompt-generator.js';
import { OutputParser } from './output-parser.js';

export class AgentExecutor implements StageExecutor {
  readonly type = 'agent' as const;

  private openclawClient = new OpenClawAgentClient();
  private claudeClient = new ClaudeAgentClient();
  
  // 新增
  private contextBuilder = new ContextBuilder();
  private promptGenerator = new PromptGenerator();
  private outputParser = new OutputParser();

  async execute(context: ExecutionContext, mock = true): Promise<ExecutionResult> {
    const { agentId, action, instanceId, stageRunId } = context;

    if (mock) {
      return this.executeMock(context);
    }

    const agent = queries.getAgentById(agentId || '');
    if (!agent) {
      return this.executeMock(context);
    }

    const source = agent.source || 'openclaw';

    // 1. 构建上下文 ← 新增
    const chainContext = this.contextBuilder.build(instanceId, stageRunId, action);

    // 2. 生成 Prompt ← 新增
    const prompt = this.promptGenerator.generate(chainContext, action, source);

    console.log(`[AgentExecutor] Calling ${source} agent "${agentId}" with prompt (${prompt.length} chars)`);
    console.log(`[AgentExecutor] Context includes ${chainContext.relevantOutputs.length} previous outputs`);

    // 3. 调用 Agent（已有）
    let response: AgentResponse;
    if (source === 'openclaw') {
      response = await this.openclawClient.sendMessage(agentId, prompt);
    } else {
      response = await this.claudeClient.sendMessage(agentId, prompt);
    }

    // 4. 解析输出 ← 新增
    const structuredOutput = this.outputParser.parse(response.output, action);

    // 5. 存储结构化输出 ← 新增
    queries.updateStageStructuredOutput(stageRunId, {
      structuredOutput,
      summary: structuredOutput.summary,
    });

    return {
      success: response.success,
      output: response.output,
      error: response.error,
      artifacts: structuredOutput.artifacts,
      metadata: {
        agentId,
        action,
        duration: response.duration,
        source,
        structuredOutput,
      },
    };
  }
}
```

---

## 11. 实施步骤

| 优先级 | 文件 | 内容 |
|--------|------|------|
| P0 | `context-dependencies.ts` | 上下文依赖规则定义 |
| P0 | `types.ts` | ChainContext、StructuredOutput 类型定义 |
| P1 | `context-builder.ts` | 上下文构建器实现 |
| P1 | `prompt-generator.ts` | Prompt 生成器实现 |
| P1 | `output-parser.ts` | 输出解析器实现 |
| P2 | `schema.sql` | 数据库扩展（structured_output） |
| P2 | `queries.ts` | 新增 updateStageStructuredOutput |
| P3 | `agent-executor.ts` | 集成三个组件 |

---

## 12. 测试验证

创建测试任务，验证上下文传递：

```bash
# 创建任务
curl -X POST /api/tasks -d '{"title":"上下文传递测试","templateId":3}'

# 启动流水线
curl -X POST /api/tasks/{id}/pipeline/start

# 观察日志
# [AgentExecutor] Calling openclaw agent "zhangjia-arch" with prompt (2500 chars)
# [AgentExecutor] Context includes 1 previous outputs (requirements_analysis)
```

预期：
- 需求分析 → 无前序上下文
- 架构设计 → 包含需求分析摘要
- 代码开发 → 包含需求+架构摘要
- 单元测试 → 包含代码 PR 链接