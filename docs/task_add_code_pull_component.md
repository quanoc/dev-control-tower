---
taskId: task_add_code_pull_component
status: completed
title: 添加「拉取代码」系统组件
progress: 100
startTime: 2026-04-13T15:41:00Z
updateTime: 2026-04-13T15:50:00Z
---

# 添加「拉取代码」系统组件

## 完成内容

### 1. 前端修改 - ComponentLibrary.tsx
- ✅ 在 `SYSTEM_ACTIONS` 数组中添加了 `{ key: 'code_pull', label: '代码拉取', icon: '📥' }`
- ✅ 修改了表单中的条件渲染，系统类型显示配置提示而非人工角色输入

### 2. 后端修改 - executor.ts
- ✅ 添加了 `child_process`, `path`, `fs` 导入
- ✅ 在 `StageMeta` 接口中添加了 `action: string` 字段
- ✅ 修改 `resolveStageMeta` 方法，传递 action 字段
- ✅ 在 `executeSingleStage` 方法中添加了对 `code_pull` 系统动作的判断和处理
- ✅ 新增 `executeCodePull` 方法，实现代码拉取逻辑：
  - 从任务描述中提取仓库地址（格式：`repo: https://...git`）
  - 支持指定分支（格式：`branch: xxx`）
  - 自动创建工作目录：`/root/.openclaw/workspace/task_{taskId}`
  - 支持 git clone 和 git pull（如果目录已存在）
  - 输出拉取结果和当前版本信息

### 3. 构建与部署
- ✅ 执行 `pnpm build` 成功
- ✅ 重启 dev 服务成功（端口 5173 和 3001）

## 使用方法

1. **在流水线组件页面创建新组件：**
   - 类型：系统
   - 动作：代码拉取
   - 名称：自定义（如「拉取代码」）

2. **在创建任务时，在描述中添加仓库信息：**
   ```
   repo: https://github.com/user/repo.git
   branch: main  (可选，默认 main)
   ```

3. **流水线执行时会自动：**
   - 解析仓库地址
   - 克隆或拉取代码到工作目录
   - 输出执行结果

## 文件变更

- `packages/web/src/components/ComponentLibrary.tsx` - 添加 code_pull 到系统动作列表
- `packages/server/src/engine/executor.ts` - 添加代码拉取执行逻辑
