# Pipeline Control Skill

管理 dev-control-tower 流水线平台的 Skill。

## 触发条件

当用户提到以下关键词或意图时自动触发：
- "流水线" + "状态/进度/查看/暂停/继续/取消"
- "任务" + "流水线/进度/重试/状态"
- "流水线审批" + "通过/拒绝"
- "pipeline" + "status/pause/resume"

**注意**：单独说"审批通过"不会触发，必须带"流水线"前缀，避免与其他审批场景混淆。

## 功能

- 查看任务列表和状态
- 查看流水线进度
- 暂停/继续/取消流水线
- 重试失败的步骤
- 从指定步骤重新执行
- 审批通过/拒绝

## API 端点

基础地址：`http://localhost:3001/api`

### 任务相关

| 端点 | 方法 | 说明 |
|------|------|------|
| `/tasks` | GET | 获取任务列表 |
| `/tasks/:id` | GET | 获取任务详情 |
| `/tasks/:id/pipeline/progress` | GET | 获取流水线进度 |

### 流水线控制

| 端点 | 方法 | 说明 |
|------|------|------|
| `/tasks/:id/pipeline/start` | POST | 启动流水线 |
| `/tasks/:id/pipeline/pause` | POST | 暂停流水线 |
| `/tasks/:id/pipeline/resume` | POST | 继续流水线 |
| `/tasks/:id/pipeline/stop` | POST | 取消流水线 |
| `/tasks/:id/pipeline/retry` | POST | 重试失败步骤 |
| `/tasks/:id/pipeline/retry-from` | POST | 从指定步骤重新执行 |
| `/tasks/:id/pipeline/approve` | POST | 审批通过 |
| `/tasks/:id/pipeline/reject` | POST | 审批拒绝 |
| `/tasks/:id/pipeline/skip` | POST | 跳过失败步骤 |

### 对话式控制

| 端点 | 方法 | 说明 |
|------|------|------|
| `/chat/message` | POST | 发送自然语言消息 |

## 用法

### 查看任务列表

```bash
node pipeline-control.js tasks
```

### 查看任务状态

```bash
node pipeline-control.js status <taskId>
```

### 暂停流水线

```bash
node pipeline-control.js pause <taskId>
```

### 继续流水线

```bash
node pipeline-control.js resume <taskId>
```

### 重试失败步骤

```bash
node pipeline-control.js retry <taskId> <stageRunId>
```

### 从指定步骤重新执行

```bash
node pipeline-control.js retry-from <taskId> <stageKey>
```

### 审批通过

```bash
node pipeline-control.js approve <taskId> <stageRunId> [comment]
```

### 审批拒绝

```bash
node pipeline-control.js reject <taskId> <stageRunId> [comment]
```

### 对话式控制

```bash
node pipeline-control.js chat "任务 1 暂停"
node pipeline-control.js chat "任务 123 进度"
```

## 示例

```bash
# 查看所有任务
node pipeline-control.js tasks

# 查看任务 1 的进度
node pipeline-control.js status 1

# 暂停任务 1 的流水线
node pipeline-control.js pause 1

# 从 code 步骤重新执行
node pipeline-control.js retry-from 1 code

# 审批通过步骤 5
node pipeline-control.js approve 1 5 "代码看起来没问题"
```

## Agent 使用说明

当触发此 skill 时，应该：

1. **查看任务列表**：用户说"查看任务"或"任务列表"时，调用 `tasks` 命令
2. **查看进度**：用户说"任务 X 进度"或"任务 X 怎么样"时，调用 `status X`
3. **暂停/继续**：用户说"暂停/继续任务 X"时，调用 `pause X` 或 `resume X`
4. **重试**：用户说"重试任务 X"时，先查看状态获取失败步骤 ID，再调用 `retry`
5. **审批**：用户说"审批通过/拒绝"时，查找等待审批的步骤并调用 `approve/reject`

### 对话示例

```
用户: 查看任务列表
Agent: [调用 tasks 命令]
       当前有 3 个任务：
       - #1 实现用户登录 (running)
       - #2 修复Bug (paused)
       - #3 文档更新 (completed)

用户: 任务 1 进度怎么样
Agent: [调用 status 1]
       任务 1 进度：3/5 步骤完成
       当前步骤：code (running)

用户: 暂停任务 1
Agent: [调用 pause 1]
       流水线已暂停

用户: 从 code 重新执行
Agent: [调用 retry-from 1 code]
       已从 code 步骤重新执行
```

## 配置

可在 `pipeline-control.js` 中修改：
- `API_BASE`: API 基础地址（默认 http://localhost:3001/api）

## 依赖

- Node.js
- curl 或 node-fetch
