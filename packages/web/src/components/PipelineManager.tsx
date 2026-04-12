import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, X, GitBranch, Check } from 'lucide-react';
import { api } from '../api/client';
import type { PipelineTemplate, PipelinePhase, PipelineStep, PhaseKey, ExecutionMode, AgentActionType, HumanGateType, SystemFlowType } from '@pipeline/shared';
import { PipelinePreview } from './PipelinePreview';
import { StepDrawer } from './StepDrawer';
import { StagePicker } from './StagePicker';
import { getActionDef, PRESET_TEMPLATES } from '@pipeline/shared';

const COMPLEXITY_OPTIONS = [
  { key: 'small' as const, label: '小需求', desc: '快速交付', icon: '⚡' },
  { key: 'medium' as const, label: '标准', desc: '含人工评审', icon: '📋' },
  { key: 'large' as const, label: '完整', desc: '全链路多评审', icon: '🏗️' },
];

let stepCounter = 0;
function makeStepKey(): string {
  return `step_${Date.now()}_${++stepCounter}`;
}

function makeStep(action: string, actorType: 'agent' | 'human' | 'system', opts?: { agentId?: string; humanRole?: string; optional?: boolean; execution?: ExecutionMode }): PipelineStep {
  const def = getActionDef(action);
  return {
    key: makeStepKey(),
    label: def?.label || action,
    actorType,
    action: action as AgentActionType | HumanGateType | SystemFlowType,
    agentId: opts?.agentId,
    humanRole: opts?.humanRole,
    optional: opts?.optional ?? false,
    icon: def?.icon || '⚙️',
    execution: opts?.execution ?? 'serial',
  };
}

interface TemplateFormData {
  name: string;
  description: string;
  complexity: 'small' | 'medium' | 'large';
  phases: PipelinePhase[];
}

function emptyForm(): TemplateFormData {
  return { name: '', description: '', complexity: 'medium', phases: [] };
}

export function PipelineManager() {
  const [templates, setTemplates] = useState<PipelineTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Two-level editor state
  const [selectedStep, setSelectedStep] = useState<{ phaseKey: string; stepIndex: number } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showAddPhaseDialog, setShowAddPhaseDialog] = useState(false);
  const [addPhaseAfterKey, setAddPhaseAfterKey] = useState<string | null>(null);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [pickerPhase, setPickerPhase] = useState<PhaseKey | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await api.pipelines.listTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || saving) return;

    setSaving(true);
    try {
      if (editingId) {
        await api.pipelines.updateTemplate(editingId, formData.name, formData.description, formData.phases, formData.complexity);
      } else {
        await api.pipelines.createTemplate(formData.name, formData.description, formData.phases, formData.complexity);
      }
      await loadTemplates();
      handleCloseForm();
    } catch (err) {
      console.error('Failed to save template:', err);
    } finally {
      setSaving(false);
    }
  };

  // Two-level editor handlers
  const addStepToPhase = (phaseKey: PhaseKey, actorType: 'agent' | 'human' | 'system', action: string, execution: ExecutionMode = 'serial') => {
    const newStep = makeStep(action, actorType, { execution });
    setFormData(prev => ({
      ...prev,
      phases: prev.phases.map(p => p.phaseKey === phaseKey ? { ...p, steps: [...p.steps, newStep] } : p),
    }));
    setShowPicker(false);
    setPickerPhase(null);
    setSelectedStep({ phaseKey, stepIndex: formData.phases.find(p => p.phaseKey === phaseKey)?.steps.length ?? 0 });
  };

  const removeStep = (phaseKey: string, stepIndex: number) => {
    setFormData(prev => ({
      ...prev,
      phases: prev.phases.map(p => p.phaseKey === phaseKey ? { ...p, steps: p.steps.filter((_, i) => i !== stepIndex) } : p),
    }));
    if (selectedStep?.phaseKey === phaseKey && selectedStep.stepIndex === stepIndex) {
      setSelectedStep(null);
    }
  };

  const updateStep = (phaseKey: string, stepIndex: number, field: keyof PipelineStep, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      phases: prev.phases.map(p => {
        if (p.phaseKey !== phaseKey) return p;
        return { ...p, steps: p.steps.map((s, i) => i === stepIndex ? { ...s, [field]: value } : s) };
      }),
    }));
  };

  const handleCreatePreset = (complexity: 'small' | 'medium' | 'large') => {
    const preset = PRESET_TEMPLATES[complexity];
    setFormData({
      name: preset.name,
      description: preset.description,
      complexity,
      phases: preset.phases.map(p => ({ ...p, steps: p.steps.map(s => ({ ...s, key: makeStepKey() })) })),
    });
    setEditingId(null);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个流水线模板吗？')) return;
    setDeletingId(id);
    try {
      await api.pipelines.deleteTemplate(id);
      await loadTemplates();
    } catch (err) {
      console.error('Failed to delete template:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (template: PipelineTemplate) => {
    setFormData({
      name: template.name,
      description: template.description || '',
      complexity: (template.complexity as 'small' | 'medium' | 'large') || 'medium',
      phases: template.phases.length > 0 ? template.phases : [],
    });
    setEditingId(template.id);
    setShowForm(true);
    setSelectedStep(null);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm());
    setSelectedStep(null);
    setShowPicker(false);
    setShowAddPhaseDialog(false);
    setAddPhaseAfterKey(null);
    setNewPhaseName('');
  };

  // Drag handlers for PipelinePreview
  const handleDragStart = (phaseKey: string, stepIndex: number) => {
    // Placeholder for drag functionality
  };
  const handleDragOver = (e: React.DragEvent, phaseKey: string, stepIndex: number) => {
    e.preventDefault();
  };
  const handleDragEnd = () => {};

  // Add phase after another phase - open dialog
  const addPhaseAfter = (afterPhaseKey: string) => {
    setAddPhaseAfterKey(afterPhaseKey);
    setNewPhaseName('');
    setShowAddPhaseDialog(true);
  };

  const confirmAddPhase = () => {
    if (!newPhaseName.trim() || !addPhaseAfterKey) return;
    const key = newPhaseName.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || `phase_${Date.now()}`;

    const newPhase: PipelinePhase = {
      phaseKey: key,
      label: newPhaseName.trim(),
      icon: '📌',
      steps: [],
    };

    setFormData(prev => {
      const idx = prev.phases.findIndex(p => p.phaseKey === addPhaseAfterKey);
      const newPhases = [...prev.phases];
      newPhases.splice(idx + 1, 0, newPhase);
      return { ...prev, phases: newPhases };
    });

    setShowAddPhaseDialog(false);
    setAddPhaseAfterKey(null);
    setNewPhaseName('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">流水线模板</h2>
          <p className="text-sm text-gray-500 mt-1">管理研发流程的流水线模板</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建模板
          </button>
        </div>
      </div>

      {/* Template List */}
      {templates.length === 0 ? (
        <div className="text-center py-16 bg-gray-900/50 rounded-xl border border-gray-800">
          <GitBranch className="w-8 h-8 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">暂无流水线模板</p>
          <p className="text-xs text-gray-600 mt-1">点击上方按钮创建第一个流水线模板</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-900/80 border-b border-gray-800">
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 w-16">#</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500">模板名称</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 w-28">复杂度</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 w-56">阶段 / 步骤</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 w-40">创建时间</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="bg-gray-950">
                {templates.map(template => (
                  <tr key={template.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">#{template.id}</td>
                    <td className="px-4 py-3 min-w-0">
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-4 h-4 text-blue-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm text-gray-200 font-medium truncate">{template.name}</div>
                          {template.description && (
                            <div className="text-xs text-gray-500 truncate">{template.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        template.complexity === 'small' ? 'bg-cyan-500/20 text-cyan-400' :
                        template.complexity === 'large' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {template.complexity === 'small' ? '小需求' : template.complexity === 'large' ? '完整' : '标准'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {template.phases.map((phase) => (
                          <span key={phase.phaseKey} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                            {phase.label}
                          </span>
                        ))}
                        <span className="text-[10px] text-gray-600 ml-1">
                          / {template.stages?.length || 0} 步
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {new Date(template.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(template)}
                          className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded-lg transition-colors"
                          title="编辑"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(template.id)}
                          disabled={deletingId === template.id}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                          title="删除"
                        >
                          {deletingId === template.id ? (
                            <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={handleCloseForm} />
          <div className="fixed inset-4 bg-gray-900 border border-gray-800 rounded-2xl z-50 flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-gray-100">
                {editingId ? '编辑流水线模板' : '新建流水线模板'}
              </h3>
              <button onClick={handleCloseForm} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Basic Info */}
              <div className="space-y-3">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">
                      模板名称 <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                      placeholder="例如：AI主导研发流程"
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs text-gray-500 mb-1">复杂度</label>
                    <select
                      value={formData.complexity}
                      onChange={e => setFormData(prev => ({ ...prev, complexity: e.target.value as any }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    >
                      {COMPLEXITY_OPTIONS.map(opt => (
                        <option key={opt.key} value={opt.key}>{opt.icon} {opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">描述</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="描述这个流水线的用途..."
                  />
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex gap-3">
                {COMPLEXITY_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleCreatePreset(opt.key)}
                    className="flex-1 flex items-center gap-2 p-3 bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors text-left"
                  >
                    <span className="text-lg">{opt.icon}</span>
                    <div>
                      <div className="text-sm font-medium text-gray-200">{opt.label}</div>
                      <div className="text-xs text-gray-500">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Pipeline Preview */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">流水线预览 · 点击阶段添加步骤，点击步骤编辑</label>
                <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
                  <PipelinePreview
                    phases={formData.phases}
                    selectedPhase={null}
                    selectedStep={selectedStep}
                    onSelectStep={(pk, si) => { setSelectedStep({ phaseKey: pk, stepIndex: si }); setShowPicker(false); }}
                    onRemoveStep={removeStep}
                    onAddStepToPhase={(pk) => { setShowPicker(true); setPickerPhase(pk as PhaseKey); setSelectedStep(null); }}
                    onRemoveCustomPhase={(pk) => setFormData(prev => ({ ...prev, phases: prev.phases.filter(p => p.phaseKey !== pk) }))}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    onAddPhaseAfter={addPhaseAfter}
                  />
                </div>
              </div>

              {/* Step Drawer */}
              {selectedStep && !showPicker && (() => {
                const phase = formData.phases.find(p => p.phaseKey === selectedStep.phaseKey);
                const step = phase?.steps[selectedStep.stepIndex];
                if (!step) return null;
                return (
                  <StepDrawer
                    step={step}
                    phaseKey={selectedStep.phaseKey as PhaseKey}
                    onChange={(field, value) => updateStep(selectedStep.phaseKey, selectedStep.stepIndex, field, value)}
                    onClose={() => setSelectedStep(null)}
                  />
                );
              })()}

              {showPicker && pickerPhase && (
                <StagePicker
                  onSelect={(actorType, action, execution) => addStepToPhase(pickerPhase, actorType, action, execution)}
                  onClose={() => { setShowPicker(false); setPickerPhase(null); }}
                />
              )}

              {/* Add Phase Dialog */}
              {showAddPhaseDialog && (
                <>
                  <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowAddPhaseDialog(false)} />
                  <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800 border border-gray-700 rounded-xl p-5 z-[60] w-80 shadow-2xl">
                    <h4 className="text-sm font-medium text-gray-200 mb-3">添加阶段</h4>
                    <input
                      type="text"
                      value={newPhaseName}
                      onChange={e => setNewPhaseName(e.target.value)}
                      placeholder="输入阶段名称"
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 mb-3"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && confirmAddPhase()}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowAddPhaseDialog(false)}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
                      >
                        取消
                      </button>
                      <button
                        onClick={confirmAddPhase}
                        disabled={!newPhaseName.trim()}
                        className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                      >
                        添加
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!formData.name.trim() || formData.phases.every(p => p.steps.length === 0) || saving}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {editingId ? '保存修改' : '创建模板'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}