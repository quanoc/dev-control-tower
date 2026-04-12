import React from 'react';
import type { StageRun } from '@pipeline/shared';
import { CheckCircle, Circle, XCircle, Loader2, ArrowRight, PauseCircle } from 'lucide-react';
import { PHASES } from '@pipeline/shared';

interface PipelineFlowProps {
  stageRuns: StageRun[];
  currentStageIndex: number;
  compact?: boolean;
}

const PHASE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  requirements: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400' },
  design: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400' },
  development: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', text: 'text-emerald-400' },
  testing: { bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-400' },
  deployment: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400' },
};

function getPhaseColor(phaseKey: string) {
  return PHASE_COLORS[phaseKey] || PHASE_COLORS.development;
}

function getPhaseLabel(phaseKey: string) {
  const phase = PHASES.find(p => p.key === phaseKey);
  return phase?.label || phaseKey;
}

function getStatusIcon(status: string, label: string) {
  switch (status) {
    case 'completed':
      return (
        <div className="w-6 h-6 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center" title={`${label}: 已完成`}>
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
        </div>
      );
    case 'running':
      return (
        <div className="w-6 h-6 rounded-full bg-blue-500/20 border-2 border-blue-500 flex items-center justify-center" title={`${label}: 进行中`}>
          <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
        </div>
      );
    case 'failed':
      return (
        <div className="w-6 h-6 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center" title={`${label}: 失败`}>
          <XCircle className="w-3.5 h-3.5 text-red-400" />
        </div>
      );
    case 'skipped':
      return (
        <div className="w-6 h-6 rounded-full bg-gray-800 border-2 border-gray-700 flex items-center justify-center" title={`${label}: 跳过`}>
          <PauseCircle className="w-3.5 h-3.5 text-gray-500" />
        </div>
      );
    default:
      return (
        <div className="w-6 h-6 rounded-full bg-gray-800 border-2 border-gray-700 flex items-center justify-center" title={`${label}: 待执行`}>
          <Circle className="w-3.5 h-3.5 text-gray-600" />
        </div>
      );
  }
}

export function PipelineFlow({ stageRuns, currentStageIndex, compact = false }: PipelineFlowProps) {
  if (stageRuns.length === 0) {
    return <span className="text-sm text-gray-500">无流水线</span>;
  }

  // Group stages by phase
  const phaseMap = new Map<string, StageRun[]>();
  for (const stage of stageRuns) {
    const phaseKey = stage.phaseKey || 'other';
    if (!phaseMap.has(phaseKey)) {
      phaseMap.set(phaseKey, []);
    }
    phaseMap.get(phaseKey)!.push(stage);
  }

  // Order phases: standard phases first, then others
  const orderedPhases = PHASES.map(p => p.key).filter(k => phaseMap.has(k));
  for (const phaseKey of phaseMap.keys()) {
    if (!orderedPhases.includes(phaseKey)) {
      orderedPhases.push(phaseKey);
    }
  }

  return (
    <div className={`overflow-x-auto ${compact ? 'scale-90 origin-left' : ''}`}>
      <div className="flex items-start gap-2 min-w-max">
        {orderedPhases.map((phaseKey, phaseIdx) => {
          const stages = phaseMap.get(phaseKey)!;
          const colors = getPhaseColor(phaseKey);
          const phaseLabel = getPhaseLabel(phaseKey);

          return (
            <React.Fragment key={phaseKey}>
              {/* Phase column */}
              <div className="flex flex-col items-center">
                {/* Phase header */}
                <div className={`flex-shrink-0 px-3 py-1.5 rounded-lg border mb-2 ${colors.bg} ${colors.border} ${colors.text} text-xs font-medium`}>
                  {phaseLabel}
                </div>

                {/* Steps in this phase */}
                <div className="flex flex-col items-center gap-1.5">
                  {stages.map((stage) => {
                    const label = stage.stepLabel || stage.stageKey;
                    return (
                      <div
                        key={stage.id}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded border ${
                          stage.status === 'running' ? 'bg-blue-500/20 border-blue-500/50' :
                          stage.status === 'completed' ? 'bg-emerald-500/20 border-emerald-500/50' :
                          stage.status === 'failed' ? 'bg-red-500/20 border-red-500/50' :
                          'bg-gray-800 border-gray-700'
                        }`}
                        title={`${label}: ${stage.status}`}
                      >
                        {getStatusIcon(stage.status, label)}
                        <span className={`text-xs whitespace-nowrap ${
                          stage.status === 'running' ? 'text-blue-400 font-medium' :
                          stage.status === 'completed' ? 'text-emerald-400' :
                          stage.status === 'failed' ? 'text-red-400' :
                          'text-gray-400'
                        }`}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Arrow to next phase */}
              {phaseIdx < orderedPhases.length - 1 && (
                <div className="flex items-start pt-4">
                  <ArrowRight className="w-4 h-4 text-gray-600" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}