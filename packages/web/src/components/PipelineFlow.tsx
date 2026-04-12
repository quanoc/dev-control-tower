import type { StageRun, PipelineStage } from '@pipeline/shared';
import { CheckCircle, Circle, XCircle, Loader2, ArrowRight, PauseCircle } from 'lucide-react';
import { DEFAULT_PIPELINE_STAGES } from '@pipeline/shared';

interface PipelineFlowProps {
  stageRuns: StageRun[];
  currentStageIndex: number;
  compact?: boolean;
}

const STAGE_ICONS: Record<string, string> = {
  requirements: '📊',
  architecture: '🏗️',
  development: '💻',
  testing: '🧪',
  documentation: '📚',
  deployment: '🚀',
};

function getStageIcon(stageKey: string): string {
  return STAGE_ICONS[stageKey] || '⚙️';
}

function getStageLabel(stageKey: string): string {
  const stage = DEFAULT_PIPELINE_STAGES.find(s => s.key === stageKey);
  return stage?.label || stageKey;
}

function StageIndicator({ stageRun }: { stageRun: StageRun }) {
  const icon = getStageIcon(stageRun.stageKey);
  const label = getStageLabel(stageRun.stageKey);

  switch (stageRun.status) {
    case 'completed':
      return (
        <div className="flex flex-col items-center gap-1" title={`${label}: 已完成`}>
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <span className="text-xs text-emerald-400">{label}</span>
        </div>
      );
    case 'running':
      return (
        <div className="flex flex-col items-center gap-1" title={`${label}: 进行中`}>
          <div className="w-8 h-8 rounded-full bg-blue-500/20 border-2 border-blue-500 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          </div>
          <span className="text-xs text-blue-400 font-medium">{label}</span>
        </div>
      );
    case 'failed':
      return (
        <div className="flex flex-col items-center gap-1" title={`${label}: 失败`}>
          <div className="w-8 h-8 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center">
            <XCircle className="w-5 h-5 text-red-400" />
          </div>
          <span className="text-xs text-red-400">{label}</span>
        </div>
      );
    case 'skipped':
      return (
        <div className="flex flex-col items-center gap-1" title={`${label}: 跳过`}>
          <div className="w-8 h-8 rounded-full bg-gray-800 border-2 border-gray-700 flex items-center justify-center">
            <PauseCircle className="w-5 h-5 text-gray-500" />
          </div>
          <span className="text-xs text-gray-500">{label}</span>
        </div>
      );
    default:
      return (
        <div className="flex flex-col items-center gap-1" title={`${label}: 待执行`}>
          <div className="w-8 h-8 rounded-full bg-gray-800 border-2 border-gray-700 flex items-center justify-center">
            <span className="text-sm">{icon}</span>
          </div>
          <span className="text-xs text-gray-500">{label}</span>
        </div>
      );
  }
}

export function PipelineFlow({ stageRuns, currentStageIndex, compact = false }: PipelineFlowProps) {
  if (stageRuns.length === 0) {
    return <span className="text-sm text-gray-500">无流水线</span>;
  }

  return (
    <div className={`flex items-center gap-0 ${compact ? 'scale-75 origin-left' : ''}`}>
      {stageRuns.map((stage, index) => (
        <div key={stage.id} className="flex items-center">
          <StageIndicator stageRun={stage} />
          {index < stageRuns.length - 1 && (
            <div className="w-6 h-px bg-gray-700 mx-1 flex-shrink-0">
              <ArrowRight className="w-3 h-3 text-gray-600" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
