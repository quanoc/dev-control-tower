# 上下文传递机制

> 最后更新：2026-04-21

## 概述

流水线执行过程中，Step 之间需要传递上下文信息。当前实现采用**共享上下文**方案：

```
Step 1 → 读 runtime_context → 执行 → 更新 runtime_context
Step 2 → 读 runtime_context → 执行 → 更新 runtime_context
Step 3 → ...
```

## 核心设计

### 1. 数据存储

**pipeline_instances 表**：
```sql
runtime_context TEXT DEFAULT '{}'
```

**RuntimeContext 结构**：
```typescript
interface RuntimeContext {
  summary: string;           // 当前任务进度摘要
  currentPhase?: string;     // 当前阶段
  keyDecisions: Array<{      // 累积的关键决策
    from: string;            // 来自哪个 step
    decision: string;
    reason?: string;
  }>;
  constraints: string[];     // 累积的约束条件
  artifacts: Artifact[];     // 累积的产物
  risks?: string[];          // 风险提示
  lastUpdatedBy?: string;    // 最后更新的 step
  lastUpdatedAt?: string;    // 最后更新时间
}
```

### 2. Step 输出格式

Agent 必须输出 JSON 格式：
```json
{
  "artifacts": [
    { "type": "pr", "url": "https://github.com/...", "title": "PR #123" }
  ],
  "nextStepInput": {
    "summary": "完成了用户登录功能开发",
    "keyPoints": ["实现邮箱登录", "JWT认证"],
    "decisions": [
      { "decision": "使用JWT", "reason": "支持分布式" }
    ],
    "recommendations": ["建议下一步做单元测试"]
  }
}
```

### 3. 执行流程

```
┌─────────────────────────────────────────────────────────────┐
│                     AgentExecutor.execute()                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. ContextBuilder.build(instanceId, stageKey)               │
│    → 读取 pipeline_instances.runtime_context                │
│    → 返回 StepContext { runtimeContext, currentStep, ... }  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. PromptGenerator.generate(stepContext, agent)             │
│    → 生成 Prompt（包含 runtimeContext 中的关键信息）         │
│    → 要求 Agent 输出 JSON 格式                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Agent 执行                                                │
│    → 调用 OpenClaw 或 Claude                                 │
│    → 返回 JSON 输出                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. OutputParser.parse(output)                               │
│    → 解析 JSON 为 StepOutput                                 │
│    → 如果解析失败，提取 URL 作为 artifacts                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. 保存结果                                                  │
│    → StageRun.structured_output（步骤级别，用于追溯）        │
│    → PipelineInstance.runtime_context（共享上下文，增量更新）│
└─────────────────────────────────────────────────────────────┘
```

## 代码结构

```
packages/server/src/
├── context/
│   ├── types.ts              # StepContext, RuntimeContext 类型
│   ├── context-builder.ts    # 构建执行上下文
│   ├── prompt-generator.ts   # 生成 Agent Prompt
│   ├── output-parser.ts      # 解析 Agent 输出
│   └── index.ts              # 导出
├── executors/
│   └── agent-executor.ts     # Agent 执行器，更新 runtime_context
└── db/
    ├── schema.sql            # runtime_context 字段
    ├── index.ts              # 数据库迁移
    └── queries.ts            # getRuntimeContext, mergeRuntimeContext
```

## 核心方法

### queries.ts

```typescript
// 获取共享上下文
function getRuntimeContext(instanceId: number): RuntimeContext | null

// 更新共享上下文
function updateRuntimeContext(instanceId: number, context: RuntimeContext): void

// 增量合并更新
function mergeRuntimeContext(
  instanceId: number,
  updates: Partial<RuntimeContext>,
  updatedBy: string
): RuntimeContext
```

### context-builder.ts

```typescript
class ContextBuilder {
  build(instanceId: number, stageKey: string): StepContext {
    // 1. 获取流水线实例
    // 2. 获取任务信息
    // 3. 获取 runtime_context
    // 4. 获取当前 step 定义
    // 5. 返回 StepContext
  }
}
```

### agent-executor.ts

```typescript
class AgentExecutor {
  async execute(context: ExecutionContext, mock: boolean): Promise<ExecutionResult> {
    // 1. 构建上下文
    // 2. 生成 Prompt
    // 3. 调用 Agent
    // 4. 解析输出
    // 5. 保存到 StageRun.structured_output
    // 6. 更新 PipelineInstance.runtime_context
  }
}
```

## Prompt 示例

生成的 Prompt 结构：

```markdown
## Agent Role
You are **码哥**, an AI agent.
代码开发专家

---

## Task Information
**Title**: 实现用户登录功能
**Description**: 支持邮箱登录，JWT认证
**Pipeline**: 标准研发流水线 (Progress: 3/5)

---

## Task Context (Shared)
This is the accumulated context from previous steps:

### Summary
架构设计完成，采用前后端分离

### Key Decisions
- **使用JWT** (from architecture_design) - 分布式支持

### Constraints
- REST API
- JWT认证
- PostgreSQL

### Accumulated Artifacts
- [架构设计文档](mock://docs/architecture-xxx)

---

## Your Goal
**实现用户登录功能代码**

### Expected Output
- PR链接
- 代码变更

### Information for Next Step
Please include in your output: 提供：核心模块、API接口

---

## Output Format (IMPORTANT)
You MUST output your result in JSON format:
```json
{
  "artifacts": [...],
  "nextStepInput": { "summary": "...", ... }
}
```
```

## 优势

1. **简单直观** - 所有 Step 共享一个上下文，不需要复杂的依赖规则
2. **灵活扩展** - `nextStepInput` 可以包含任意字段
3. **增量更新** - `mergeRuntimeContext` 自动合并 artifacts、decisions
4. **可追溯** - 保留 `StageRun.structured_output` 用于调试

## 注意事项

1. Agent 必须输出有效的 JSON 格式
2. `summary` 是 `nextStepInput` 的必填字段
3. artifacts 会自动去重合并
4. mock 模式下也会更新 runtime_context
