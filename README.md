# AI Pipeline Dashboard

研发流程自动化流水线管理平台，支持两级阶段配置和可复用组件库。

## 功能特性

- **两级流水线结构**
  - 第一层：Phase（阶段）- 需求、设计、开发、测试、上线
  - 第二层：Step（步骤）- 每个阶段下的具体任务

- **三种执行角色**
  - 🤖 Agent：AI Agent 执行的任务
  - 👤 Human：人工审批/评审
  - ⚙️ System：自动化流程（Lint、Build、测试）

- **组件库**
  - 创建可复用的步骤组件
  - 在流水线中引用组件
  - 支持按类型筛选和搜索

- **预设模板**
  - 小需求流水线：快速交付
  - 标准研发流水线：含人工评审
  - 完整研发流水线：全链路多评审

## 技术栈

- **后端**：Express + TypeScript + SQLite
- **前端**：React + TypeScript + TailwindCSS
- **包管理**：pnpm (monorepo)

## 项目结构

```
packages/
├── server/    # 后端服务
├── shared/   # 共享类型和常量
└── web/      # 前端应用
```

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器（并行启动所有服务）
pnpm dev

# 构建生产版本
pnpm build
```

## API

- `GET /api/pipelines/templates` - 获取模板列表
- `POST /api/pipelines/templates` - 创建模板
- `PUT /api/pipelines/templates/:id` - 更新模板
- `DELETE /api/pipelines/templates/:id` - 删除模板
- `GET /api/pipelines/components` - 获取组件列表
- `POST /api/pipelines/components` - 创建组件
- `DELETE /api/pipelines/components/:id` - 删除组件

## 开发指南

1. 修改 shared 包中的类型定义会同时影响 server 和 web
2. 数据库文件位于 `packages/server/data/pipeline.db`
3. 使用 `pnpm -r --filter <package> <command>` 可以只对单个包执行命令

## License

MIT