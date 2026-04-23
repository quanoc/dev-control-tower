import type { Task, StageRun, PipelineInstance, Artifact, ArtifactType } from '@pipeline/shared';
import { Play, Loader2, Eye, GitBranch, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { PipelineFlow } from './PipelineFlow';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Badge } from './ui/Badge';
import { useTasks, useStartPipeline, useApproveStage, useRetryStage, useSkipStage } from '../hooks/useApi';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'cyan' | 'purple' | 'orange' | 'amber';

const TASK_STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant; color: string }> = {
  pending:    { label: '待启动', variant: 'default', color: 'text-gray-500 dark:text-gray-400' },
  running:    { label: '进行中', variant: 'primary', color: 'text-blue-600 dark:text-blue-400' },
  completed:  { label: '已完成', variant: 'success', color: 'text-emerald-600 dark:text-emerald-400' },
  failed:     { label: '失败',   variant: 'danger',  color: 'text-red-600 dark:text-red-400' },
  cancelled:  { label: '已取消', variant: 'default', color: 'text-gray-400 dark:text-gray-600' },
  paused:     { label: '已暂停', variant: 'warning', color: 'text-amber-600 dark:text-amber-400' },
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

const STAGE_STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  completed:        { label: '已完成', variant: 'success' },
  running:          { label: '执行中', variant: 'primary' },
  failed:           { label: '失败',   variant: 'danger' },
  skipped:          { label: '跳过',   variant: 'default' },
  pending:          { label: '待执行', variant: 'default' },
  waiting_approval: { label: '待审批', variant: 'warning' },
};

/**
 * 输出单元格组件 - 支持展开/收起
 */
function OutputCell({ output }: { output: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = output.length > 50;

  if (!isLong) {
    return (
      <span className="text-xs text-gray-600 dark:text-gray-400 truncate block" title={output}>
        {output}
      </span>
    );
  }

  return (
    <div className="w-full min-w-0">
      {expanded ? (
        <div className="space-y-1">
          <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all bg-gray-50 dark:bg-gray-800/50 p-2 rounded max-h-[120px] overflow-y-auto">
            {output}
          </pre>
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <ChevronUp className="w-3 h-3" />
            收起
          </button>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 text-left w-full"
        >
          <span className="truncate flex-1 min-w-0">{output}</span>
          <ChevronDown className="w-3 h-3 flex-shrink-0" />
        </button>
      )}
    </div>
  );
}

interface PipelineModalProps {
  pipeline: PipelineInstance;
  onClose: () => void;
  onRetry?: (stageRunId: number) => void;
  onSkip?: (stageRunId: number) => void;
  onApprove?: (stageRunId: number) => void;
}

function PipelineModal({ pipeline, onClose, onRetry, onSkip, onApprove }: PipelineModalProps) {
  // 计算阶段分组和 rowspan
  const phaseGroups: { phaseKey: string; label: string; startIndex: number; count: number }[] = [];
  let currentPhase = '';
  let currentCount = 0;
  let startIndex = 0;

  pipeline.stageRuns.forEach((stage, idx) => {
    const phaseKey = stage.phaseKey || 'other';
    const label = PHASE_LABELS[phaseKey] || phaseKey;

    if (phaseKey !== currentPhase) {
      if (currentCount > 0) {
        phaseGroups.push({ phaseKey: currentPhase, label: PHASE_LABELS[currentPhase] || currentPhase, startIndex, count: currentCount });
      }
      currentPhase = phaseKey;
      currentCount = 1;
      startIndex = idx;
    } else {
      currentCount++;
    }
  });

  // 添加最后一组
  if (currentCount > 0) {
    phaseGroups.push({ phaseKey: currentPhase, label: PHASE_LABELS[currentPhase] || currentPhase, startIndex, count: currentCount });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="wide"
      title="流水线进度"
      footer={
        <Button variant="ghost" onClick={onClose}>关闭</Button>
      }
    >
      <div className="p-6 space-y-6">
        {/* Pipeline flow visual */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-3">流程总览</h4>
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
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-3">阶段详情</h4>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left px-3 py-2.5 text-gray-500 dark:text-gray-500 font-medium w-8">#</th>
                  <th className="text-left px-3 py-2.5 text-gray-500 dark:text-gray-500 font-medium w-20">阶段</th>
                  <th className="text-left px-3 py-2.5 text-gray-500 dark:text-gray-500 font-medium w-28">步骤</th>
                  <th className="text-left px-3 py-2.5 text-gray-500 dark:text-gray-500 font-medium w-24">执行者</th>
                  <th className="text-left px-3 py-2.5 text-gray-500 dark:text-gray-500 font-medium w-20">状态</th>
                  <th className="text-left px-3 py-2.5 text-gray-500 dark:text-gray-500 font-medium w-16">耗时</th>
                  <th className="text-left px-3 py-2.5 text-gray-500 dark:text-gray-500 font-medium w-[35%]">输出</th>
                  <th className="text-left px-3 py-2.5 text-gray-500 dark:text-gray-500 font-medium w-24">产物</th>
                </tr>
              </thead>
              <tbody>
                {pipeline.stageRuns.map((stage, i) => {
                  // 查找当前行是否是阶段的起始行
                  const group = phaseGroups.find(g => g.startIndex === i);
                  const status = STAGE_STATUS_MAP[stage.status] || STAGE_STATUS_MAP.pending;
                  const stepLabel = stage.stepLabel || stage.stageKey;

                  let duration = '—';
                  if (stage.startedAt && stage.completedAt) {
                    const ms = new Date(stage.completedAt).getTime() - new Date(stage.startedAt).getTime();
                    duration = ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`;
                  } else if (stage.startedAt) {
                    duration = '运行中';
                  }

                  return (
                    <tr key={stage.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50/30 dark:hover:bg-gray-800/30">
                      <td className="px-3 py-2.5 text-gray-400 dark:text-gray-600 font-mono whitespace-nowrap">{i + 1}</td>

                      {/* 阶段单元格 - 只在起始行渲染，合并 rowspan */}
                      {group ? (
                        <td
                          rowSpan={group.count}
                          className="px-3 py-2.5 text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 font-medium align-top whitespace-nowrap"
                        >
                          <div className="flex flex-col gap-1">
                            <span>{group.label}</span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">
                              {group.count} 步骤
                            </span>
                          </div>
                        </td>
                      ) : null}

                      <td className="px-3 py-2.5 text-gray-800 dark:text-gray-300 whitespace-nowrap">{stepLabel}</td>
                      <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 font-mono text-[10px] whitespace-nowrap">{stage.agentId || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">{duration}</td>
                      <td className="px-3 py-2.5 max-w-0">
                        {stage.status === 'waiting_approval' && onApprove ? (
                          <button
                            onClick={() => onApprove(stage.id)}
                            className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-500 dark:hover:text-amber-300 font-medium"
                          >
                            通过
                          </button>
                        ) : stage.status === 'failed' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-red-600 dark:text-red-400 truncate max-w-[120px]" title={stage.error ?? undefined}>
                              {stage.error?.substring(0, 30) ?? '错误'}...
                            </span>
                            {onRetry && (
                              <button
                                onClick={() => onRetry(stage.id)}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-500/10 rounded"
                              >
                                重试
                              </button>
                            )}
                            {onSkip && (
                              <button
                                onClick={() => onSkip(stage.id)}
                                className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded"
                              >
                                跳过
                              </button>
                            )}
                          </div>
                        ) : stage.output ? (
                          <OutputCell output={stage.output} />
                        ) : (
                          <span className="text-gray-300 dark:text-gray-700">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {stage.artifacts && stage.artifacts.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {stage.artifacts.map((artifact, idx) => (
                              <ArtifactLink key={idx} artifact={artifact} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-700">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * 产物类型图标映射
 */
const ARTIFACT_ICONS: Record<ArtifactType, string> = {
  document: '📄',
  pr: '🔀',
  commit: '📝',
  deploy: '🚀',
  test_report: '🧪',
  lint_report: '🔍',
  security_report: '🔒',
  build_artifact: '📦',
  other: '📎',
};

/**
 * 产物链接组件
 */
function ArtifactLink({ artifact }: { artifact: Artifact }) {
  const icon = ARTIFACT_ICONS[artifact.type] || '📎';
  const title = artifact.title || artifact.type;
  const displayText = title.length > 15 ? title.substring(0, 15) + '...' : title;

  // 判断是否是可点击链接
  const isClickable = artifact.url.startsWith('http') || artifact.url.startsWith('file://');

  if (isClickable) {
    return (
      <a
        href={artifact.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[120px] inline-flex items-center gap-1"
        title={`${artifact.title || artifact.type}: ${artifact.url}`}
      >
        <span>{icon}</span>
        <span>{displayText}</span>
      </a>
    );
  }

  // mock:// 或其他不可点击的 URL
  return (
    <span
      className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px] inline-flex items-center gap-1"
      title={`${artifact.title || artifact.type}: ${artifact.url}`}
    >
      <span>{icon}</span>
      <span>{displayText}</span>
    </span>
  );
}

interface TaskRowProps {
  task: Task;
}

function TaskRow({ task }: TaskRowProps) {
  const [showPipeline, setShowPipeline] = useState(false);
  const startPipeline = useStartPipeline();
  const approveStage = useApproveStage();
  const retryStage = useRetryStage();
  const skipStage = useSkipStage();

  const pipeline = task.pipeline;
  const config = TASK_STATUS_CONFIG[task.status] || TASK_STATUS_CONFIG.pending;
  const currentStage = getCurrentStage(pipeline);

  const handleStart = () => {
    startPipeline.mutate(task.id);
  };

  const waitingStage = pipeline?.stageRuns?.find(s => s.status === 'waiting_approval');

  const handleApprove = () => {
    if (!waitingStage) return;
    approveStage.mutate({ taskId: task.id, stageRunId: waitingStage.id });
  };

  return (
    <>
      <tr className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50/20 dark:hover:bg-gray-800/20 transition-colors">
        {/* ID */}
        <td className="px-4 py-3 text-gray-400 dark:text-gray-500 font-mono text-xs w-16">#{task.id}</td>

        {/* Title + Description */}
        <td className="px-4 py-3 min-w-0">
          <div className="text-sm text-gray-800 dark:text-gray-200 font-medium truncate" title={task.title}>
            {task.title}
          </div>
          {task.description && (
            <div className="text-xs text-gray-500 dark:text-gray-500 truncate mt-0.5" title={task.description}>
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
            <span className="text-xs text-blue-600 dark:text-blue-400">{pipeline.templateName}</span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-600">—</span>
          )}
        </td>

        {/* Current Stage */}
        <td className="px-4 py-3 w-40">
          <div className="flex flex-col gap-0.5">
            <span className={`text-xs ${currentStage.blocked ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
              {currentStage.label}
            </span>
            {currentStage.reason && (
              <span className="text-[10px] text-gray-500 dark:text-gray-500 truncate" title={currentStage.reason}>
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
                      <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${currentStage.blocked ? 'bg-amber-500' : 'bg-blue-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-500 font-mono">{currentStage.progress}</span>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </td>

        {/* Created */}
        <td className="px-4 py-3 w-40">
          <span className="text-xs text-gray-500 dark:text-gray-600">
            {new Date(task.createdAt).toLocaleDateString('zh-CN')}
          </span>
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {task.status === 'pending' && (
              <Button
                variant="success"
                size="sm"
                onClick={handleStart}
                disabled={startPipeline.isPending || !pipeline}
              >
                {startPipeline.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                启动
              </Button>
            )}
            {waitingStage && (
              <Button
                variant="warning"
                size="sm"
                onClick={handleApprove}
                disabled={approveStage.isPending}
              >
                {approveStage.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                审批
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="查看详情"
              title="查看详情"
            >
              <Eye className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPipeline(true)}
              disabled={!pipeline}
              className={!pipeline ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed' : ''}
              aria-label={pipeline ? "查看流水线" : "需要先启动流水线"}
              title={pipeline ? "查看流水线" : "需要先启动流水线"}
            >
              <GitBranch className="w-3.5 h-3.5" />
              流水线
            </Button>
          </div>
        </td>
      </tr>

      {/* Pipeline Modal - rendered outside of tr to fix invalid HTML */}
      {showPipeline && pipeline && (
        <PipelineModal
          pipeline={pipeline}
          onClose={() => setShowPipeline(false)}
          onRetry={(stageRunId) => retryStage.mutate({ taskId: task.id, stageRunId })}
          onSkip={(stageRunId) => skipStage.mutate({ taskId: task.id, stageRunId })}
          onApprove={(stageRunId) => approveStage.mutate({ taskId: task.id, stageRunId })}
        />
      )}
    </>
  );
}

export function TaskList() {
  const { data: tasks = [], isLoading } = useTasks();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-gray-400 dark:text-gray-600 animate-spin" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-20">
        <GitBranch className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-500">暂无需求，点击上方「新建需求」创建</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-800">
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-500 w-16">#</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-500">需求</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-500 w-28">状态</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-500 w-32">流水线</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-500 w-36">当前阶段 / 进度</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-500 w-40">创建时间</th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map(task => (
              <TaskRow key={task.id} task={task} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
