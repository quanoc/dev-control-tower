# Pipeline Control Skill 安装指南

## 安装

### 步骤 1：复制到 OpenClaw skills 目录

```bash
cp -r skills/pipeline-control ~/.openclaw/skills/
```

### 步骤 2：在 openclaw.json 中启用

编辑 `~/.openclaw/openclaw.json`，添加：

```json
{
  "skills": {
    "entries": {
      "pipeline-control": {
        "enabled": true
      }
    }
  }
}
```

### 步骤 3：验证安装

```bash
node ~/.openclaw/skills/pipeline-control/pipeline-control.js help
```

### 步骤 4：重启 OpenClaw

重启后 Agent 即可使用此 skill。

## 使用

在 OpenClaw 中与 Agent 对话：

```
用户: 查看流水线任务列表
Agent: [自动调用 skill]

用户: 任务 1 进度怎么样
Agent: [调用 status 命令]

用户: 暂停流水线 1
Agent: [调用 pause 命令]

用户: 流水线审批通过
Agent: [调用 approve 命令]
```

## 触发词

| 操作 | 触发词示例 |
|------|-----------|
| 查看任务 | 查看流水线任务、任务列表 |
| 查看进度 | 流水线进度、任务进度 |
| 暂停 | 暂停流水线、暂停任务 |
| 继续 | 继续流水线、继续任务 |
| 取消 | 取消流水线、取消任务 |
| 审批通过 | 流水线审批通过、流水线通过 |
| 审批拒绝 | 流水线审批拒绝、流水线驳回 |
| 重试 | 重试任务、从 XX 重新执行 |

## 命令行直接使用

```bash
# 查看任务列表
node ~/.openclaw/skills/pipeline-control/pipeline-control.js tasks

# 查看任务状态
node ~/.openclaw/skills/pipeline-control/pipeline-control.js status 1

# 暂停流水线
node ~/.openclaw/skills/pipeline-control/pipeline-control.js pause 1
```

## 配置

修改 `pipeline-control.js` 中的 `API_BASE`：

```javascript
const API_BASE = process.env.PIPELINE_API_BASE || 'http://localhost:3001/api';
```

或通过环境变量：

```bash
export PIPELINE_API_BASE=http://your-server:3001/api
```
