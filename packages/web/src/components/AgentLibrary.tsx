import { useState, useEffect } from 'react';
import { Plus, Search, Trash2, Edit2, X, Bot, RefreshCw, User, Sparkles, Tag } from 'lucide-react';
import { api } from '../api/client';
import type { Agent } from '@pipeline/shared';

type AgentSource = 'all' | 'openclaw' | 'claude' | 'custom';

// 预定义的标签列表
const PREDEFINED_TAGS = ['需求', '设计', '开发', '测试', '文档', '部署'];

const SOURCE_TABS: { key: AgentSource; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: '全部', icon: <Bot className="w-4 h-4" /> },
  { key: 'openclaw', label: 'OpenClaw', icon: <span className="text-lg">🦀</span> },
  { key: 'claude', label: 'Claude', icon: <Sparkles className="w-4 h-4 text-amber-400" /> },
  { key: 'custom', label: '自定义', icon: <User className="w-4 h-4 text-emerald-400" /> },
];

function getSourceBadge(source: string) {
  switch (source) {
    case 'openclaw': return { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'OpenClaw' };
    case 'claude': return { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Claude' };
    case 'custom': return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: '自定义' };
    default: return { bg: 'bg-gray-500/20', text: 'text-gray-400', label: source };
  }
}

export function AgentLibrary() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<AgentSource>('all');
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Single load from database - data is already unified
  const loadAgents = async () => {
    setLoading(true);
    try {
      const data = await api.agents.list();
      setAgents(data);
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.agents.sync();
      await loadAgents();
    } catch (err) {
      console.error('Failed to sync agents:', err);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  // Toggle tag selection
  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Filter and sort agents: OpenClaw first, then Claude (limited), then Custom
  const filteredAgents = agents
    .filter(a => {
      const matchesTab = activeTab === 'all' || a.source === activeTab;
      const matchesSearch = !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.role.toLowerCase().includes(search.toLowerCase()) ||
        a.description?.toLowerCase().includes(search.toLowerCase());
      // Tag filter: match any selected tag
      const matchesTags = selectedTags.length === 0 ||
        selectedTags.some(tag => a.tags?.includes(tag));
      return matchesTab && matchesSearch && matchesTags;
    })
    .sort((a, b) => {
      // OpenClaw first
      if (a.source === 'openclaw' && b.source !== 'openclaw') return -1;
      if (a.source !== 'openclaw' && b.source === 'openclaw') return 1;
      // Custom second
      if (a.source === 'custom' && b.source === 'claude') return -1;
      if (a.source === 'claude' && b.source === 'custom') return 1;
      return 0;
    });

  // Limit Claude agents display (show only 2 in "all" tab)
  const OPENCLAW_PRIORITY_COUNT = 6; // Show all OpenClaw
  const CLAUDE_DISPLAY_LIMIT = 2;    // Show only 2 Claude agents

  const getDisplayAgents = () => {
    if (activeTab === 'openclaw') {
      return filteredAgents.filter(a => a.source === 'openclaw');
    }
    if (activeTab === 'claude') {
      return filteredAgents.filter(a => a.source === 'claude');
    }
    if (activeTab === 'custom') {
      return filteredAgents.filter(a => a.source === 'custom');
    }
    // "all" tab: split into visible and hidden
    const openclaw = filteredAgents.filter(a => a.source === 'openclaw');
    const custom = filteredAgents.filter(a => a.source === 'custom');
    const claude = filteredAgents.filter(a => a.source === 'claude');

    return {
      openclaw,
      custom,
      claude: claude.slice(0, CLAUDE_DISPLAY_LIMIT),
      claudeCount: claude.length,
    };
  };

  const displayData = getDisplayAgents();

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个自定义 Agent 吗？')) return;
    try {
      await api.agents.delete(id);
      loadAgents();
    } catch (err) {
      console.error('Failed to delete agent:', err);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Agent 管理</h2>
          <p className="text-sm text-gray-500 mt-1">管理 OpenClaw、Claude 和自定义 Agents</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            title="同步 Agents"
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setEditingId(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建 Agent
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-800">
        {SOURCE_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="搜索 Agent..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Tag Filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Tag className="w-4 h-4 text-gray-500" />
        <span className="text-xs text-gray-500">筛选:</span>
        {PREDEFINED_TAGS.map(tag => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            className={`px-2 py-1 text-xs rounded-full transition-colors ${
              selectedTags.includes(tag)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {tag}
          </button>
        ))}
        {selectedTags.length > 0 && (
          <button
            onClick={() => setSelectedTags([])}
            className="text-xs text-gray-500 hover:text-gray-300 ml-2"
          >
            清除
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-5 h-5 text-gray-600 animate-spin" />
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="text-center py-12">
          <Bot className="w-8 h-8 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">暂无 Agent</p>
        </div>
      ) : activeTab === 'all' ? (
        /* All tab: Show grouped agents */
        <div className="space-y-6">
          {/* OpenClaw Agents - Priority */}
          {Array.isArray(displayData) === false && (displayData as any).openclaw.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="text-lg">🦀</span>
                OpenClaw Agents ({(displayData as any).openclaw.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {(displayData as any).openclaw.map((agent: Agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onEdit={() => { setEditingId(agent.id); setShowForm(true); }}
                    onDelete={() => handleDelete(agent.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Custom Agents */}
          {Array.isArray(displayData) === false && (displayData as any).custom.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                自定义 Agents ({(displayData as any).custom.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(displayData as any).custom.map((agent: Agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onEdit={() => { setEditingId(agent.id); setShowForm(true); }}
                    onDelete={() => handleDelete(agent.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Claude Agents - Limited */}
          {Array.isArray(displayData) === false && (displayData as any).claude.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Claude Agents ({(displayData as any).claudeCount})
                {(displayData as any).claudeCount > CLAUDE_DISPLAY_LIMIT && (
                  <span className="text-gray-600 text-xs">(显示 {CLAUDE_DISPLAY_LIMIT} 个)</span>
                )}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {(displayData as any).claude.map((agent: Agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onEdit={() => { setEditingId(agent.id); setShowForm(true); }}
                    onDelete={() => handleDelete(agent.id)}
                  />
                ))}
              </div>
              {(displayData as any).claudeCount > CLAUDE_DISPLAY_LIMIT && (
                <button
                  onClick={() => setActiveTab('claude')}
                  className="mt-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  查看更多 Claude Agents (+{(displayData as any).claudeCount - CLAUDE_DISPLAY_LIMIT})
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Other tabs: Show filtered agents directly */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onEdit={() => { setEditingId(agent.id); setShowForm(true); }}
              onDelete={() => handleDelete(agent.id)}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <AgentFormModal
          agent={editingId ? (agents.find(a => a.id === editingId) ?? null) : null}
          onClose={() => { setShowForm(false); setEditingId(null); }}
          onSuccess={() => { setShowForm(false); setEditingId(null); loadAgents(); }}
        />
      )}
    </div>
  );
}

// Agent Card for custom agents
function AgentCard({ agent, onEdit, onDelete }: {
  agent: Agent;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const badge = getSourceBadge(agent.source || 'openclaw');

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xl">{agent.emoji || '🤖'}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-200">{agent.name}</div>
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-xs text-gray-500 shrink-0">{agent.role}</span>
              {agent.tags && agent.tags.length > 0 && (
                <div className="flex items-center gap-1 overflow-hidden">
                  {agent.tags.map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-gray-800 text-gray-400 rounded truncate">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded ${badge.bg} ${badge.text} shrink-0`}>
          {badge.label}
        </span>
      </div>

      {agent.description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{agent.description}</p>
      )}

      {agent.source === 'custom' && agent.model && (
        <div className="text-xs text-gray-600 mb-3">
          模型: <span className="text-gray-400">{agent.model}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onEdit}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
        >
          <Edit2 className="w-3 h-3" />
          编辑
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          删除
        </button>
      </div>
    </div>
  );
}

// Claude Agent Card (read-only)
function ClaudeAgentCard({ agent }: { agent: any }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 hover:border-amber-500/30 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-medium text-gray-300">{agent.id}</span>
      </div>
      {agent.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{agent.description}</p>
      )}
    </div>
  );
}

// OpenClaw Agent Card (read-only)
function OpenClawAgentCard({ agent }: { agent: any }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 hover:border-orange-500/30 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🦀</span>
        <span className="text-sm font-medium text-gray-300">{agent.id || agent.name}</span>
      </div>
      {agent.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{agent.description}</p>
      )}
    </div>
  );
}

// Form Modal for creating/editing custom agents
function AgentFormModal({ agent, onClose, onSuccess }: {
  agent: Agent | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(agent?.name || '');
  const [role, setRole] = useState(agent?.role || '');
  const [emoji, setEmoji] = useState(agent?.emoji || '🤖');
  const [description, setDescription] = useState(agent?.description || '');
  const [model, setModel] = useState<'sonnet' | 'opus' | 'haiku'>(agent?.model || 'sonnet');
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt || '');
  const [icon, setIcon] = useState(agent?.icon || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(agent?.tags || []);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = { name, role, emoji, description, model, systemPrompt, icon, tags: selectedTags };
      if (agent) {
        await api.agents.update(agent.id, data);
      } else {
        await api.agents.create(data as any);
      }
      onSuccess();
    } catch (err) {
      console.error('Failed to save agent:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto bg-gray-900 border border-gray-800 rounded-xl z-[70] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 className="text-base font-semibold text-gray-100">
            {agent ? '编辑 Agent' : '新建自定义 Agent'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              placeholder="例如: 我的产品经理"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">角色 *</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              placeholder="例如: PM"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">图标 Emoji</label>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                placeholder="🤖"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">显示图标</label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                placeholder="可选"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              placeholder="描述这个 Agent 的用途..."
            />
          </div>

          {/* Tags selection */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">标签</label>
            <div className="flex flex-wrap gap-2">
              {PREDEFINED_TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setSelectedTags(prev =>
                      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                    );
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">模型</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as any)}
              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="sonnet">Sonnet (推荐)</option>
              <option value="opus">Opus (最强)</option>
              <option value="haiku">Haiku (最快)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500"
              placeholder="定义 Agent 的行为和能力..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-lg text-sm font-medium text-white transition-colors"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}