# Dev Control Tower 架构图

## 系统整体架构

```mermaid
graph TB
    subgraph 外部集成层["🌐 外部集成层"]
        OC[OpenClaw<br/>Agent 管理]
        Claude[Claude API<br/>AI 对话]
        Git[Git 仓库<br/>代码管理]
    end

    subgraph 前端层["🖥️ 前端层 (Vite + React)"]
        UI[UI 组件]
        Pages[页面模块]
        Store[Zustand 状态管理]
        API_Client[API 客户端]
        Types[共享类型定义]
    end

    subgraph API层["🔌 API 层 (Express)"]
        Agents_Route[/api/agents\nAgent 管理路由/]
        Tasks_Route[/api/tasks\n任务管理路由/]
        Pipelines_Route[/api/pipelines\n流水线路由/]
        Executor_Route[/api/executor\n执行器路由/]
        Scheduler_Route[/api/scheduler\n调度器路由/]
    end

    subgraph 核心业务层["⚙️ 核心业务层"]
        subgraph 流水线引擎["🚀 流水线引擎"]
            Scheduler[任务调度器<br/>Scheduler]
            StateMachine[状态机<br/>State Machine]
        end

        subgraph 执行器模块["🔧 执行器模块"]
            PlanExecutor[Plan 执行器]
            TDDExecutor[TDD 执行器]
            CodeExecutor[Code 执行器]
            ReviewExecutor[Review 执行器]
            CommitExecutor[Commit 执行器]
        end

        subgraph OpenClaw集成["🔗 OpenClaw 集成"]
            AgentSync[Agent 同步服务]
            TaskDispatcher[任务分发器]
        end
    end

    subgraph 数据层["💾 数据层 (SQLite)"]
        Agents_Table[(agents<br/>Agent 信息表)]
        Tasks_Table[(tasks<br/>任务表)]
        Templates_Table[(pipeline_templates<br/>流水线模板表)]
        Instances_Table[(pipeline_instances<br/>流水线实例表)]
        Components_Table[(pipeline_components<br/>流水线组件表)]
    end

    %% 连接关系
    UI --> Pages
    Pages --> Store
    Store --> API_Client
    API_Client --> Agents_Route
    API_Client --> Tasks_Route
    API_Client --> Pipelines_Route

    Agents_Route --> AgentSync
    Tasks_Route --> Scheduler
    Pipelines_Route --> StateMachine
    Executor_Route --> PlanExecutor
    Scheduler_Route --> Scheduler

    AgentSync <-->|"同步 Agent 信息"| OC
    TaskDispatcher <-->|"异步调用"| Claude

    Scheduler --> StateMachine
    StateMachine --> PlanExecutor
    PlanExecutor --> TDDExecutor
    TDDExecutor --> CodeExecutor
    CodeExecutor --> ReviewExecutor
    ReviewExecutor --> CommitExecutor
    CommitExecutor -->|"提交代码"| Git

    AgentSync --> Agents_Table
    Scheduler --> Tasks_Table
    StateMachine --> Instances_Table
    Pipelines_Route --> Templates_Table
    Pipelines_Route --> Components_Table

    %% 样式定义
    classDef external fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef frontend fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
    classDef api fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef core fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
    classDef data fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef engine fill:#e0f2f1,stroke:#00695c,stroke-width:2px

    class OC,Claude,Git external
    class UI,Pages,Store,API_Client,Types frontend
    class Agents_Route,Tasks_Route,Pipelines_Route,Executor_Route,Scheduler_Route api
    class Scheduler,StateMachine,PlanExecutor,TDDExecutor,CodeExecutor,ReviewExecutor,CommitExecutor,AgentSync,TaskDispatcher core
    class Agents_Table,Tasks_Table,Templates_Table,Instances_Table,Components_Table data
```

## 数据流架构

```mermaid
flowchart LR
    subgraph 输入层["📥 输入层"]
        User[用户操作]
        Webhook[OpenClaw Webhook]
    end

    subgraph 处理层["⚙️ 处理层"]
        direction TB
        Sync[Agent 同步<br/>同步流程]
        Pipeline[流水线编排<br/>异步流程]
        TaskExec[任务执行<br/>异步流程]
    end

    subgraph 输出层["📤 输出层"]
        Dashboard[仪表盘更新]
        Notification[状态通知]
        GitPush[代码提交]
    end

    User -->|"创建流水线"| Pipeline
    Webhook -->|"Agent 变更"| Sync
    Sync -->|"更新 Agent 列表"| Dashboard
    Pipeline -->|"触发任务"| TaskExec
    TaskExec -->|"状态变更"| Notification
    TaskExec -->|"Commit"| GitPush
```

## Agent 工作流状态机

```mermaid
stateDiagram-v2
    [*] --> Pending: 创建任务
    Pending --> Running: 调度器分配 Agent
    Running --> Plan: 开始 Plan 阶段
    Plan --> TDD: Plan 完成
    TDD --> Code: TDD 完成
    Code --> Review: Code 完成
    Review --> Commit: Review 通过
    Commit --> Completed: Commit 成功
    
    Running --> Failed: 执行错误
    Plan --> Failed: Plan 失败
    TDD --> Failed: TDD 失败
    Code --> Failed: Code 失败
    Review --> Failed: Review 不通过
    Commit --> Failed: Commit 失败
    
    Failed --> [*]
    Completed --> [*]
```

## 核心模块说明

### 1. 前端层 (packages/web/)
| 模块 | 职责 |
|------|------|
| components/ | 可复用 UI 组件 |
| pages/ | 页面级组件 |
| store/ | Zustand 全局状态管理 |
| api/ | Axios API 客户端封装 |
| types/ | TypeScript 类型定义 |

### 2. API 层 (packages/server/src/routes/)
| 路由 | 功能 |
|------|------|
| /api/agents | Agent CRUD + 同步管理 |
| /api/tasks | 任务生命周期管理 |
| /api/pipelines | 流水线模板与实例 |
| /api/executor | 执行器控制 |
| /api/scheduler | 调度器管理 |

### 3. 核心业务层

#### 流水线引擎 (engine/)
- **Scheduler**: 任务调度与资源分配
- **StateMachine**: 流水线状态流转控制

#### 执行器 (executors/)
工作流阶段：
1. **Plan** → 需求分析与任务规划
2. **TDD** → 测试驱动开发
3. **Code** → 代码实现
4. **Review** → 代码审查
5. **Commit** → 代码提交

#### OpenClaw 集成 (openclaw/)
- **AgentSync**: 从 OpenClaw 同步 Agent 信息
- **TaskDispatcher**: 向 Claude 分发任务

### 4. 数据层 (SQLite)
| 表名 | 用途 |
|------|------|
| agents | 存储 Agent 信息及角色标签 |
| tasks | 任务状态与元数据 |
| pipeline_templates | 预定义流水线模板 |
| pipeline_instances | 运行时流水线实例 |
| pipeline_components | 流水线组件配置 |

## 同步 vs 异步流程

### 同步流程（即时响应）
```
用户操作 → API 调用 → 数据库操作 → 即时返回
```
- Agent 列表查询
- 流水线模板读取
- 任务状态查询

### 异步流程（后台处理）
```
任务创建 → 队列 → Scheduler → Agent 执行 → 状态回调
```
- 流水线执行
- Agent 任务分配
- 代码提交与同步

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + Vite + TypeScript + Zustand |
| 后端 | Express + TypeScript |
| 数据库 | SQLite3 |
| 包管理 | pnpm workspaces |
| 外部集成 | OpenClaw SDK + Claude API |

---
*Generated by AI Architect* 
*Last Updated: 2025-04-17*
