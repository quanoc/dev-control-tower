# Multi-Agent Context Passing Research

> 调研日期：2026-04-20
> 目的：为 dev-control-tower 的流水线上下文传递设计提供参考

---

## 1. OpenClaw 上下文传递机制

### 1.1 核心设计理念

OpenClaw 采用 **文件持久化 + 会话内存** 的双层记忆架构：

```
Session 启动流程：
├── 读取 SOUL.md → 定义身份和原则
├── 读取 USER.md → 定义用户画像
├── 读取 MEMORY.md → 长期记忆（仅主会话）
└── 读取 memory/YYYY-MM-DD.md → 短期日记（今日+昨日）
```

### 1.2 记忆层次

| 层次 | 文件 | 特点 | 传递范围 |
|------|------|------|---------|
| **长期记忆** | `MEMORY.md` | 精选的、结构化的经验沉淀 | 仅主会话（安全隔离） |
| **短期日记** | `memory/YYYY-MM-DD.md` | 原始记录、未经提炼 | 所有会话 |
| **身份定义** | `SOUL.md` | 角色定位、行为准则 | 所有会话 |
| **用户画像** | `persona.md` | 用户偏好、交互协议 | 所有会话 |

### 1.3 Context Selection 策略

OpenClaw 明确区分 **Internal vs External** 上下文访问：

```markdown
# 安全隔离原则
- MEMORY.md 仅在主会话加载（防止私密信息泄露到群聊）
- 群聊中作为参与者，而非用户的代理
- 跨会话共享的上下文需脱敏处理
```

### 1.4 Heartbeat Proactive Check

OpenClaw 使用心跳机制做**周期性上下文刷新**：

```json
{
  "lastChecks": {
    "email": 1703275200,
    "calendar": 1703260800,
    "weather": null
  }
}
```

- 不每次传递全量上下文
- 按时间戳判断是否需要更新
- 主动工作是：整理记忆、提交代码、更新文档

---

## 2. Claude Code Agent 系统

### 2.1 Subagent 结构

Claude Code 的 Agent 定义采用 YAML frontmatter：

```yaml
---
name: planner
description: Expert planning specialist...
tools: ["Read", "Grep", "Glob"]
model: opus
---
```

**关键设计：**
- 每个 Agent 有明确的 `tools` 限制（不传递所有工具）
- 每个 Agent 有特定的 `model` 配置（opus 用于深度思考）
- Agent 描述明确触发条件：`Use PROACTIVELY when...`

### 2.2 Agent 职责分离

| Agent | 职责 | 传递给下游的内容 |
|-------|------|------------------|
| `planner` | 规划实现方案 | **Implementation Plan**（结构化步骤） |
| `tdd-guide` | 测试驱动开发 | **Test Cases** + **Coverage Report** |
| `code-reviewer` | 代码审查 | **Review Report**（问题清单） |
| `security-reviewer` | 安全审查 | **Security Report**（漏洞清单） |
| `build-error-resolver` | 构建修复 | **Fix Diff**（修改内容） |

### 2.3 上下文传递原则

从 Agent 定义中提取的核心原则：

1. **工具隔离**：子 Agent 只获得必要的工具，不传递所有能力
2. **输出结构化**：每个 Agent 输出预定义的格式（Plan、Report、Diff）
3. **职责单一**：Agent 只做自己擅长的事，不做跨界操作
4. **触发时机明确**：描述中写明何时使用，避免混乱调用

---

## 3. 行业共识：上下文传递最佳实践

### 3.1 核心原则

**共识 1：不传递全量上下文**

```
WRONG: 传递所有历史输出给下一个 Agent
CORRECT: 传递关键摘要 + 相关产物链接
```

**共识 2：结构化输出优于原始文本**

```json
// WRONG: 纯文本输出
"分析了需求，发现需要..."

// CORRECT: 结构化输出
{
  "summary": "需求分析完成",
  "keyPoints": ["用户登录", "权限管理", "审计日志"],
  "decisions": [{"decision": "使用 JWT", "reason": "跨服务支持"}],
  "artifacts": ["https://docs.example.com/req-001"]
}
```

**共识 3：上下文按相关性筛选**

| 目标 Agent | 需要的上下文 |
|------------|-------------|
| `architecture_design` | `requirements_analysis.summary` + `keyPoints` |
| `code` | `architecture_design.diagram` + `requirements.keyPoints` |
| `unit_test` | `code.pr_link` + `architecture.api_spec` |
| `deploy` | `code.pr_link` + `unit_test.report` + `security_scan.report` |

**共识 4：记忆有层次**

```
Immediate Context (当前任务) → 会话内存
Working Memory (流水线状态) → 数据库
Long-term Memory (项目知识) → 持久化文档
```

### 3.2 多 Agent 协作模式

参考 Anthropic 的 Orchestrator-Workers 模式：

```
Orchestrator Agent (主控)
├── 分析任务，分解步骤
├── 分配给 Specialist Agents
│   ├── Planner → 返回 Plan
│   ├── TDD Guide → 返回 Test Cases
│   ├── Code Reviewer → 返回 Review Report
│   └── Security Reviewer → 返回 Security Report
├── 聚合结果，做决策
└── 输出最终交付物
```

**关键点：**
- Specialist Agents 返回**结构化摘要**，不返回原始输出
- Orchestrator 只看摘要，不看全量上下文
- 错误/异常情况传递完整上下文

---

## 4. dev-control-tower 设计建议

### 4.1 上下文传递架构

基于调研结果，建议采用：

```typescript
interface StageOutput {
  // 摘要（限制 200 字）
  summary: string;
  
  // 关键点（限制 5 个）
  keyPoints: string[];
  
  // 决策记录
  decisions: Array<{
    decision: string;
    reason: string;
    impact?: string;
  }>;
  
  // 风险提示
  risks?: string[];
  
  // 产物链接
  artifacts: Artifact[];
  
  // 原始输出（可选，仅 debug 时使用）
  rawOutput?: string;
}

interface ChainContext {
  // 相关的前序输出（按规则筛选）
  relevantOutputs: StageOutput[];
  
  // 累积产物（链接形式）
  accumulatedArtifacts: Artifact[];
  
  // 审批决策
  approvals: Array<{
    stageKey: string;
    approved: boolean;
    comment?: string;
  }>;
}
```

### 4.2 筛选规则

```typescript
const CONTEXT_RULES: Record<string, string[]> = {
  // 架构设计：只需要需求摘要
  'architecture_design': ['requirements_analysis'],
  
  // 代码开发：需求 + 架构
  'code': ['requirements_analysis', 'architecture_design'],
  
  // 单元测试：代码 PR + 架构 API
  'unit_test': ['code', 'architecture_design'],
  
  // 安全扫描：代码 PR + 架构
  'security_scan': ['code', 'architecture_design'],
  
  // 部署：代码 PR + 测试报告 + 安全报告
  'deploy': ['code', 'unit_test', 'integration_test', 'security_scan'],
};
```

### 4.3 存储设计

数据库扩展：

```sql
-- 结构化输出存储
ALTER TABLE pipeline_stage_runs 
ADD COLUMN structured_output TEXT DEFAULT '{}';

-- 结构：
{
  "summary": "...",
  "keyPoints": [...],
  "decisions": [...],
  "artifacts": [...]
}
```

---

## 5. 参考资源

### Claude Code 官方

- Agent 定义：`~/.claude/agents/*.md`
- 规则系统：`~/.claude/rules/`
-  orchestrator 模式：[Anthropic Multi-Agent Research](https://anthropic.com)

### OpenClaw

- 身份定义：`SOUL.md`
- 长期记忆：`MEMORY.md`
- 短期日记：`memory/YYYY-MM-DD.md`
- 用户画像：`persona.md`

### 行业实践

- LangChain: Memory Systems
- AutoGen: Multi-Agent Conversation
- CrewAI: Collaborative Teams
- Anthropic: Orchestrator-Workers Pattern

---

## 6. 总结

**核心共识：**

1. **不传全量**：只传递关键摘要，不传递原始输出
2. **结构化输出**：每个阶段输出预定义格式
3. **按需筛选**：根据目标 Agent 聃责筛选相关上下文
4. **层次记忆**：Immediate → Working → Long-term
5. **安全隔离**：敏感上下文不传递到非主会话

**dev-control-tower 实施优先级：**

1. P0: 扩展 `structured_output` 字段，实现结构化输出存储
2. P1: 实现 `ChainContext` 构建，按规则筛选上下文
3. P2: AgentExecutor 使用结构化上下文构建 Prompt