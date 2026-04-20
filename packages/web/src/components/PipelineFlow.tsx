import React from 'react';
import type { StageRun, PipelinePhase, PipelineInstanceStatus, PipelineStep } from '@pipeline/shared';
import { CheckCircle, Circle, XCircle, Loader2, ArrowRight, ArrowDown, PauseCircle, AlertCircle, Clock, Bot, User, Settings } from 'lucide-react';
import { PHASES } from '@pipeline/shared';

interface PipelineFlowProps {
  stageRuns: StageRun[];
  currentStageIndex: number;
  templatePhases?: PipelinePhase[];
  compact?: boolean;
  pipelineStatus?: PipelineInstanceStatus;
}

const PHASE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  requirements: { bg: 'bg-purple-100 dark:bg-purple-500/20', border: 'border-purple-300 dark:border-purple-500/40', text: 'text-purple-600 dark:text-purple-400' },
  design: { bg: 'bg-cyan-100 dark:bg-cyan-500/20', border: 'border-cyan-300 dark:border-cyan-500/40', text: 'text-cyan-600 dark:text-cyan-400' },
  development: { bg: 'bg-emerald-100 dark:bg-emerald-500/20', border: 'border-emerald-300 dark:border-emerald-500/40', text: 'text-emerald-600 dark:text-emerald-400' },
  testing: { bg: 'bg-amber-100 dark:bg-amber-500/20', border: 'border-amber-300 dark:border-amber-500/40', text: 'text-amber-600 dark:text-amber-400' },
  deployment: { bg: 'bg-blue-100 dark:bg-blue-500/20', border: 'border-blue-300 dark:border-blue-500/40', text: 'text-blue-600 dark:text-blue-400' },
};

function getPhaseColor(phaseKey: string) {
  return PHASE_COLORS[phaseKey] || PHASE_COLORS.development;
}

function getPhaseLabel(phaseKey: string) {
  const phase = PHASES.find(p => p.key === phaseKey);
  return phase?.label || phaseKey;
}

function getActorIcon(actorType: string) {
  switch (actorType) {
    case 'agent':
      return <Bot className="w-3 h-3" />;
    case 'human':
      return <User className="w-3 h-3" />;
    case 'system':
      return <Settings className="w-3 h-3" />;
    default:
      return null;
  }
}

function getActorLabel(actorType: string) {
  switch (actorType) {
    case 'agent':
      return 'AI执行';
    case 'human':
      return '人工审批';
    case 'system':
      return '系统流程';
    default:
      return '未知';
  }
}

function getStatusIconCompact(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-3 h-3 text-emerald-500" />;
    case 'running':
      return <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />;
    case 'failed':
      return <XCircle className="w-3 h-3 text-red-500" />;
    case 'waiting_approval':
      return <Clock className="w-3 h-3 text-amber-500" />;
    case 'skipped':
      return <PauseCircle className="w-3 h-3 text-gray-400" />;
    default:
      return <Circle className="w-3 h-3 text-gray-400" />;
  }
}

export function PipelineFlow({ stageRuns, currentStageIndex, templatePhases, compact = false, pipelineStatus }: PipelineFlowProps) {
  if (stageRuns.length === 0) {
    return <span className="text-sm text-gray-500">无流水线</span>;
  }

  // Create a map from stageKey to stageRun for quick lookup
  const stageRunMap = new Map(stageRuns.map(sr => [sr.stageKey, sr]));

  // Find blocking stage (waiting_approval or failed)
  const blockingStage = stageRuns.find(sr => sr.status === 'waiting_approval' || sr.status === 'failed');

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
            actorType: 'agent' as const, // Default to agent if no templatePhases
            action: 'code' as const,
            optional: false,
            icon: '⚙️',
          })),
          batches: steps.map(() => 1), // Default: all serial
        }));
      })();

  // Get blocking reason message
  const getBlockingMessage = () => {
    if (!blockingStage) return null;
    const stageLabel = blockingStage.stepLabel || blockingStage.stageKey;
    if (blockingStage.status === 'waiting_approval') {
      return { type: 'warning' as const, message: `⏸️ 等待审批：${stageLabel}`, error: undefined };
    }
    if (blockingStage.status === 'failed') {
      return { type: 'error' as const, message: `❌ 执行失败：${stageLabel}`, error: blockingStage.error };
    }
    return null;
  };
  const blockingInfo = getBlockingMessage();

  return (
    <div className={`overflow-x-auto ${compact ? 'scale-90 origin-left' : ''}`}>
      {/* Pipeline status banner */}
      {blockingInfo && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
          blockingInfo.type === 'warning'
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
            : 'bg-red-500/10 border border-red-500/30 text-red-400'
        }`}>
          <AlertCircle className="w-4 h-4" />
          {blockingInfo.message}
          {blockingInfo.error && (
            <span className="text-gray-500 ml-2 truncate max-w-xs" title={blockingInfo.error}>
              — {blockingInfo.error.substring(0, 50)}...
            </span>
          )}
        </div>
      )}

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

                {/* Steps in this phase - grouped by batches */}
                <div className="flex flex-col items-center gap-1">
                  {(() => {
                    const batches = phase.batches || phase.steps.map(() => 1);
                    let stepIdx = 0;
                    const batchGroups: React.ReactNode[] = [];

                    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
                      const batchSize = batches[batchIdx];
                      const batchSteps: PipelineStep[] = [];

                      for (let i = 0; i < batchSize && stepIdx < phase.steps.length; i++) {
                        batchSteps.push(phase.steps[stepIdx++]);
                      }

                      // Render batch (parallel steps grouped horizontally)
                      const batchNodes = batchSteps.map((step) => {
                        const stageRun = stageRunMap.get(step.key);
                        const status = stageRun?.status || 'pending';
                        const label = step.label;
                        const actorType = step.actorType;

                        return (
                          <div
                            key={step.key}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded border ${
                              status === 'running' ? 'bg-blue-100 dark:bg-blue-500/20 border-blue-300 dark:border-blue-500/50' :
                              status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/50' :
                              status === 'failed' ? 'bg-red-100 dark:bg-red-500/20 border-red-300 dark:border-red-500/50' :
                              status === 'waiting_approval' ? 'bg-amber-100 dark:bg-amber-500/20 border-amber-300 dark:border-amber-500/50 animate-pulse' :
                              'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                            }`}
                            title={`${label} (${getActorLabel(actorType)}): ${status}`}
                          >
                            {getStatusIconCompact(status)}
                            {/* Actor type icon */}
                            <span className={`flex items-center gap-0.5 ${
                              actorType === 'agent' ? 'text-purple-500 dark:text-purple-400' :
                              actorType === 'human' ? 'text-orange-500 dark:text-orange-400' :
                              'text-gray-500 dark:text-gray-400'
                            }`} title={getActorLabel(actorType)}>
                              {getActorIcon(actorType)}
                            </span>
                            <span className={`text-xs whitespace-nowrap ${
                              status === 'running' ? 'text-blue-600 dark:text-blue-400 font-medium' :
                              status === 'completed' ? 'text-emerald-600 dark:text-emerald-400' :
                              status === 'failed' ? 'text-red-600 dark:text-red-400' :
                              status === 'waiting_approval' ? 'text-amber-600 dark:text-amber-400 font-medium' :
                              'text-gray-500 dark:text-gray-400'
                            }`}>
                              {label}
                            </span>
                          </div>
                        );
                      });

                      // Parallel batch: steps grouped together vertically with tight spacing
                      if (batchSize > 1) {
                        batchGroups.push(
                          <div key={`batch-${batchIdx}`} className="flex flex-col items-center gap-0.5">
                            {batchNodes}
                          </div>
                        );
                      } else {
                        // Serial batch: single step
                        batchGroups.push(
                          <div key={`batch-${batchIdx}`}>
                            {batchNodes}
                          </div>
                        );
                      }

                      // Add arrow down between batches (serial separator)
                      if (batchIdx < batches.length - 1) {
                        batchGroups.push(
                          <div key={`sep-${batchIdx}`} className="flex items-center justify-center">
                            <ArrowDown className="w-3 h-3 text-gray-400 dark:text-gray-600" />
                          </div>
                        );
                      }
                    }

                    return batchGroups;
                  })()}
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