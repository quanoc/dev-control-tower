import { useState, useEffect, useCallback } from 'react';
import { X, Search, ChevronLeft, Check } from 'lucide-react';
import { api } from '../api/client';
import type { PipelineStep, ActorType, PhaseKey } from '@pipeline/shared';
import { PHASES } from '@pipeline/shared';

interface PipelineComponent {
  id: number;
  name: string;
  description: string | null;
  actor_type: string;
  action: string;
  agent_id: string | null;
  human_role: string | null;
  icon: string | null;
  optional: number;
}

interface ComponentPickerDrawerProps {
  phaseKey: PhaseKey;
  onSelect: (step: PipelineStep) => void;
  onClose: () => void;
}

const ACTOR_TABS: { key: ActorType | 'all'; label: string; icon: string }[] = [
  { key: 'all',    label: '全部',   icon: '🔍' },
  { key: 'agent',  label: 'Agent', icon: '🤖' },
  { key: 'human',  label: '人工',  icon: '👤' },
  { key: 'system', label: '系统',  icon: '⚙️' },
];

function getActorBadge(actorType: string): { bg: string; text: string } {
  switch (actorType) {
    case 'agent':  return { bg: 'bg-emerald-500/20', text: 'text-emerald-400' };
    case 'human':  return { bg: 'bg-amber-500/20',   text: 'text-amber-400' };
    case 'system': return { bg: 'bg-blue-500/20',    text: 'text-blue-400' };
    default:       return { bg: 'bg-gray-500/20',    text: 'text-gray-400' };
  }
}

const ACTOR_SHORT: Record<string, string> = { agent: 'Agent', human: '人工', system: '系统' };

export function ComponentPickerDrawer({ phaseKey, onSelect, onClose }: ComponentPickerDrawerProps) {
  const [components, setComponents] = useState<PipelineComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActorType | 'all'>('all');
  const [search, setSearch] = useState('');
  
  // Selected component for configuration
  const [selectedComponent, setSelectedComponent] = useState<PipelineComponent | null>(null);
  
  const [config, setConfig] = useState({
    label: '',
    optional: false,
  });

  const loadComponents = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.pipelines.listComponents({
        actorType: activeTab === 'all' ? undefined : activeTab,
        search: search || undefined,
        page: 1,
        limit: 100,
      });
      setComponents(result.items);
    } catch (err) {
      console.error('Failed to load components:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search]);

  useEffect(() => {
    loadComponents();
  }, [loadComponents]);

  const handleSelectComponent = (component: PipelineComponent) => {
    setSelectedComponent(component);
    setConfig({
      label: component.name,
      optional: component.optional === 1,
    });
  };

  const handleConfirm = () => {
    if (!selectedComponent) return;

    const step: PipelineStep = {
      key: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      label: config.label || selectedComponent.name,
      actorType: selectedComponent.actor_type as ActorType,
      action: selectedComponent.action as any,
      agentId: selectedComponent.agent_id || undefined,
      humanRole: selectedComponent.human_role || undefined,
      optional: config.optional,
      icon: selectedComponent.icon || '⚙️',
      componentId: selectedComponent.id,
    };

    onSelect(step);
  };

  const handleBack = () => {
    setSelectedComponent(null);
  };

  const phaseDef = PHASES.find(p => p.key === phaseKey);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[400px] bg-gray-900 border-l border-gray-800 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            {selectedComponent ? (
              <button
                onClick={handleBack}
                className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-400" />
              </button>
            ) : null}
            <div>
              <h3 className="text-sm font-semibold text-gray-100">
                {selectedComponent ? '配置组件' : '选择组件'}
              </h3>
              <p className="text-xs text-gray-500">
                {phaseDef?.icon} {phaseDef?.label}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        {selectedComponent ? (
          // Component Configuration View
          <div className="flex-1 overflow-y-auto">
            <div className="px-5 py-4 space-y-5">
              {/* Component Info */}
              <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <span className="text-2xl">{selectedComponent.icon}</span>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-200">{selectedComponent.name}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedComponent.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${getActorBadge(selectedComponent.actor_type).bg} ${getActorBadge(selectedComponent.actor_type).text}`}>
                      {ACTOR_SHORT[selectedComponent.actor_type]}
                    </span>
                  </div>
                </div>
              </div>

              {/* Label */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">显示名称</label>
                <input
                  type="text"
                  value={config.label}
                  onChange={e => setConfig({ ...config, label: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                  placeholder="步骤名称"
                />
              </div>

              {/* Optional toggle */}
              <div className="flex items-center justify-between py-2 border-t border-gray-800">
                <div>
                  <div className="text-sm text-gray-300">可选步骤</div>
                  <div className="text-xs text-gray-500">小项目时可跳过</div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, optional: !config.optional })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${config.optional ? 'bg-blue-600' : 'bg-gray-700'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${config.optional ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          // Component List View
          <div className="flex-1 overflow-y-auto">
            {/* Tabs */}
            <div className="px-5 py-3 border-b border-gray-800">
              <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
                {ACTOR_TABS.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs transition-colors ${
                      activeTab === tab.key
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="px-5 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="搜索组件..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Component Grid */}
            <div className="px-5 pb-4">
              {loading ? (
                <div className="text-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : components.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  暂无组件
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {components.map(component => {
                    const actorBadge = getActorBadge(component.actor_type);
                    return (
                      <button
                        key={component.id}
                        onClick={() => handleSelectComponent(component)}
                        className="flex flex-col items-start p-3 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2 w-full">
                          <span className="text-lg">{component.icon || '⚙️'}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${actorBadge.bg} ${actorBadge.text}`}>
                            {ACTOR_SHORT[component.actor_type]}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-gray-200 mt-2">{component.name}</span>
                        {component.description && (
                          <span className="text-[10px] text-gray-500 mt-1 line-clamp-2">{component.description}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer with Confirm button */}
        {selectedComponent && (
          <div className="px-5 py-4 border-t border-gray-800 flex-shrink-0">
            <button
              onClick={handleConfirm}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              <span className="text-sm font-medium">确认添加</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
