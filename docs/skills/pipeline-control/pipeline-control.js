#!/usr/bin/env node

/**
 * Pipeline Control Skill
 *
 * 管理 dev-control-tower 流水线平台的命令行工具
 */

const http = require('http');

// 配置
const API_BASE = process.env.PIPELINE_API_BASE || 'http://localhost:3001/api';

/**
 * 发送 HTTP 请求
 */
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * 格式化任务列表
 */
function formatTasks(tasks) {
  if (!tasks || tasks.length === 0) {
    return '暂无任务';
  }

  const lines = ['任务列表：', ''];
  for (const task of tasks) {
    const statusEmoji = {
      pending: '⏳',
      running: '🔄',
      completed: '✅',
      failed: '❌',
      cancelled: '🚫',
    }[task.status] || '❓';

    lines.push(`${statusEmoji} #${task.id} ${task.title} (${task.status})`);
  }

  return lines.join('\n');
}

/**
 * 格式化任务状态
 */
function formatStatus(task) {
  if (!task) {
    return '任务不存在';
  }

  const lines = [
    `任务 #${task.id}: ${task.title}`,
    `状态: ${task.status}`,
    `创建时间: ${task.createdAt}`,
  ];

  if (task.pipeline) {
    const p = task.pipeline;
    lines.push('');
    lines.push('流水线信息：');
    lines.push(`  状态: ${p.status}`);
    lines.push(`  进度: ${p.currentStageIndex + 1}/${p.stageRuns?.length || 0}`);

    if (p.stageRuns && p.stageRuns.length > 0) {
      lines.push('');
      lines.push('步骤列表：');
      for (const stage of p.stageRuns) {
        const icon = {
          pending: '⏳',
          running: '🔄',
          completed: '✅',
          failed: '❌',
          skipped: '⏭️',
          waiting_approval: '⏸️',
        }[stage.status] || '❓';
        lines.push(`  ${icon} ${stage.stepLabel || stage.stageKey}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * 格式化进度
 */
function formatProgress(progress) {
  if (!progress) {
    return '无法获取进度';
  }

  const lines = [
    `任务 #${progress.taskId}: ${progress.taskTitle || ''}`,
    `状态: ${progress.status}`,
    `进度: ${progress.completedSteps}/${progress.totalSteps}`,
  ];

  if (progress.currentStage) {
    lines.push(`当前步骤: ${progress.currentStage}`);
  }

  if (progress.failedSteps > 0) {
    lines.push(`⚠️ 失败步骤: ${progress.failedSteps}`);
  }

  if (progress.stages && progress.stages.length > 0) {
    lines.push('');
    lines.push('步骤列表：');
    for (const stage of progress.stages) {
      const icon = {
        pending: '⏳',
        running: '🔄',
        completed: '✅',
        failed: '❌',
        skipped: '⏭️',
        waiting_approval: '⏸️',
      }[stage.status] || '❓';
      lines.push(`  ${icon} ${stage.label}`);
    }
  }

  return lines.join('\n');
}

// 命令处理
const commands = {
  /**
   * 查看任务列表
   */
  async tasks() {
    const result = await request('GET', '/tasks');
    console.log(formatTasks(result));
  },

  /**
   * 查看任务状态
   */
  async status(taskId) {
    if (!taskId) {
      console.error('用法: pipeline-control.js status <taskId>');
      process.exit(1);
    }
    const result = await request('GET', `/tasks/${taskId}`);
    console.log(formatStatus(result));
  },

  /**
   * 查看进度
   */
  async progress(taskId) {
    if (!taskId) {
      console.error('用法: pipeline-control.js progress <taskId>');
      process.exit(1);
    }
    const result = await request('GET', `/tasks/${taskId}/pipeline/progress`);
    console.log(formatProgress(result));
  },

  /**
   * 启动流水线
   */
  async start(taskId) {
    if (!taskId) {
      console.error('用法: pipeline-control.js start <taskId>');
      process.exit(1);
    }
    const result = await request('POST', `/tasks/${taskId}/pipeline/start`);
    console.log(result.message || '流水线已启动');
  },

  /**
   * 暂停流水线
   */
  async pause(taskId) {
    if (!taskId) {
      console.error('用法: pipeline-control.js pause <taskId>');
      process.exit(1);
    }
    const result = await request('POST', `/tasks/${taskId}/pipeline/pause`);
    console.log(result.message || '流水线已暂停');
  },

  /**
   * 继续流水线
   */
  async resume(taskId) {
    if (!taskId) {
      console.error('用法: pipeline-control.js resume <taskId>');
      process.exit(1);
    }
    const result = await request('POST', `/tasks/${taskId}/pipeline/resume`);
    console.log(result.message || '流水线已继续');
  },

  /**
   * 取消流水线
   */
  async stop(taskId) {
    if (!taskId) {
      console.error('用法: pipeline-control.js stop <taskId>');
      process.exit(1);
    }
    const result = await request('POST', `/tasks/${taskId}/pipeline/stop`);
    console.log(result.message || '流水线已取消');
  },

  /**
   * 重试失败步骤
   */
  async retry(taskId, stageRunId) {
    if (!taskId || !stageRunId) {
      console.error('用法: pipeline-control.js retry <taskId> <stageRunId>');
      process.exit(1);
    }
    const result = await request('POST', `/tasks/${taskId}/pipeline/retry`, { stageRunId: parseInt(stageRunId) });
    console.log(result.message || '重试已发起');
  },

  /**
   * 从指定步骤重新执行
   */
  async 'retry-from'(taskId, stageKey) {
    if (!taskId || !stageKey) {
      console.error('用法: pipeline-control.js retry-from <taskId> <stageKey>');
      process.exit(1);
    }
    const result = await request('POST', `/tasks/${taskId}/pipeline/retry-from`, { stageKey });
    console.log(result.message || '已从指定步骤重新执行');
  },

  /**
   * 审批通过
   */
  async approve(taskId, stageRunId, comment = '') {
    if (!taskId || !stageRunId) {
      console.error('用法: pipeline-control.js approve <taskId> <stageRunId> [comment]');
      process.exit(1);
    }
    const result = await request('POST', `/tasks/${taskId}/pipeline/approve`, {
      stageRunId: parseInt(stageRunId),
      comment
    });
    console.log(result.message || '审批已通过');
  },

  /**
   * 审批拒绝
   */
  async reject(taskId, stageRunId, comment = '') {
    if (!taskId || !stageRunId) {
      console.error('用法: pipeline-control.js reject <taskId> <stageRunId> [comment]');
      process.exit(1);
    }
    const result = await request('POST', `/tasks/${taskId}/pipeline/reject`, {
      stageRunId: parseInt(stageRunId),
      comment
    });
    console.log(result.message || '审批已拒绝');
  },

  /**
   * 跳过失败步骤
   */
  async skip(taskId, stageRunId) {
    if (!taskId || !stageRunId) {
      console.error('用法: pipeline-control.js skip <taskId> <stageRunId>');
      process.exit(1);
    }
    const result = await request('POST', `/tasks/${taskId}/pipeline/skip`, { stageRunId: parseInt(stageRunId) });
    console.log(result.message || '步骤已跳过');
  },

  /**
   * 对话式控制
   */
  async chat(message, taskId = null) {
    if (!message) {
      console.error('用法: pipeline-control.js chat "消息" [taskId]');
      process.exit(1);
    }
    const body = { message };
    if (taskId) {
      body.taskId = parseInt(taskId);
    }
    const result = await request('POST', '/chat/message', body);
    console.log(result.message || JSON.stringify(result, null, 2));
  },

  /**
   * 帮助
   */
  help() {
    console.log(`
Pipeline Control - 流水线管理工具

命令:
  tasks                           查看任务列表
  status <taskId>                 查看任务状态
  progress <taskId>               查看流水线进度
  start <taskId>                  启动流水线
  pause <taskId>                  暂停流水线
  resume <taskId>                 继续流水线
  stop <taskId>                   取消流水线
  retry <taskId> <stageRunId>     重试失败步骤
  retry-from <taskId> <stageKey>  从指定步骤重新执行
  approve <taskId> <stageRunId> [comment]  审批通过
  reject <taskId> <stageRunId> [comment]   审批拒绝
  skip <taskId> <stageRunId>      跳过失败步骤
  chat "消息" [taskId]             对话式控制

示例:
  node pipeline-control.js tasks
  node pipeline-control.js status 1
  node pipeline-control.js pause 1
  node pipeline-control.js retry-from 1 code
  node pipeline-control.js approve 1 5 "代码没问题"
  node pipeline-control.js chat "任务 1 进度"
`);
  },
};

// 主入口
async function main() {
  const [,, command, ...args] = process.argv;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    commands.help();
    process.exit(0);
  }

  const handler = commands[command];
  if (!handler) {
    console.error(`未知命令: ${command}`);
    console.error('使用 --help 查看帮助');
    process.exit(1);
  }

  try {
    await handler(...args);
  } catch (error) {
    console.error(`错误: ${error.message}`);
    process.exit(1);
  }
}

main();
