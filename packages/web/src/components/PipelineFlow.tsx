import React from 'react';
import type { StageRun, PipelinePhase } from '@pipeline/shared';
import { CheckCircle, Circle, XCircle, Loader2, ArrowRight, PauseCircle } from 'lucide-react';
import { PHASES } from '@pipeline/shared';

interface PipelineFlowProps {
  stageRuns: StageRun[];
  currentStageIndex: number;
  templatePhases?: PipelinePhase[];
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

export function PipelineFlow({ stageRuns, currentStageIndex, templatePhases, compact = false }: PipelineFlowProps) {
  if (stageRuns.length === 0) {
    return <span className="text-sm text-gray-500">无流水线</span>;
  }

  // Create a map from stageKey to stageRun for quick lookup
  const stageRunMap = new Map(stageRuns.map(sr => [sr.stageKey, sr]));

  // If templatePhases provided, use that structure
  const displayPhases = templatePhases && templatePhases.length > 0
    ? templatePhases
    : // Otherwise, group stageRuns by phaseKey
      (() => {
        const phaseMap = new Map<string, StageRun[]>();
        for (const stage of stageRuns) {
          const phaseKey = stage.phaseKey || 'other';
          if (!phaseMap.has(phaseKey)) {
            phaseMap.set(phaseKey, []);
          }
          phaseMap.get(phaseKey)!.push(stage);
        }
        // Convert to PipelinePhase format
        return Array.from(phaseMap.entries()).map(([phaseKey, steps]) => ({
          phaseKey,
          label: getPhaseLabel(phaseKey),
          icon: '📌',
          steps: steps.map(sr => ({
            key: sr.stageKey,
            label: sr.stepLabel || sr.stageKey,
            actorType: 'agent' as const,
            action: 'code' as const,
            optional: false,
            icon: '⚙️',
            execution: 'serial' as const,
          })),
        }));
      })();

  return (
    <div className={`overflow-x-auto ${compact ? 'scale-90 origin-left' : ''}`}>
      <div className="flex items-start gap-2 min-w-max">
        {displayPhases.map((phase, phaseIdx) => {
          const colors = getPhaseColor(phase.phaseKey);
          const phaseLabel = phase.label || getPhaseLabel(phase.phaseKey);

          return (
            <React.Fragment key={phase.phaseKey}>
              {/* Phase column */}
              <div className="flex flex-col items-center">
                {/* Phase header */}
                <div className={`flex-shrink-0 px-3 py-1.5 rounded-lg border mb-2 ${colors.bg} ${colors.border} ${colors.text} text-xs font-medium`}>
                  {phaseLabel}
                </div>

                {/* Steps in this phase */}
                <div className="flex flex-col items-center gap-1.5">
                  {phase.steps.map((step) => {
                    const stageRun = stageRunMap.get(step.key);
                    const status = stageRun?.status || 'pending';
                    const label = step.label;

                    return (
                      <div
                        key={step.key}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded border ${
                          status === 'running' ? 'bg-blue-500/20 border-blue-500/50' :
                          status === 'completed' ? 'bg-emerald-500/20 border-emerald-500/50' :
                          status === 'failed' ? 'bg-red-500/20 border-red-500/50' :
                          'bg-gray-800 border-gray-700'
                        }`}
                        title={`${label}: ${status}`}
                      >
                        {getStatusIcon(status, label)}
                        <span className={`text-xs whitespace-nowrap ${
                          status === 'running' ? 'text-blue-400 font-medium' :
                          status === 'completed' ? 'text-emerald-400' :
                          status === 'failed' ? 'text-red-400' :
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
              {phaseIdx < displayPhases.length - 1 && (
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