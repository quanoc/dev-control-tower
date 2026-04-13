import React, { useState, useCallback } from 'react';
import { GripVertical, Trash2, Plus, ArrowDown } from 'lucide-react';
import type { PipelinePhase, PipelineStep, PhaseKey } from '@pipeline/shared';
import { PHASES, getActionDef, getPhaseDef, isStandardPhase } from '@pipeline/shared';

const CUSTOM_PHASE_COLORS = ['violet', 'rose', 'orange', 'teal', 'indigo'];

function resolvePhaseColor(phaseKey: PhaseKey): string {
  const standard = getPhaseDef(phaseKey);
  if (standard) return standard.color;
  const hash = phaseKey.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return CUSTOM_PHASE_COLORS[hash % CUSTOM_PHASE_COLORS.length];
}

function getPhaseColor(color: string): { bg: string; text: string; border: string; ring: string } {
  const map: Record<string, { bg: string; text: string; border: string; ring: string }> = {
    purple:  { bg: 'bg-purple-500/15',    text: 'text-purple-400',    border: 'border-purple-500/40', ring: 'ring-purple-500/30' },
    cyan:    { bg: 'bg-cyan-500/15',      text: 'text-cyan-400',      border: 'border-cyan-500/40',   ring: 'ring-cyan-500/30' },
    emerald: { bg: 'bg-emerald-500/15',   text: 'text-emerald-400',   border: 'border-emerald-500/40', ring: 'ring-emerald-500/30' },
    amber:   { bg: 'bg-amber-500/15',     text: 'text-amber-400',     border: 'border-amber-500/40',   ring: 'ring-amber-500/30' },
    blue:    { bg: 'bg-blue-500/15',      text: 'text-blue-400',      border: 'border-blue-500/40',    ring: 'ring-blue-500/30' },
    violet:  { bg: 'bg-violet-500/15',    text: 'text-violet-400',    border: 'border-violet-500/40', ring: 'ring-violet-500/30' },
    rose:    { bg: 'bg-rose-500/15',      text: 'text-rose-400',      border: 'border-rose-500/40',   ring: 'ring-rose-500/30' },
    orange:  { bg: 'bg-orange-500/15',    text: 'text-orange-400',    border: 'border-orange-500/40', ring: 'ring-orange-500/30' },
    teal:    { bg: 'bg-teal-500/15',      text: 'text-teal-400',      border: 'border-teal-500/40',   ring: 'ring-teal-500/30' },
    indigo:  { bg: 'bg-indigo-500/15',    text: 'text-indigo-400',    border: 'border-indigo-500/40', ring: 'ring-indigo-500/30' },
    gray:    { bg: 'bg-gray-500/15',      text: 'text-gray-400',      border: 'border-gray-500/40',   ring: 'ring-gray-500/30' },
  };
  return map[color] || map.blue;
}

function getActorBadge(actorType: string): { bg: string; text: string } {
  switch (actorType) {
    case 'agent':  return { bg: 'bg-emerald-500/20', text: 'text-emerald-400' };
    case 'human':  return { bg: 'bg-amber-500/20',   text: 'text-amber-400' };
    case 'system': return { bg: 'bg-blue-500/20',    text: 'text-blue-400' };
    default:       return { bg: 'bg-gray-500/20',    text: 'text-gray-400' };
  }
}

const ACTOR_SHORT: Record<string, string> = { agent: 'Agent', human: '人工', system: '系统' };

interface PipelinePreviewProps {
  phases: PipelinePhase[];
  selectedPhase: string | null;
  selectedStep: { phaseKey: string; stepIndex: number } | null;
  onSelectStep: (phaseKey: string, stepIndex: number) => void;
  onRemoveStep: (phaseKey: string, stepIndex: number) => void;
  onAddStepToPhase: (phaseKey: string) => void;
  onEditPhase?: (phaseKey: string) => void;
  onDragStart: (phaseKey: string, stepIndex: number) => void;
  onDragOver: (e: React.DragEvent, phaseKey: string, stepIndex: number) => void;
  onDragEnd: () => void;
  onAddCustomPhase?: () => void;
  onRemoveCustomPhase?: (phaseKey: string) => void;
  onAddPhaseAfter?: (afterPhaseKey: string) => void;
  onToggleBatchBoundary?: (phaseKey: string, afterStepIndex: number) => void;
}

/** Group steps into batches based on phase.batches */
function getBatchedSteps(phase: PipelinePhase): { steps: PipelineStep[]; isParallel: boolean }[] {
  const batches: { steps: PipelineStep[]; isParallel: boolean }[] = [];
  const batchSizes = phase.batches || phase.steps.map(() => 1);
  let stepIdx = 0;

  for (const size of batchSizes) {
    const batchSteps: PipelineStep[] = [];
    for (let i = 0; i < size && stepIdx < phase.steps.length; i++) {
      batchSteps.push(phase.steps[stepIdx++]);
    }
    if (batchSteps.length > 0) {
      batches.push({ steps: batchSteps, isParallel: batchSteps.length > 1 });
    }
  }

  // Handle remaining steps (if any)
  while (stepIdx < phase.steps.length) {
    batches.push({ steps: [phase.steps[stepIdx++]], isParallel: false });
  }

  return batches;
}

export function PipelinePreview({
  phases, selectedPhase, selectedStep,
  onSelectStep, onRemoveStep, onAddStepToPhase,
  onEditPhase,
  onDragStart, onDragOver, onDragEnd,
  onAddCustomPhase, onRemoveCustomPhase, onAddPhaseAfter,
  onToggleBatchBoundary,
}: PipelinePreviewProps) {
  const [hoveredGap, setHoveredGap] = useState<{ phaseKey: string; afterStepIndex: number } | null>(null);

  const customPhases = phases.filter(p => !isStandardPhase(p.phaseKey));
  const hasContent = phases.some(p => p.steps.length > 0) || customPhases.length > 0;

  const handleGapClick = useCallback((phaseKey: string, afterStepIndex: number) => {
    onToggleBatchBoundary?.(phaseKey, afterStepIndex);
  }, [onToggleBatchBoundary]);

  function renderStepCard(step: PipelineStep, phaseKey: string, stepIndex: number, colors: ReturnType<typeof getPhaseColor>) {
    const def = getActionDef(step.action);
    const actorBadge = getActorBadge(step.actorType);
    const isSelected = selectedStep?.phaseKey === phaseKey && selectedStep?.stepIndex === stepIndex;

    return (
      <div
        key={step.key}
        draggable
        onDragStart={() => onDragStart(phaseKey, stepIndex)}
        onDragOver={(e) => onDragOver(e, phaseKey, stepIndex)}
        onDragEnd={onDragEnd}
        onClick={() => onSelectStep(phaseKey, stepIndex)}
        className={`group flex items-center gap-1.5 px-2.5 py-2 rounded-lg border-2 cursor-pointer transition-all text-left ${
          isSelected
            ? `${colors.border} ${colors.bg} ring-1 ring-offset-1 ring-offset-gray-900 ${colors.ring}`
            : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
        }`}
      >
        <GripVertical className="w-3 h-3 text-gray-600 cursor-grab active:cursor-grabbing flex-shrink-0" />
        <span className="text-sm leading-none flex-shrink-0">{def?.icon || step.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-gray-200 truncate">{step.label}</div>
          <div className="text-[10px] text-gray-500 flex items-center gap-1">
            <span className={`px-1 py-px rounded ${actorBadge.bg} ${actorBadge.text}`}>
              {ACTOR_SHORT[step.actorType]}
            </span>
            {step.optional && <span className="text-gray-600">?</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemoveStep(phaseKey, stepIndex); }}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-red-400 transition-opacity flex-shrink-0"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  }

  function renderBatchGap(phaseKey: string, afterStepIndex: number, isLast: boolean) {
    if (isLast) return null;

    const isHovered = hoveredGap?.phaseKey === phaseKey && hoveredGap?.afterStepIndex === afterStepIndex;

    return (
      <div
        className="relative py-1 -my-0.5 cursor-pointer group/gap"
        onMouseEnter={() => setHoveredGap({ phaseKey, afterStepIndex })}
        onMouseLeave={() => setHoveredGap(null)}
        onClick={() => handleGapClick(phaseKey, afterStepIndex)}
      >
        <div className="flex items-center justify-center">
          <div className={`w-px h-4 transition-all ${
            isHovered ? 'bg-cyan-400 w-0.5' : 'bg-gray-600'
          }`} />
        </div>
        <div className={`absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 transition-opacity ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}>
          <div className="bg-cyan-500/20 text-cyan-400 text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap">
            点击切换串/并行
          </div>
        </div>
        <div className={`absolute left-1/2 -translate-x-1/2 -bottom-1 transition-opacity ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}>
          <ArrowDown className="w-3 h-3 text-cyan-400" />
        </div>
      </div>
    );
  }

  function renderPhaseColumn(phase: PipelinePhase, color: string, isCustom: boolean) {
    const colors = getPhaseColor(color);
    const isActive = phase.steps.length > 0;
    const batches = getBatchedSteps(phase);
    let globalStepIndex = 0;

    return (
      <div key={phase.phaseKey} className="flex flex-col items-center w-44 flex-shrink-0">
        {/* Phase header */}
        <div className="w-full flex items-center justify-between px-2 py-2 rounded-lg border-2 transition-colors mb-2 group/phase">
          <button
            type="button"
            onClick={() => onEditPhase?.(phase.phaseKey)}
            className={`flex items-center gap-2 flex-1 min-w-0 ${
              isActive
                ? `border-solid ${colors.border} ${colors.bg}`
                : 'border-dashed border-gray-700 hover:border-gray-600'
            } rounded-md px-2 py-1 transition-colors`}
          >
            <span className={`text-sm font-medium truncate ${isActive ? colors.text : 'text-gray-500'}`}>
              {phase.label}
            </span>
            {isActive && (
              <span className={`text-[10px] px-1 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                {phase.steps.length}
              </span>
            )}
          </button>
          {phase.steps.length === 0 && (
            <button
              type="button"
              onClick={() => onRemoveCustomPhase?.(phase.phaseKey)}
              className="ml-1 p-1 opacity-0 group-hover/phase:opacity-100 text-gray-600 hover:text-red-400 transition-opacity"
              title="删除阶段"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Steps with batch visualization */}
        <div className="w-full space-y-1">
          {batches.map((batch, batchIdx) => {
            const isParallel = batch.isParallel;
            const batchStartIdx = globalStepIndex;

            return (
              <React.Fragment key={batchIdx}>
                {/* Batch container */}
                <div className={`relative ${isParallel ? 'p-1.5 rounded-lg border-2 border-cyan-500/40 bg-cyan-500/5' : ''}`}>
                  {isParallel && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] text-cyan-400 bg-gray-900 px-1">
                      并行
                    </div>
                  )}
                  <div className="space-y-1">
                    {batch.steps.map((step, idx) => {
                      const stepGlobalIdx = batchStartIdx + idx;
                      globalStepIndex++;
                      return (
                        <React.Fragment key={step.key}>
                          {renderStepCard(step, phase.phaseKey, stepGlobalIdx, colors)}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* Gap between batches (serial separator) */}
                {renderBatchGap(phase.phaseKey, batchStartIdx + batch.steps.length - 1, batchIdx === batches.length - 1)}
              </React.Fragment>
            );
          })}

          {phase.steps.length === 0 && (
            <div className="text-center py-3 text-[10px] text-gray-600 border border-dashed border-gray-700 rounded-lg">
              暂无步骤
            </div>
          )}

          {/* Add step button */}
          <button
            type="button"
            onClick={() => onAddStepToPhase(phase.phaseKey)}
            className="w-full flex items-center justify-center py-1.5 rounded-lg border border-dashed border-gray-700 hover:border-gray-600 text-gray-600 hover:text-gray-400 transition-colors mt-2"
          >
            <span className="text-xs">+</span>
          </button>
        </div>
      </div>
    );
  }

  if (!hasContent && !onAddCustomPhase) {
    return (
      <div className="text-center py-10 border-2 border-dashed border-gray-700 rounded-xl">
        <p className="text-sm text-gray-500">点击下方阶段节点开始添加步骤</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-2 -mx-1 px-1">
        <div className="flex gap-1 min-w-max items-start">
          {phases.length === 0 ? (
            PHASES.map(p => {
              const def = getPhaseDef(p.key);
              return (
                <React.Fragment key={p.key}>
                  {renderPhaseColumn(
                    { phaseKey: p.key, label: def?.label || p.key, icon: def?.icon || '📌', steps: [] },
                    def?.color || 'blue',
                    false
                  )}
                  {onAddPhaseAfter && (
                    <button
                      type="button"
                      onClick={() => onAddPhaseAfter(p.key)}
                      className="w-6 h-[36px] flex items-center justify-center mt-[2px] rounded border border-dashed border-gray-700 hover:border-gray-500 text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0"
                      title="在后面添加阶段"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </React.Fragment>
              );
            })
          ) : (
            phases.map((phase) => {
              const def = getPhaseDef(phase.phaseKey);
              const isCustom = !isStandardPhase(phase.phaseKey);
              return (
                <React.Fragment key={phase.phaseKey}>
                  {renderPhaseColumn(
                    phase,
                    isCustom ? resolvePhaseColor(phase.phaseKey) : def?.color || 'blue',
                    isCustom,
                  )}
                  {onAddPhaseAfter && (
                    <button
                      type="button"
                      onClick={() => onAddPhaseAfter(phase.phaseKey)}
                      className="w-6 h-[36px] flex items-center justify-center mt-[2px] rounded border border-dashed border-gray-700 hover:border-gray-500 text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0"
                      title="在后面添加阶段"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
