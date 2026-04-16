import { useState, useEffect } from 'react';
import { Plus, Search, Trash2, Edit2, X, Bot, RefreshCw, User, Sparkles, Tag } from 'lucide-react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Input, TextArea, Select, FormField } from './ui/Input';
import { SectionHeader } from './ui/SectionHeader';
import { api } from '../api/client';
import type { Agent } from '@pipeline/shared';

type AgentSource = 'all' | 'openclaw' | 'claude' | 'custom';

interface GroupedAgents {
  openclaw: Agent[];
  openclawCount: number;
  custom: Agent[];
  claude: Agent[];
  claudeCount: number;
}

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

  // Limit agents display in "all" tab
  const OPENCLAW_DISPLAY_LIMIT = 4;
  const CLAUDE_DISPLAY_LIMIT = 4;

  const getDisplayAgents = (): Agent[] | GroupedAgents => {
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
      openclaw: openclaw.slice(0, OPENCLAW_DISPLAY_LIMIT),
      openclawCount: openclaw.length,
      custom,
      claude: claude.slice(0, CLAUDE_DISPLAY_LIMIT),
      claudeCount: claude.length,
    };
  };

  const displayData = getDisplayAgents();
  const isGrouped = !Array.isArray(displayData);

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
      <SectionHeader
        icon={<Bot className="w-4 h-4 text-cyan-400" />}
        title="Agent 管理"
        badge="AGENTS"
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSync}
              disabled={syncing}
              aria-label="同步 Agents"
              title="同步 Agents"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={() => { setEditingId(null); setShowForm(true); }}>
              <Plus className="w-4 h-4" />
              新建 Agent
            </Button>
          </>
        }
      />

      {/* Tabs + Search */}
      <div className="flex items-center justify-between mb-4 border-b border-gray-800">
        <div className="flex items-center gap-1">
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
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="搜索 Agent..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
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
          {isGrouped && displayData.openclaw.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <span className="text-lg">🦀</span>
                OpenClaw Agents ({displayData.openclawCount})
                {displayData.openclawCount > OPENCLAW_DISPLAY_LIMIT && (
                  <span className="text-gray-600 text-xs">(显示 {OPENCLAW_DISPLAY_LIMIT} 个)</span>
                )}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {displayData.openclaw.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onEdit={() => { setEditingId(agent.id); setShowForm(true); }}
                    onDelete={() => handleDelete(agent.id)}
                  />
                ))}
              </div>
              {displayData.openclawCount > OPENCLAW_DISPLAY_LIMIT && (
                <button
                  onClick={() => setActiveTab('openclaw')}
                  className="mt-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  查看更多 OpenClaw Agents (+{displayData.openclawCount - OPENCLAW_DISPLAY_LIMIT})
                </button>
              )}
            </div>
          )}

          {/* Custom Agents */}
          {isGrouped && displayData.custom.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                自定义 Agents ({displayData.custom.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayData.custom.map((agent) => (
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
          {isGrouped && displayData.claude.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Claude Agents ({displayData.claudeCount})
                {displayData.claudeCount > CLAUDE_DISPLAY_LIMIT && (
                  <span className="text-gray-600 text-xs">(显示 {CLAUDE_DISPLAY_LIMIT} 个)</span>
                )}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {displayData.claude.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onEdit={() => { setEditingId(agent.id); setShowForm(true); }}
                    onDelete={() => handleDelete(agent.id)}
                  />
                ))}
              </div>
              {displayData.claudeCount > CLAUDE_DISPLAY_LIMIT && (
                <button
                  onClick={() => setActiveTab('claude')}
                  className="mt-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  查看更多 Claude Agents (+{displayData.claudeCount - CLAUDE_DISPLAY_LIMIT})
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Other tabs: Show filtered agents directly */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(displayData as Agent[]).map((agent) => (
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
      <AgentFormModal
        agent={editingId ? (agents.find(a => a.id === editingId) ?? null) : null}
        open={showForm}
        onClose={() => { setShowForm(false); setEditingId(null); }}
        onSuccess={() => { setShowForm(false); setEditingId(null); loadAgents(); }}
      />
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
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-lg">{agent.emoji || '🤖'}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-200 leading-tight">{agent.name}</div>
            <div className="flex items-center gap-2 overflow-hidden mt-0.5">
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
        <p className="text-xs text-gray-500 mb-2 line-clamp-2 leading-relaxed">{agent.description}</p>
      )}

      {agent.source === 'custom' && agent.model && (
        <div className="text-xs text-gray-600 mb-2">
          模型: <span className="text-gray-400">{agent.model}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Edit2 className="w-3 h-3" />
          编辑
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
          <Trash2 className="w-3 h-3" />
          删除
        </Button>
      </div>
    </div>
  );
}

// Form Modal for creating/editing custom agents
function AgentFormModal({ agent, open, onClose, onSuccess }: {
  agent: Agent | null;
  open: boolean;
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
        await api.agents.create(data as Partial<Agent> & { name: string; role: string; });
      }
      onSuccess();
    } catch (err) {
      console.error('Failed to save agent:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={agent ? '编辑 Agent' : '新建自定义 Agent'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button type="submit" form="agent-form" disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </>
      }
    >
      <form id="agent-form" onSubmit={handleSubmit} className="p-6 space-y-4">
        <FormField label="名称" required>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="例如: 我的产品经理"
          />
        </FormField>

        <FormField label="角色" required>
          <Input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
            placeholder="例如: PM"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="图标 Emoji">
            <Input
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🤖"
            />
          </FormField>
          <FormField label="显示图标">
            <Input
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="可选"
            />
          </FormField>
        </div>

        <FormField label="描述">
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="描述这个 Agent 的用途..."
          />
        </FormField>

        {/* Tags selection */}
        <FormField label="标签">
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
        </FormField>

        <FormField label="模型">
          <Select
            value={model}
            onChange={(e) => setModel(e.target.value as 'sonnet' | 'opus' | 'haiku')}
          >
            <option value="sonnet">Sonnet (推荐)</option>
            <option value="opus">Opus (最强)</option>
            <option value="haiku">Haiku (最快)</option>
          </Select>
        </FormField>

        <FormField label="System Prompt">
          <TextArea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4}
            placeholder="定义 Agent 的行为和能力..."
          />
        </FormField>
      </form>
    </Modal>
  );
}
