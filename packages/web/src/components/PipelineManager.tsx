import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, GitBranch, Check } from 'lucide-react';
import { Button } from './ui/Button';
import { api } from '../api/client';
import { Modal } from './ui/Modal';
import { Input, TextArea, Select, FormField } from './ui/Input';
import { Badge } from './ui/Badge';
import { SectionHeader } from './ui/SectionHeader';
import type { PipelineTemplate, PipelinePhase, PipelineStep, PhaseKey, AgentActionType, HumanGateType, SystemFlowType } from '@pipeline/shared';
import { PipelinePreview, type DropType, type DropTargetInfo } from './PipelinePreview';
import { StepDrawer } from './StepDrawer';
import { ComponentPickerDrawer } from './ComponentPickerDrawer';
import { getActionDef, getPhaseDef, PRESET_TEMPLATES } from '@pipeline/shared';

const COMPLEXITY_OPTIONS = [
  { key: 'small' as const, label: '小需求', desc: '快速交付', icon: '⚡' },
  { key: 'medium' as const, label: '标准', desc: '含人工评审', icon: '📋' },
  { key: 'large' as const, label: '完整', desc: '全链路多评审', icon: '🏗️' },
];

let stepCounter = 0;
function makeStepKey(): string {
  return `step_${Date.now()}_${++stepCounter}`;
}

function makeStep(action: string, actorType: 'agent' | 'human' | 'system', opts?: { agentId?: string; humanRole?: string; optional?: boolean }): PipelineStep {
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
  const [editingPhaseKey, setEditingPhaseKey] = useState<string | null>(null);
  const [editingPhaseName, setEditingPhaseName] = useState('');
  const [addPhaseAfterKey, setAddPhaseAfterKey] = useState<string | null>(null);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [pickerPhase, setPickerPhase] = useState<PhaseKey | null>(null);

  // Drag state
  const [dragSource, setDragSource] = useState<{ phaseKey: string; stepIndex: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetInfo | null>(null);

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
  const addStepToPhase = (phaseKey: PhaseKey, actorType: 'agent' | 'human' | 'system', action: string) => {
    const newStep = makeStep(action, actorType);
    setFormData(prev => {
      const existing = prev.phases.find(p => p.phaseKey === phaseKey);
      if (existing) {
        // Add step to end, default to serial (new batch with size 1)
        const newBatches = [...(existing.batches || existing.steps.map(() => 1)), 1];
        return {
          ...prev,
          phases: prev.phases.map(p =>
            p.phaseKey === phaseKey
              ? { ...p, steps: [...p.steps, newStep], batches: newBatches }
              : p
          ),
        };
      }
      const def = getPhaseDef(phaseKey as string);
      return {
        ...prev,
        phases: [
          ...prev.phases,
          {
            phaseKey,
            label: def?.label || phaseKey,
            icon: def?.icon || '📌',
            steps: [newStep],
            batches: [1],
          },
        ],
      };
    });
    setShowPicker(false);
    setPickerPhase(null);
    setSelectedStep({ phaseKey, stepIndex: formData.phases.find(p => p.phaseKey === phaseKey)?.steps.length ?? 0 });
  };

  const removeStep = (phaseKey: string, stepIndex: number) => {
    setFormData(prev => {
      const phase = prev.phases.find(p => p.phaseKey === phaseKey);
      if (!phase) return prev;

      // Rebuild batches after removing step
      const newSteps = phase.steps.filter((_, i) => i !== stepIndex);
      const batches = phase.batches || phase.steps.map(() => 1);

      // Find which batch this step was in and adjust
      let currentIdx = 0;
      let newBatches: number[] = [];
      for (const batchSize of batches) {
        const batchStart = currentIdx;
        const batchEnd = currentIdx + batchSize;
        if (stepIndex >= batchStart && stepIndex < batchEnd) {
          // Step is in this batch, reduce size
          if (batchSize > 1) {
            newBatches.push(batchSize - 1);
          }
          // If batch becomes 0, skip it
        } else if (stepIndex < batchStart) {
          // Step is after this batch, keep as is
          newBatches.push(batchSize);
        } else {
          // Step is before this batch, keep as is
          newBatches.push(batchSize);
        }
        currentIdx += batchSize;
      }

      return {
        ...prev,
        phases: prev.phases.map(p =>
          p.phaseKey === phaseKey
            ? { ...p, steps: newSteps, batches: newBatches }
            : p
        ),
      };
    });
    if (selectedStep?.phaseKey === phaseKey && selectedStep.stepIndex === stepIndex) {
      setSelectedStep(null);
    }
  };

  /** Toggle batch boundary after a step (merge with next = parallel, separate = serial) */
  const toggleBatchBoundary = (phaseKey: string, afterStepIndex: number) => {
    setFormData(prev => {
      const phase = prev.phases.find(p => p.phaseKey === phaseKey);
      if (!phase || phase.steps.length <= 1) return prev;

      const batches = phase.batches || phase.steps.map(() => 1);

      // Find which batch the gap after afterStepIndex belongs to
      // afterStepIndex = N means the gap between step N and step N+1
      let boundaryBatchIndex = -1;
      let isInsideBatch = false;
      let splitPointInBatch = 0;
      let pos = 0;

      for (let i = 0; i < batches.length; i++) {
        const batchSize = batches[i];
        const batchEnd = pos + batchSize;

        if (afterStepIndex >= pos && afterStepIndex < batchEnd - 1) {
          // Gap is inside a multi-step batch - split this batch
          isInsideBatch = true;
          boundaryBatchIndex = i;
          splitPointInBatch = afterStepIndex - pos + 1;
          break;
        } else if (afterStepIndex === batchEnd - 1) {
          // Gap is at the end of this batch (between this batch and next)
          boundaryBatchIndex = i;
          break;
        }
        pos = batchEnd;
      }

      let newBatches: number[];

      if (isInsideBatch) {
        // Split the batch at the gap position
        const batchSize = batches[boundaryBatchIndex];
        newBatches = [
          ...batches.slice(0, boundaryBatchIndex),
          splitPointInBatch,
          batchSize - splitPointInBatch,
          ...batches.slice(boundaryBatchIndex + 1),
        ];
      } else if (boundaryBatchIndex >= 0 && boundaryBatchIndex < batches.length - 1) {
        // Merge current batch with the next batch
        newBatches = [
          ...batches.slice(0, boundaryBatchIndex),
          batches[boundaryBatchIndex] + batches[boundaryBatchIndex + 1],
          ...batches.slice(boundaryBatchIndex + 2),
        ];
      } else {
        // No change (gap is at the very end, no next batch to merge)
        return prev;
      }

      return {
        ...prev,
        phases: prev.phases.map(p =>
          p.phaseKey === phaseKey ? { ...p, batches: newBatches } : p
        ),
      };
    });
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
    setDragSource({ phaseKey, stepIndex });
    setDropTarget(null);
  };

  // Drag over a step - merge as parallel
  const handleDragOverStep = (e: React.DragEvent, phaseKey: string, stepIndex: number) => {
    e.preventDefault();
    if (dragSource && dragSource.phaseKey === phaseKey && dragSource.stepIndex !== stepIndex) {
      setDropTarget({ phaseKey, targetStepIndex: stepIndex, dropType: 'parallel' });
    }
  };

  // Drag over a gap - insert as serial
  const handleDragOverGap = (phaseKey: string, afterStepIndex: number) => {
    if (dragSource && dragSource.phaseKey === phaseKey) {
      // Can insert after any position, including before first step (afterStepIndex = -1)
      setDropTarget({ phaseKey, targetStepIndex: afterStepIndex, dropType: 'serial' });
    }
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDragSource(null);
    setDropTarget(null);
  };

  // Drop on a step - merge as parallel
  const handleDropStep = (targetPhaseKey: string, targetStepIndex: number) => {
    if (!dragSource || dragSource.phaseKey !== targetPhaseKey || dragSource.stepIndex === targetStepIndex) {
      setDragSource(null);
      setDropTarget(null);
      return;
    }

    const sourceIndex = dragSource.stepIndex;
    const targetIndex = targetStepIndex;

    setFormData(prev => {
      const phase = prev.phases.find(p => p.phaseKey === targetPhaseKey);
      if (!phase) return prev;

      const oldBatches = phase.batches || phase.steps.map(() => 1);

      // Find which batch the source and target steps are in
      let pos = 0;
      let sourceBatchIndex = -1;
      let targetBatchIndex = -1;
      let sourcePosInBatch = -1;
      let targetPosInBatch = -1;

      for (let batchIdx = 0; batchIdx < oldBatches.length; batchIdx++) {
        const batchSize = oldBatches[batchIdx];
        for (let i = 0; i < batchSize; i++) {
          if (pos === sourceIndex) {
            sourceBatchIndex = batchIdx;
            sourcePosInBatch = i;
          }
          if (pos === targetIndex) {
            targetBatchIndex = batchIdx;
            targetPosInBatch = i;
          }
          pos++;
        }
      }

      // Build new batches
      if (sourceBatchIndex === targetBatchIndex) {
        // Already in same batch - no change needed
        return prev;
      }

      // Remove source from its batch, add to target batch
      const newBatches = [...oldBatches];

      // Decrease source batch size (remove if becomes 0)
      if (newBatches[sourceBatchIndex] > 1) {
        newBatches[sourceBatchIndex]--;
      } else {
        newBatches.splice(sourceBatchIndex, 1);
        // Adjust target batch index if it was after source
        if (targetBatchIndex > sourceBatchIndex) {
          targetBatchIndex--;
        }
      }

      // Increase target batch size
      newBatches[targetBatchIndex]++;

      // Reorder steps: move source step to be adjacent with target
      const newSteps = [...phase.steps];
      const [movedStep] = newSteps.splice(sourceIndex, 1);
      // Insert after target step
      const insertIndex = sourceIndex < targetIndex ? targetIndex : targetIndex + 1;
      newSteps.splice(insertIndex, 0, movedStep);

      return {
        ...prev,
        phases: prev.phases.map(p =>
          p.phaseKey === targetPhaseKey
            ? { ...p, steps: newSteps, batches: newBatches }
            : p
        ),
      };
    });

    setDragSource(null);
    setDropTarget(null);
  };

  // Drop on a gap - insert as serial (separate from any parallel group)
  const handleDropGap = (targetPhaseKey: string, afterStepIndex: number) => {
    if (!dragSource || dragSource.phaseKey !== targetPhaseKey) {
      setDragSource(null);
      setDropTarget(null);
      return;
    }

    const sourceIndex = dragSource.stepIndex;

    setFormData(prev => {
      const phase = prev.phases.find(p => p.phaseKey === targetPhaseKey);
      if (!phase) return prev;

      const oldBatches = phase.batches || phase.steps.map(() => 1);

      // Build stepKey -> batchIndex map
      const stepKeyToBatch = new Map<string, number>();
      let pos = 0;
      for (let batchIdx = 0; batchIdx < oldBatches.length; batchIdx++) {
        for (let i = 0; i < oldBatches[batchIdx] && pos < phase.steps.length; i++) {
          stepKeyToBatch.set(phase.steps[pos].key, batchIdx);
          pos++;
        }
      }

      const movedStepKey = phase.steps[sourceIndex].key;

      // Rebuild steps array
      const newSteps = [...phase.steps];
      const [movedStep] = newSteps.splice(sourceIndex, 1);

      // Calculate insert position
      let insertPos: number;
      if (afterStepIndex === -1) {
        insertPos = 0;
      } else if (afterStepIndex < sourceIndex) {
        insertPos = afterStepIndex + 1;
      } else {
        insertPos = afterStepIndex;
      }

      newSteps.splice(insertPos, 0, movedStep);

      // Rebuild batches based on original batch membership
      const newBatches: number[] = [];
      let i = 0;
      while (i < newSteps.length) {
        const step = newSteps[i];
        if (step.key === movedStepKey) {
          // Moved step becomes standalone serial batch
          newBatches.push(1);
          i++;
        } else {
          // Find adjacent steps from the same original batch
          const batchIdx = stepKeyToBatch.get(step.key) ?? 0;
          let count = 0;
          while (i + count < newSteps.length) {
            const nextStep = newSteps[i + count];
            if (nextStep.key === movedStepKey) break;
            const nextBatchIdx = stepKeyToBatch.get(nextStep.key) ?? 0;
            if (nextBatchIdx !== batchIdx) break;
            count++;
          }
          newBatches.push(count > 0 ? count : 1);
          i += count > 0 ? count : 1;
        }
      }

      return {
        ...prev,
        phases: prev.phases.map(p =>
          p.phaseKey === targetPhaseKey
            ? { ...p, steps: newSteps, batches: newBatches }
            : p
        ),
      };
    });

    setDragSource(null);
    setDropTarget(null);
  };

  // Add phase after another phase - open dialog
  const addPhaseAfter = (afterPhaseKey: string) => {
    setAddPhaseAfterKey(afterPhaseKey);
    setNewPhaseName('');
    setShowAddPhaseDialog(true);
  };

  const confirmAddPhase = () => {
    if (!newPhaseName.trim() || !addPhaseAfterKey) return;
    const key = newPhaseName.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || `phase_${Date.now()}`;

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

  // Edit phase handlers
  const handleEditPhase = (phaseKey: string) => {
    const phase = formData.phases.find(p => p.phaseKey === phaseKey);
    if (phase) {
      setEditingPhaseKey(phaseKey);
      setEditingPhaseName(phase.label);
    }
  };

  const confirmEditPhase = () => {
    if (!editingPhaseKey || !editingPhaseName.trim()) {
      setEditingPhaseKey(null);
      return;
    }
    setFormData(prev => ({
      ...prev,
      phases: prev.phases.map(p =>
        p.phaseKey === editingPhaseKey ? { ...p, label: editingPhaseName.trim() } : p
      ),
    }));
    setEditingPhaseKey(null);
    setEditingPhaseName('');
  };

  const cancelEditPhase = () => {
    setEditingPhaseKey(null);
    setEditingPhaseName('');
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
      <SectionHeader
        icon={<GitBranch className="w-4 h-4 text-cyan-400" />}
        title="流水线模板"
        badge="TEMPLATES"
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" />
            新建模板
          </Button>
        }
      />

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
                      {template.complexity === 'small' ? (
                        <Badge variant="cyan">小需求</Badge>
                      ) : template.complexity === 'large' ? (
                        <Badge variant="purple">完整</Badge>
                      ) : (
                        <Badge variant="primary">标准</Badge>
                      )}
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(template)}
                          aria-label="编辑"
                          title="编辑"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(template.id)}
                          disabled={deletingId === template.id}
                          aria-label="删除"
                          title="删除"
                        >
                          {deletingId === template.id ? (
                            <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </Button>
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
      <Modal
        open={showForm}
        onClose={handleCloseForm}
        size="wide"
        title={editingId ? '编辑流水线模板' : '新建流水线模板'}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={handleCloseForm}>
              取消
            </Button>
            <Button
              type="submit"
              form="pipeline-form"
              disabled={!formData.name.trim() || formData.phases.every(p => p.steps.length === 0) || saving}
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
            </Button>
          </>
        }
      >
        <form id="pipeline-form" onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Basic Info */}
          <div className="space-y-3">
            <div className="flex gap-4">
              <FormField label="模板名称" required className="flex-1">
                <Input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="例如：AI主导研发流程"
                />
              </FormField>
              <FormField label="复杂度" className="w-32">
                <Select
                  value={formData.complexity}
                  onChange={e => setFormData(prev => ({ ...prev, complexity: e.target.value as any }))}
                >
                  {COMPLEXITY_OPTIONS.map(opt => (
                    <option key={opt.key} value={opt.key}>{opt.icon} {opt.label}</option>
                  ))}
                </Select>
              </FormField>
            </div>
            <FormField label="描述">
              <Input
                type="text"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="描述这个流水线的用途..."
              />
            </FormField>
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
            <label className="text-xs text-gray-500 mb-1 block">流水线预览 · 点击阶段修改名称，点击步骤编辑</label>
            <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-4">
              <PipelinePreview
                phases={formData.phases}
                selectedPhase={null}
                selectedStep={selectedStep}
                dragSource={dragSource}
                dropTarget={dropTarget}
                onSelectStep={(pk, si) => { setSelectedStep({ phaseKey: pk, stepIndex: si }); setShowPicker(false); }}
                onRemoveStep={removeStep}
                onAddStepToPhase={(pk) => { setShowPicker(true); setPickerPhase(pk as PhaseKey); setSelectedStep(null); }}
                onEditPhase={handleEditPhase}
                onRemoveCustomPhase={(pk) => setFormData(prev => ({ ...prev, phases: prev.phases.filter(p => p.phaseKey !== pk) }))}
                onDragStart={handleDragStart}
                onDragOverStep={handleDragOverStep}
                onDragOverGap={handleDragOverGap}
                onDragLeave={handleDragLeave}
                onDragEnd={handleDragEnd}
                onDropStep={handleDropStep}
                onDropGap={handleDropGap}
                onAddPhaseAfter={addPhaseAfter}
                onToggleBatchBoundary={toggleBatchBoundary}
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
            <ComponentPickerDrawer
              phaseKey={pickerPhase}
              onSelect={(step) => {
                setFormData(prev => {
                  const existing = prev.phases.find(p => p.phaseKey === pickerPhase);
                  if (existing) {
                    // Add step to end with serial batch
                    const newBatches = [...(existing.batches || existing.steps.map(() => 1)), 1];
                    return {
                      ...prev,
                      phases: prev.phases.map(p =>
                        p.phaseKey === pickerPhase
                          ? { ...p, steps: [...p.steps, step], batches: newBatches }
                          : p
                      ),
                    };
                  }
                  const def = getPhaseDef(pickerPhase as string);
                  return {
                    ...prev,
                    phases: [
                      ...prev.phases,
                      {
                        phaseKey: pickerPhase,
                        label: def?.label || pickerPhase,
                        icon: def?.icon || '📌',
                        steps: [step],
                        batches: [1],
                      },
                    ],
                  };
                });
                setShowPicker(false);
                setPickerPhase(null);
              }}
              onClose={() => { setShowPicker(false); setPickerPhase(null); }}
            />
          )}
        </form>
      </Modal>

      {/* Add Phase Dialog */}
      <Modal
        open={showAddPhaseDialog}
        onClose={() => setShowAddPhaseDialog(false)}
        size="sm"
        title="添加阶段"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAddPhaseDialog(false)}>取消</Button>
            <Button onClick={confirmAddPhase} disabled={!newPhaseName.trim()}>添加</Button>
          </>
        }
      >
        <div className="p-6">
          <Input
            type="text"
            value={newPhaseName}
            onChange={e => setNewPhaseName(e.target.value)}
            placeholder="输入阶段名称"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && confirmAddPhase()}
          />
        </div>
      </Modal>

      {/* Edit Phase Dialog */}
      <Modal
        open={!!editingPhaseKey}
        onClose={cancelEditPhase}
        size="sm"
        title="编辑阶段名称"
        footer={
          <>
            <Button variant="ghost" onClick={cancelEditPhase}>取消</Button>
            <Button onClick={confirmEditPhase} disabled={!editingPhaseName.trim()}>保存</Button>
          </>
        }
      >
        <div className="p-6">
          <Input
            type="text"
            value={editingPhaseName}
            onChange={e => setEditingPhaseName(e.target.value)}
            placeholder="输入阶段名称"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && confirmEditPhase()}
          />
        </div>
      </Modal>
    </div>
  );
}
