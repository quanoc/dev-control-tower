import { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { AGENT_ACTIONS, HUMAN_GATES, SYSTEM_FLOWS } from '@pipeline/shared';

type ActorType = 'agent' | 'human' | 'system';
type ExecutionMode = 'serial' | 'parallel';

interface StagePickerProps {
  onSelect: (actorType: ActorType, action: string, execution: ExecutionMode) => void;
  onClose: () => void;
}

const ACTOR_OPTIONS: { key: ActorType; label: string; icon: string; desc: string }[] = [
  { key: 'agent',  label: 'Agent',  icon: '🤖', desc: '由 AI Agent 执行' },
  { key: 'human',  label: '人工',   icon: '👤', desc: '人工审批或评审' },
  { key: 'system', label: '系统',   icon: '⚙️', desc: 'CI/CD 系统流程' },
];

const EXECUTION_OPTIONS: { key: ExecutionMode; label: string; icon: string; desc: string }[] = [
  { key: 'serial',   label: '串行', icon: '→',  desc: '等待上一步完成后再执行' },
  { key: 'parallel', label: '并行', icon: '⚡', desc: '与其他并行步骤同时执行' },
];

function getActionsForActor(actorType: ActorType) {
  switch (actorType) {
    case 'agent':  return AGENT_ACTIONS;
    case 'human':  return HUMAN_GATES;
    case 'system': return SYSTEM_FLOWS;
  }
}

export function StagePicker({ onSelect, onClose }: StagePickerProps) {
  const [step, setStep] = useState(1);
  const [actorType, setActorType] = useState<ActorType>('agent');
  const [action, setAction] = useState<string>(AGENT_ACTIONS[0].key);
  const [execution, setExecution] = useState<ExecutionMode>('serial');

  const actorActions = getActionsForActor(actorType);

  const handleNext = () => {
    if (step === 1) {
      const actions = getActionsForActor(actorType);
      setAction(actions[0].key);
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else {
      onSelect(actorType, action, execution);
    }
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  const stepLabels = ['选择执行角色', '选择动作类型', '选择执行方式'];

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">添加步骤</span>
          <span className="text-xs text-gray-600">({step}/3)</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded transition-colors">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1">
        {[1, 2, 3].map(s => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              s <= step ? 'bg-blue-500' : 'bg-gray-700'
            }`}
          />
        ))}
      </div>

      {/* Step title */}
      <div className="text-xs font-medium text-gray-400">{stepLabels[step - 1]}</div>

      {/* Step 1: Actor selection */}
      {step === 1 && (
        <div className="grid grid-cols-3 gap-3">
          {ACTOR_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setActorType(opt.key)}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                actorType === opt.key
                  ? 'border-blue-500/40 bg-blue-600/10'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              }`}
            >
              <span className="text-2xl">{opt.icon}</span>
              <div className="text-sm font-medium text-gray-200">{opt.label}</div>
              <div className="text-[10px] text-gray-500">{opt.desc}</div>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Action selection */}
      {step === 2 && (
        <div className="grid grid-cols-2 gap-2">
          {actorActions.map(a => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAction(a.key)}
              className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-colors text-left ${
                action === a.key
                  ? 'border-blue-500/40 bg-blue-600/10'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              }`}
            >
              <span className="text-lg">{a.icon}</span>
              <div>
                <div className="text-sm font-medium text-gray-200">{a.label}</div>
                <div className="text-[10px] text-gray-500">{a.description}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Step 3: Execution mode */}
      {step === 3 && (
        <div className="grid grid-cols-2 gap-3">
          {EXECUTION_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setExecution(opt.key)}
              className={`flex flex-col items-center gap-2 p-5 rounded-lg border-2 transition-colors ${
                execution === opt.key
                  ? opt.key === 'parallel'
                    ? 'border-cyan-500/40 bg-cyan-600/10'
                    : 'border-blue-500/40 bg-blue-600/10'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              }`}
            >
              <span className="text-3xl">{opt.icon}</span>
              <div className={`text-base font-semibold ${
                opt.key === 'parallel' ? 'text-cyan-400' : 'text-blue-400'
              }`}>{opt.label}</div>
              <div className="text-xs text-gray-500">{opt.desc}</div>
            </button>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2 border-t border-gray-700">
        <button
          type="button"
          onClick={step > 1 ? handlePrev : onClose}
          className="flex items-center gap-1 px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {step > 1 ? '上一步' : '取消'}
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="flex items-center gap-1 px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
        >
          {step === 3 ? '添加' : '下一步'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
