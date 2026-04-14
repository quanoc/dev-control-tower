import { X } from 'lucide-react';
import type { PipelineStep, ActorType, AgentActionType, HumanGateType, SystemFlowType, PhaseKey } from '@pipeline/shared';
import { AGENT_ACTIONS, HUMAN_GATES, SYSTEM_FLOWS, PHASES } from '@pipeline/shared';

interface StageEditorProps {
  step: PipelineStep;
  phaseKey: PhaseKey;
  onChange: (field: keyof PipelineStep, value: string | boolean) => void;
  onClose: () => void;
}

const ACTOR_TABS: { key: ActorType; label: string; icon: string }[] = [
  { key: 'agent',  label: 'Agent', icon: '🤖' },
  { key: 'human',  label: '人工',  icon: '👤' },
  { key: 'system', label: '系统',  icon: '⚙️' },
];

function getActionsForActor(actorType: ActorType): { key: string; label: string; icon: string; description: string }[] {
  switch (actorType) {
    case 'agent':  return AGENT_ACTIONS;
    case 'human':  return HUMAN_GATES;
    case 'system': return SYSTEM_FLOWS;
  }
}

export function StageEditor({ step, phaseKey, onChange, onClose }: StageEditorProps) {
  const actorActions = getActionsForActor(step.actorType);

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-200">编辑: {step.label}</span>
        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded transition-colors">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Phase display (read-only in step editor) */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">所属阶段</label>
        <div className="flex gap-1.5">
          {PHASES.map(phase => (
            <button
              key={phase.key}
              type="button"
              onClick={() => onChange('phaseKey' as keyof PipelineStep, phase.key)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                phaseKey === phase.key
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                  : 'bg-gray-800 text-gray-500 border border-gray-700 hover:border-gray-600'
              }`}
            >
              {phase.icon} {phase.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actor Type */}
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">执行角色</label>
        <div className="flex gap-2">
          {ACTOR_TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                const actions = getActionsForActor(tab.key);
                onChange('actorType', tab.key);
                onChange('action', actions[0].key);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                step.actorType === tab.key
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                  : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
              }`}
            >
              <span>{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action Selection */}
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">动作类型</label>
        <div className="grid grid-cols-2 gap-1.5">
          {actorActions.map(action => (
            <button
              key={action.key}
              type="button"
              onClick={() => {
                onChange('action', action.key);
                onChange('label', action.label);
              }}
              className={`flex items-center gap-2 p-2.5 rounded-lg text-left transition-colors ${
                step.action === action.key
                  ? 'bg-blue-600/20 border border-blue-500/40'
                  : 'bg-gray-800 border border-gray-700 hover:border-gray-600'
              }`}
            >
              <span className="text-base">{action.icon}</span>
              <div>
                <div className="text-xs font-medium text-gray-200">{action.label}</div>
                <div className="text-[10px] text-gray-500">{action.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Label */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">显示名称</label>
        <input
          type="text"
          value={step.label}
          onChange={e => onChange('label', e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
          placeholder="步骤名称"
        />
      </div>

      {/* Actor-specific fields */}
      {step.actorType === 'agent' && (
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Agent</label>
          <input
            type="text"
            value={step.agentId || ''}
            onChange={e => onChange('agentId', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            placeholder="Agent ID"
          />
        </div>
      )}

      {step.actorType === 'human' && (
        <div>
          <label className="text-xs text-gray-500 mb-1 block">角色</label>
          <input
            type="text"
            value={step.humanRole || ''}
            onChange={e => onChange('humanRole', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            placeholder="tech_lead, architect"
          />
        </div>
      )}

      {/* Optional toggle */}
      <div className="flex items-center justify-between py-1">
        <div>
          <div className="text-sm text-gray-300">可选步骤</div>
          <div className="text-xs text-gray-500">小项目时可跳过</div>
        </div>
        <button
          type="button"
          onClick={() => onChange('optional', !step.optional)}
          className={`relative w-10 h-5 rounded-full transition-colors ${step.optional ? 'bg-blue-600' : 'bg-gray-700'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${step.optional ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </div>
  );
}
