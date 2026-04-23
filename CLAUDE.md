# dev-control-tower

AI 研发控制台 - 基于多 Agent 协作的流水线管理系统

## 项目概览

- **技术栈**: TypeScript + React + Express + SQLite
- **架构**: Monorepo (pnpm workspaces)
- **核心功能**: Agent 管理、流水线编排、任务调度

## 目录结构

```
dev-control-tower/
├── packages/
│   ├── web/          # React 前端 (Vite)
│   ├── server/       # Express 后端 + SQLite
│   └── shared/       # 共享类型定义
├── docs/             # 文档
└── CLAUDE.md         # 本文件
```

## 开发规范

### 提交格式
- `feat:` 新功能
- `fix:` 修复
- `refactor:` 重构
- `docs:` 文档
- `chore:` 杂项

### 代码规范
- 文件最大 800 行
- 函数最大 50 行
- 使用 immutable 数据模式
- 80%+ 测试覆盖率

### 前端规范

**基础组件**（`packages/web/src/components/ui/`）：
- `Button`、`Modal`、`Input`、`Card`、`Badge` - 新功能优先使用
- 禁止重复造轮子，复用已有组件

**z-index 层级**：
```
drawer(50) < modal(60) < popover(70) < toast(80)
```
禁止使用 `z-[N]` 任意值。

**图标**：统一使用 `lucide-react`，禁止在 UI 组件中使用 Emoji。

**可访问性**：图标按钮必须有 `aria-label`。

## 常用命令

```bash
# 启动开发
pnpm dev

# 启动后端
cd packages/server && npm run dev

# 启动前端
cd packages/web && npm run dev

# 数据库迁移
cd packages/server && npm run db:migrate

# 构建
pnpm build
```

## 核心概念

### Agent
- 从 OpenClaw 和 Claude 自动同步
- 支持角色标签：开发、测试、设计、文档、部署
- 支持 Skills 管理

### Pipeline Template
- 标准研发流水线
- 小需求流水线
- 完整研发流水线

### Task
- 需求任务
- 关联 Pipeline Instance
- 状态：pending → running → completed/failed

## 流水线执行核心原则

**必须遵守**，任何修改都不能违反这些原则：

1. **Batch 执行模型**：
   - **Batch 内并行**：同一个 batch 内的 steps 可以并行执行
   - **Batch 间串行**：不同 batch 必须串行，当前 batch 全部完成后才能进入下一个
   - 配置：`batches: [2, 1, 3]` 表示 2个并行 → 1个串行 → 3个并行
   - 默认全串行：`[1, 1, 1, ...]`

2. **幂等执行**：同一阶段不会重复执行，只执行 `pending` 状态的阶段。

3. **事件驱动**：batch 全部完成 → 自动推进下一个 batch。

4. **状态机约束**：状态变更必须通过 `stateMachine.transition()`，不直接改数据库。

5. **Scheduler 守护**：Scheduler 只恢复"卡住"的流水线。当前 batch 有 `running` 则跳过。

**执行链**：`start() → executeNextBatch() → 并行执行 batch 内 steps → batch 完成 → executeNextBatch()`

## Agent 工作流

1. **Plan** - 使用 planner agent 规划
2. **TDD** - 使用 tdd-guide agent 写测试
3. **Code** - 实现功能
4. **Review** - 使用 code-reviewer agent 审查
5. **Commit** - 提交代码

## API 端点

- `GET /api/agents` - 获取所有 agents
- `GET /api/tasks` - 获取所有 tasks
- `POST /api/tasks` - 创建 task
- `GET /api/pipelines/templates` - 获取流水线模板

## 数据库

SQLite 数据库位置：`packages/server/data/pipeline.db`

核心表：
- `agents` - Agent 信息
- `tasks` - 任务
- `pipeline_templates` - 流水线模板
- `pipeline_instances` - 流水线实例
- `pipeline_components` - 流水线组件

## 注意事项

### 🔴 重要：数据库文件必须提交

SQLite 数据库文件已**纳入版本控制**，这是项目的核心设计：

- `packages/server/data/pipeline.db` - 主数据库文件（必须提交）
- `packages/server/data/pipeline.db-shm` - 共享内存文件（必须提交）
- `packages/server/data/pipeline.db-wal` - Write-Ahead Log 文件（必须提交）

**原因**：
- 避免开发环境数据丢失
- 确保团队成员有一致的测试数据
- 包含预设的流水线模板和 Agent 配置
- git 可以正常处理 SQLite 二进制文件（不会损坏）

### 其他注意事项

2. Agent 同步需要 OpenClaw 环境变量配置
3. 后端端口 3001，前端端口 5173
