import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Trash2, Edit2, X, Grid, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api/client';

interface Component {
  id: number;
  name: string;
  description: string | null;
  actor_type: string;
  action: string;
  agent_id: string | null;
  human_role: string | null;
  icon: string | null;
  execution: string;
  optional: number;
}

const ACTOR_TABS = [
  { key: 'all', label: '全部' },
  { key: 'agent', label: 'Agent' },
  { key: 'human', label: '人工' },
  { key: 'system', label: '系统' },
];

const AGENT_ACTIONS = [
  { key: 'analyze', label: '需求分析', icon: '📊' },
  { key: 'design', label: '架构设计', icon: '🏗️' },
  { key: 'code', label: '代码开发', icon: '💻' },
  { key: 'review', label: '代码评审', icon: '👀' },
  { key: 'test', label: '测试验证', icon: '🧪' },
  { key: 'document', label: '文档输出', icon: '📚' },
  { key: 'deploy', label: '部署上线', icon: '🚀' },
];

const HUMAN_ACTIONS = [
  { key: 'approve', label: '审批', icon: '✅' },
  { key: 'review', label: '评审', icon: '👤' },
];

const SYSTEM_ACTIONS = [
  { key: 'lint', label: '代码检查', icon: '🔍' },
  { key: 'build', label: '构建编译', icon: '⚙️' },
  { key: 'security_scan', label: '安全扫描', icon: '🔒' },
  { key: 'test_e2e', label: 'E2E测试', icon: '🖥️' },
];

function getActionsByType(actorType: string) {
  switch (actorType) {
    case 'agent': return AGENT_ACTIONS;
    case 'human': return HUMAN_ACTIONS;
    case 'system': return SYSTEM_ACTIONS;
    default: return [];
  }
}

function getActorBadge(actorType: string) {
  switch (actorType) {
    case 'agent': return { bg: 'bg-emerald-500/20', text: 'text-emerald-400' };
    case 'human': return { bg: 'bg-amber-500/20', text: 'text-amber-400' };
    case 'system': return { bg: 'bg-blue-500/20', text: 'text-blue-400' };
    default: return { bg: 'bg-gray-500/20', text: 'text-gray-400' };
  }
}

const ACTOR_SHORT: Record<string, string> = { agent: 'Agent', human: '人工', system: '系统' };

interface ComponentLibraryProps {
  onBack?: () => void;
}

export function ComponentLibrary({ onBack }: ComponentLibraryProps) {
  const [components, setComponents] = useState<Component[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    actor_type: 'agent',
    action: 'code',
    agent_id: '',
    human_role: '',
    execution: 'serial',
    optional: false,
  });

  const limit = 12;

  const loadComponents = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.pipelines.listComponents({
        actorType: activeTab === 'all' ? undefined : activeTab,
        search: search || undefined,
        page,
        limit,
      });
      setComponents(result.items);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to load components:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, page]);

  useEffect(() => {
    loadComponents();
  }, [loadComponents]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || saving) return;
    setSaving(true);
    try {
      if (editingId) {
        await api.pipelines.updateComponent(editingId, formData);
      } else {
        await api.pipelines.createComponent(formData);
      }
      setShowForm(false);
      setEditingId(null);
      loadComponents();
    } catch (err) {
      console.error('Failed to save component:', err);
      alert('保存失败: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (comp: Component) => {
    setFormData({
      name: comp.name,
      description: comp.description || '',
      actor_type: comp.actor_type,
      action: comp.action,
      agent_id: comp.agent_id || '',
      human_role: comp.human_role || '',
      execution: comp.execution,
      optional: comp.optional === 1,
    });
    setEditingId(comp.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个组件吗？')) return;
    try {
      await api.pipelines.deleteComponent(id);
      loadComponents();
    } catch (err) {
      console.error('Failed to delete component:', err);
      alert('删除失败: ' + (err as Error).message);
    }
  };

  const openNewForm = () => {
    setFormData({
      name: '',
      description: '',
      actor_type: 'agent',
      action: 'code',
      agent_id: '',
      human_role: '',
      execution: 'serial',
      optional: false,
    });
    setEditingId(null);
    setShowForm(true);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              ← 返回
            </button>
          )}
          <h2 className="text-lg font-semibold text-gray-200">流水线组件库</h2>
        </div>
        <button
          onClick={openNewForm}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>新建组件</span>
        </button>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center justify-between mb-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {ACTOR_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
                activeTab === tab.key
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="搜索组件名称..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-64 pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Component Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : components.length === 0 ? (
        <div className="text-center py-16 bg-gray-900/50 rounded-xl border border-gray-800">
          <Grid className="w-8 h-8 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">暂无组件</p>
          <p className="text-xs text-gray-600 mt-1">点击"新建组件"创建第一个组件</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            {components.map(comp => {
              const actions = getActionsByType(comp.actor_type);
              const actionDef = actions.find(a => a.key === comp.action);
              const actorBadge = getActorBadge(comp.actor_type);

              return (
                <div
                  key={comp.id}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{actionDef?.icon || '⚙️'}</span>
                      <div>
                        <h3 className="text-sm font-medium text-gray-200">{comp.name}</h3>
                        <p className="text-xs text-gray-500">{actionDef?.label}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(comp)}
                        className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded-lg transition-colors"
                        title="编辑"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(comp.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {comp.description && (
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">{comp.description}</p>
                  )}

                  <div className="flex items-center gap-2 mt-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] ${actorBadge.bg} ${actorBadge.text}`}>
                      {ACTOR_SHORT[comp.actor_type]}
                    </span>
                    {comp.execution === 'parallel' && (
                      <span className="text-[10px] text-cyan-400">⚡ 并行</span>
                    )}
                    {comp.optional === 1 && (
                      <span className="text-[10px] text-gray-600">可选</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 text-gray-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-400">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 text-gray-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Form Modal */}
      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowForm(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800 border border-gray-700 rounded-xl p-5 z-[60] w-[480px] shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-medium text-gray-200">
                {editingId ? '编辑组件' : '新建组件'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 text-gray-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">组件名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="例如：代码开发"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">描述</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
                  rows={2}
                  placeholder="组件功能描述..."
                />
              </div>

              {/* Actor Type */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">类型 *</label>
                <div className="flex gap-2">
                  {ACTOR_TABS.slice(1).map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, actor_type: tab.key, action: tab.key === 'agent' ? 'code' : tab.key === 'human' ? 'approve' : 'lint' });
                      }}
                      className={`flex-1 py-2 rounded-lg border text-sm transition-colors ${
                        formData.actor_type === tab.key
                          ? 'border-blue-500 bg-blue-500/10 text-white'
                          : 'border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">动作 *</label>
                <select
                  value={formData.action}
                  onChange={e => setFormData({ ...formData, action: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {getActionsByType(formData.actor_type).map(action => (
                    <option key={action.key} value={action.key}>
                      {action.icon} {action.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Agent ID / Human Role */}
              {formData.actor_type === 'agent' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Agent ID</label>
                  <input
                    type="text"
                    value={formData.agent_id}
                    onChange={e => setFormData({ ...formData, agent_id: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="例如：magerd"
                  />
                </div>
              )}

              {formData.actor_type === 'human' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">人工角色</label>
                  <input
                    type="text"
                    value={formData.human_role}
                    onChange={e => setFormData({ ...formData, human_role: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="例如：senior_dev, product_owner"
                  />
                </div>
              )}

              {/* Execution Mode */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">执行模式</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, execution: 'serial' })}
                    className={`flex-1 py-2 rounded-lg border text-sm transition-colors ${
                      formData.execution === 'serial'
                        ? 'border-blue-500 bg-blue-500/10 text-white'
                        : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    串行
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, execution: 'parallel' })}
                    className={`flex-1 py-2 rounded-lg border text-sm transition-colors ${
                      formData.execution === 'parallel'
                        ? 'border-blue-500 bg-blue-500/10 text-white'
                        : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    并行 ⚡
                  </button>
                </div>
              </div>

              {/* Optional */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="optional"
                  checked={formData.optional}
                  onChange={e => setFormData({ ...formData, optional: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="optional" className="text-sm text-gray-400">可选步骤</label>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!formData.name.trim() || saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}