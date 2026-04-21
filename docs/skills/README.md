# OpenClaw Skills 安装指南

本目录包含 dev-control-tower 的 OpenClaw skill 文档。

## 安装步骤

### 1. 复制 skill 到 OpenClaw 目录

```bash
# 复制单个 skill
cp -r skills/pipeline-control ~/.openclaw/skills/

# 或复制所有 skills
cp -r skills/* ~/.openclaw/skills/
```

### 2. 在 openclaw.json 中启用

编辑 `~/.openclaw/openclaw.json`：

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

### 3. 重启 OpenClaw

重启后 Agent 即可使用已启用的 skills。

## 可用 Skills

| Skill | 说明 |
|-------|------|
| [pipeline-control](./pipeline-control/SKILL.md) | 流水线管理：查看任务、暂停/继续、审批等 |

## 目录结构

```
dev-control-tower/
├── skills/                          # skill 代码
│   └── pipeline-control/
│       └── pipeline-control.js
└── docs/skills/                     # skill 文档
    ├── README.md                    # 本文件（安装指南）
    └── pipeline-control/
        └── SKILL.md                 # skill 说明
```
