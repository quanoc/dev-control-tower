import type { Task, StageRun, PipelineInstance } from '@pipeline/shared';
import { Play, Loader2, Eye, GitBranch } from 'lucide-react';
import { useState } from 'react';
import { PipelineFlow } from './PipelineFlow';
import { useTaskStore } from '../store/tasks';

const TASK_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor?: string }> = {
  pending:    { label: '待启动', color: 'text-gray-400' },
  running:    { label: '进行中', color: 'text-blue-400' },
  completed:  { label: '已完成', color: 'text-emerald-400' },
  failed:     { label: '失败',   color: 'text-red-400' },
  cancelled:  { label: '已取消', color: 'text-gray-600' },
  paused:     { label: '已暂停', color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
};

const STAGE_LABELS: Record<string, string> = {
  requirements:   '需求评审',
  architecture:   '架构设计',
  development:    '代码开发',
  testing:        '测试验证',
  documentation:  '文档输出',
  deployment:     '部署上线',
};

const PHASE_LABELS: Record<string, string> = {
  requirements:  '需求阶段',
  design:        '设计阶段',
  development:   '开发阶段',
  testing:       '测试阶段',
  deployment:    '上线阶段',
};

function getCurrentStage(pipeline: PipelineInstance | null): { label: string; progress: string; reason?: string; blocked?: boolean } {
  if (!pipeline) return { label: '—', progress: '' };
  if (pipeline.status === 'completed') return { label: '全部完成', progress: `${pipeline.stageRuns.length}/${pipeline.stageRuns.length}` };
  if (pipeline.status === 'failed') {
    const failedStage = pipeline.stageRuns.find(s => s.status === 'failed');
    return {
      label: '执行失败',
      progress: `${pipeline.currentStageIndex + 1}/${pipeline.stageRuns.length}`,
      reason: failedStage?.error || '未知错误',
      blocked: true
    };
  }
  if (pipeline.status === 'paused') {
    const waitingStage = pipeline.stageRuns.find(s => s.status === 'waiting_approval');
    return {
      label: waitingStage ? `等待审批: ${waitingStage.stepLabel || waitingStage.stageKey}` : '已暂停',
      progress: `${pipeline.currentStageIndex + 1}/${pipeline.stageRuns.length}`,
      reason: waitingStage ? '需要人工确认后继续' : '流水线已暂停',
      blocked: true
    };
  }
  if (pipeline.status === 'pending') return { label: '待启动', progress: `0/${pipeline.stageRuns.length}` };
  const current = pipeline.stageRuns[pipeline.currentStageIndex];
  const label = current ? STAGE_LABELS[current.stageKey] || current.stageKey : '—';
  const progress = `${pipeline.currentStageIndex + 1}/${pipeline.stageRuns.length}`;
  return { label, progress };
}

interface PipelineModalProps {
  pipeline: PipelineInstance;
  onClose: () => void;
  onRetry?: (stageRunId: number) => void;
  onSkip?: (stageRunId: number) => void;
  onApprove?: (stageRunId: number) => void;
}

function PipelineModal({ pipeline, onClose, onRetry, onSkip, onApprove }: PipelineModalProps) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
      <div className="fixed inset-8 bg-gray-900 border border-gray-800 rounded-2xl z-[70] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <GitBranch className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-semibold text-gray-100">流水线进度</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
            <span className="text-gray-400 text-lg">&times;</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Pipeline flow visual */}
          <div className="mb-6">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">流程总览</h4>
            <div className="flex items-center gap-2">
              <PipelineFlow
                stageRuns={pipeline.stageRuns}
                currentStageIndex={pipeline.currentStageIndex}
                templatePhases={pipeline.templatePhases}
              />
            </div>
          </div>

          {/* Stage detail table */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">阶段详情</h4>
            <div className="overflow-x-auto rounded-lg border border-gray-800">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-900 border-b border-gray-800">
                    <th className="text-left px-3 py-2.5 text-gray-500 font-medium w-8">#</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-medium w-16">阶段</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-medium">步骤</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-medium w-20">执行者</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-medium w-20">状态</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-medium w-20">耗时</th>
                    <th className="text-left px-3 py-2.5 text-gray-500 font-medium w-48">输出</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.stageRuns.map((stage, i) => (
                    <StageRow key={stage.id} stage={stage} index={i} onRetry={onRetry} onSkip={onSkip} onApprove={onApprove} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const STAGE_STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  completed:        { label: '已完成', bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  running:          { label: '执行中', bg: 'bg-blue-500/15',   text: 'text-blue-400' },
  failed:           { label: '失败',   bg: 'bg-red-500/15',    text: 'text-red-400' },
  skipped:          { label: '跳过',   bg: 'bg-gray-800',      text: 'text-gray-500' },
  pending:          { label: '待执行', bg: 'bg-gray-800',      text: 'text-gray-500' },
  waiting_approval: { label: '待审批', bg: 'bg-amber-500/15',  text: 'text-amber-400' },
};

function StageRow({ stage, index, onRetry, onSkip, onApprove }: { stage: StageRun; index: number; onRetry?: (id: number) => void; onSkip?: (id: number) => void; onApprove?: (id: number) => void }) {
  const status = STAGE_STATUS_MAP[stage.status] || STAGE_STATUS_MAP.pending;
  const stepLabel = stage.stepLabel || stage.stageKey;
  const phaseLabel = stage.phaseKey ? (PHASE_LABELS[stage.phaseKey] || stage.phaseKey) : '—';

  let duration = '—';
  if (stage.startedAt && stage.completedAt) {
    const ms = new Date(stage.completedAt).getTime() - new Date(stage.startedAt).getTime();
    duration = ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`;
  } else if (stage.startedAt) {
    duration = '计算中...';
  }

  return (
    <tr className="border-b border-gray-800/50 hover:bg-gray-800/30">
      <td className="px-3 py-2.5 text-gray-600 font-mono">{index + 1}</td>
      <td className="px-3 py-2.5 text-gray-400">{phaseLabel}</td>
      <td className="px-3 py-2.5 text-gray-300">{stepLabel}</td>
      <td className="px-3 py-2.5 text-gray-500 font-mono text-[10px]">{stage.agentId}</td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] ${status.bg} ${status.text}`}>
          {status.label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-gray-500 font-mono">{duration}</td>
      <td className="px-3 py-2.5">
        {stage.status === 'waiting_approval' && onApprove ? (
          <button
            onClick={() => onApprove(stage.id)}
            className="text-xs text-amber-400 hover:text-amber-300 font-medium"
          >
            通过
          </button>
        ) : stage.status === 'failed' ? (
          <div className="flex items-center gap-2">
            <span className="text-red-400 truncate max-w-[120px]" title={stage.error ?? undefined}>{stage.error?.substring(0, 40) ?? '未知错误'}...</span>
            {onRetry && (
              <button
                onClick={() => onRetry(stage.id)}
                className="text-xs text-blue-400 hover:text-blue-300 flex-shrink-0 px-1.5 py-0.5 bg-blue-500/10 rounded"
              >
                重试
              </button>
            )}
            {onSkip && (
              <button
                onClick={() => onSkip(stage.id)}
                className="text-xs text-gray-400 hover:text-gray-300 flex-shrink-0 px-1.5 py-0.5 bg-gray-700 rounded"
              >
                跳过
              </button>
            )}
          </div>
        ) : stage.output ? (
          <span className="text-gray-400 truncate max-w-[180px]" title={stage.output}>{stage.output.substring(0, 50)}...</span>
        ) : (
          <span className="text-gray-700">—</span>
        )}
      </td>
    </tr>
  );
}

interface TaskRowProps {
  task: Task;
}

function TaskRow({ task }: TaskRowProps) {
  const [showPipeline, setShowPipeline] = useState(false);
  const startPipeline = useTaskStore(s => s.startTaskPipeline);
  const approveTaskStage = useTaskStore(s => s.approveTaskStage);
  const retryTaskStage = useTaskStore(s => s.retryTaskStage);
  const skipTaskStage = useTaskStore(s => s.skipTaskStage);
  const [starting, setStarting] = useState(false);

  const pipeline = task.pipeline;
  const config = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.pending;
  const currentStage = getCurrentStage(pipeline);

  const handleStart = async () => {
    setStarting(true);
    try {
      await startPipeline(task.id);
    } finally {
      setStarting(false);
    }
  };

  const waitingStage = pipeline?.stageRuns?.find(s => s.status === 'waiting_approval');
  const [approving, setApproving] = useState(false);

  const handleApprove = async () => {
    if (!waitingStage) return;
    setApproving(true);
    try {
      await approveTaskStage(task.id, waitingStage.id);
    } finally {
      setApproving(false);
    }
  };

  return (
    <>
      <tr className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
        {/* ID */}
        <td className="px-4 py-3 text-gray-500 font-mono text-xs w-16">#{task.id}</td>

        {/* Title + Description */}
        <td className="px-4 py-3 min-w-0">
          <div className="text-sm text-gray-200 font-medium truncate" title={task.title}>
            {task.title}
          </div>
          {task.description && (
            <div className="text-xs text-gray-500 truncate mt-0.5" title={task.description}>
              {task.description}
            </div>
          )}
        </td>

        {/* Status */}
        <td className="px-4 py-3 w-28">
          <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
        </td>

        {/* Pipeline Template */}
        <td className="px-4 py-3 w-32">
          {pipeline?.templateName ? (
            <span className="text-xs text-blue-400">{pipeline.templateName}</span>
          ) : (
            <span className="text-xs text-gray-600">—</span>
          )}
        </td>

        {/* Current Stage */}
        <td className="px-4 py-3 w-40">
          <div className="flex flex-col gap-0.5">
            <span className={`text-xs ${currentStage.blocked ? 'text-amber-400 font-medium' : 'text-gray-300'}`}>
              {currentStage.label}
            </span>
            {currentStage.reason && (
              <span className="text-[10px] text-gray-500 truncate" title={currentStage.reason}>
                {currentStage.reason}
              </span>
            )}
            {currentStage.progress && (
              <div className="flex items-center gap-1.5">
                {(() => {
                  const [done, total] = currentStage.progress.split('/').map(Number);
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  return (
                    <>
                      <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${currentStage.blocked ? 'bg-amber-500' : 'bg-blue-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono">{currentStage.progress}</span>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </td>

        {/* Created */}
        <td className="px-4 py-3 w-40">
          <span className="text-xs text-gray-600">
            {new Date(task.createdAt).toLocaleDateString('zh-CN')}
          </span>
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {task.status === 'pending' && (
              <button
                onClick={handleStart}
                disabled={starting || !pipeline}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-800 disabled:text-gray-600 rounded text-xs font-medium transition-colors text-gray-200"
              >
                {starting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                启动
              </button>
            )}
            {waitingStage && (
              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-800 disabled:text-gray-600 rounded text-xs font-medium transition-colors text-gray-200"
              >
                {approving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                审批
              </button>
            )}
            <button
              className="flex items-center gap-1 px-2 py-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded text-xs transition-colors"
              title="查看详情"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowPipeline(true)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition-colors ${
                pipeline
                  ? 'text-gray-400 hover:text-blue-400 hover:bg-gray-800'
                  : 'text-gray-600 hover:text-gray-500 cursor-not-allowed'
              }`}
              title={pipeline ? "查看流水线" : "需要先启动流水线"}
              disabled={!pipeline}
            >
              <GitBranch className="w-3.5 h-3.5" />
              流水线
            </button>
          </div>
        </td>
      </tr>

      {/* Pipeline Modal */}
      {showPipeline && pipeline && (
        <PipelineModal
          pipeline={pipeline}
          onClose={() => setShowPipeline(false)}
          onRetry={(stageRunId) => retryTaskStage(task.id, stageRunId)}
          onSkip={(stageRunId) => skipTaskStage(task.id, stageRunId)}
          onApprove={(stageRunId) => approveTaskStage(task.id, stageRunId)}
        />
      )}
    </>
  );
}

export function TaskList() {
  const tasks = useTaskStore(s => s.tasks);
  const loading = useTaskStore(s => s.loading);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-20">
        <GitBranch className="w-8 h-8 text-gray-700 mx-auto mb-3" />
        <p className="text-sm text-gray-500">暂无需求，点击上方「新建需求」创建</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-800">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-900/80 border-b border-gray-800">
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 w-16">#</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500">需求</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 w-28">状态</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 w-32">流水线</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 w-36">当前阶段 / 进度</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 w-40">创建时间</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="bg-gray-950">
            {tasks.map(task => (
              <TaskRow key={task.id} task={task} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
