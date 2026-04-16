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
