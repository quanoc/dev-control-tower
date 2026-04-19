import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Input, TextArea, FormField } from './ui/Input';
import { useTaskStore } from '../store/tasks';
import type { PipelineTemplate } from '@pipeline/shared';

interface NewTaskDialogProps {
  templates: PipelineTemplate[];
  onClose: () => void;
  onSuccess: () => void;
}

export function NewTaskDialog({ templates, onClose, onSuccess }: NewTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<number | undefined>(
    templates.length > 0 ? templates[0].id : undefined
  );
  const [saving, setSaving] = useState(false);
  const createTask = useTaskStore(s => s.createTask);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;

    setSaving(true);
    try {
      await createTask(title.trim(), description.trim(), selectedTemplate);
      onSuccess();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="新建需求"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form="new-task-form" disabled={!title.trim() || saving}>
            <Plus className="w-4 h-4" />
            {saving ? '创建中...' : '创建需求'}
          </Button>
        </>
      }
    >
      <form id="new-task-form" onSubmit={handleSubmit} className="p-6 space-y-5">
        <FormField label="需求标题" required>
          <Input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="例如：电商后台用户管理模块"
            autoFocus
          />
        </FormField>

        <FormField label="需求描述">
          <TextArea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="描述需求的详细内容和背景..."
            rows={4}
          />
        </FormField>

        {templates.length > 0 && (
          <FormField label="流水线模板">
            <div className="space-y-2">
              {templates.map(template => (
                <label
                  key={template.id}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                    ${selectedTemplate === template.id
                      ? 'border-blue-500 bg-blue-500/10 dark:bg-blue-500/10'
                      : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="template"
                    checked={selectedTemplate === template.id}
                    onChange={() => setSelectedTemplate(template.id)}
                    className="sr-only"
                  />
                  <div className={`
                    w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0
                    ${selectedTemplate === template.id
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-400 dark:border-gray-600'
                    }
                  `}>
                    {selectedTemplate === template.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{template.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-500">{template.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </FormField>
        )}
      </form>
    </Modal>
  );
}
