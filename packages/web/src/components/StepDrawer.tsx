import { X } from 'lucide-react';
import type { PipelineStep, ActorType, PhaseKey } from '@pipeline/shared';
import { AGENT_ACTIONS, HUMAN_GATES, SYSTEM_FLOWS, PHASES } from '@pipeline/shared';

interface StepDrawerProps {
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

const EXECUTION_MODES: { key: 'serial' | 'parallel'; label: string; icon: string; desc: string }[] = [
  { key: 'serial',   label: '串行', icon: '→',  desc: '等待上一步完成后执行' },
  { key: 'parallel', label: '并行', icon: '⚡', desc: '与其他并行步骤同时执行' },
];

function getActionsForActor(actorType: ActorType) {
  switch (actorType) {
    case 'agent':  return AGENT_ACTIONS;
    case 'human':  return HUMAN_GATES;
    case 'system': return SYSTEM_FLOWS;
  }
}

export function StepDrawer({ step, phaseKey, onChange, onClose }: StepDrawerProps) {
  const actorActions = getActionsForActor(step.actorType);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[360px] bg-gray-900 border-l border-gray-800 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">{step.icon}</span>
            <div>
              <h3 className="text-sm font-semibold text-gray-100">编辑步骤</h3>
              <p className="text-xs text-gray-500 truncate">{step.label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-5">
            {/* Phase display */}
            <div>
              <label className="text-xs text-gray-500 mb-2 block">所属阶段</label>
              <div className="flex flex-wrap gap-1.5">
                {PHASES.map(phase => (
                  <button
                    key={phase.key}
                    type="button"
                    onClick={() => onChange('phaseKey' as keyof PipelineStep, phase.key)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
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
              <label className="text-xs text-gray-500 mb-2 block">执行角色</label>
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
              <label className="text-xs text-gray-500 mb-2 block">动作类型</label>
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

            {/* Execution Mode */}
            <div>
              <label className="text-xs text-gray-500 mb-2 block">执行方式</label>
              <div className="flex gap-2">
                {EXECUTION_MODES.map(mode => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => onChange('execution', mode.key)}
                    className={`flex-1 flex items-center gap-2 p-3 rounded-lg text-left transition-colors ${
                      step.execution === mode.key
                        ? mode.key === 'parallel'
                          ? 'bg-cyan-600/20 border border-cyan-500/40'
                          : 'bg-blue-600/20 border border-blue-500/40'
                        : 'bg-gray-800 border border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <span className="text-lg">{mode.icon}</span>
                    <div>
                      <div className={`text-sm font-medium ${
                        mode.key === 'parallel' ? 'text-cyan-400' : 'text-blue-400'
                      }`}>{mode.label}</div>
                      <div className="text-[10px] text-gray-500">{mode.desc}</div>
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
                <label className="text-xs text-gray-500 mb-1 block">Agent ID</label>
                <input
                  type="text"
                  value={step.agentId || ''}
                  onChange={e => onChange('agentId', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  placeholder="magerd, xiaoxi-pm"
                />
              </div>
            )}

            {step.actorType === 'human' && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">人工角色</label>
                <input
                  type="text"
                  value={step.humanRole || ''}
                  onChange={e => onChange('humanRole', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  placeholder="tech_lead, product_owner"
                />
              </div>
            )}

            {/* Component reference */}
            {step.componentId && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">引用的组件</label>
                <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400">
                  组件 ID: {step.componentId}
                </div>
              </div>
            )}

            {/* Optional toggle */}
            <div className="flex items-center justify-between py-2 border-t border-gray-800">
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
        </div>
      </div>
    </>
  );
}