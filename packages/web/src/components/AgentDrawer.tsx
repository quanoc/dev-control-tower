import type { Agent } from '@pipeline/shared';
import { X, ChevronDown, ChevronRight, Search, FileText } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { Modal } from './ui/Modal';

interface AgentDrawerProps {
  agent: Agent;
  onClose: () => void;
}

interface SkillContent {
  id: string;
  name: string;
  content: string;
  path: string;
}

export function AgentDrawer({ agent, onClose }: AgentDrawerProps) {
  const [showDisabledSkills, setShowDisabledSkills] = useState(false);
  const [skillsExpanded, setSkillsExpanded] = useState(true);
  const [skillSearch, setSkillSearch] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState<SkillContent | null>(null);
  const [loadingSkill, setLoadingSkill] = useState(false);

  // Fetch skill content when selected
  useEffect(() => {
    if (!selectedSkill) {
      setSkillContent(null);
      return;
    }
    setLoadingSkill(true);
    api.agents.getSkillContent(agent.id, selectedSkill)
      .then(data => setSkillContent(data))
      .catch(() => setSkillContent(null))
      .finally(() => setLoadingSkill(false));
  }, [agent.id, selectedSkill]);

  // Filter skills based on search
  const filteredSkills = useMemo(() => {
    const skills = showDisabledSkills ? agent.skills : agent.skills.filter(s => s.enabled);
    if (!skillSearch.trim()) return skills;
    const search = skillSearch.toLowerCase();
    return skills.filter(s =>
      s.name.toLowerCase().includes(search) ||
      s.id.toLowerCase().includes(search) ||
      s.description?.toLowerCase().includes(search)
    );
  }, [agent.skills, showDisabledSkills, skillSearch]);

  const enabledCount = agent.skills.filter(s => s.enabled).length;
  const totalCount = agent.skills.length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-drawer"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[360px] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 z-modal flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{agent.emoji}</span>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{agent.name}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-500">{agent.role}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-5">
            {/* Source */}
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-2">来源</h4>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${
                agent.source === 'openclaw'
                  ? 'bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20'
                  : agent.source === 'claude'
                  ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                  : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
              }`}>
                {agent.source === 'openclaw' && <span>🦀</span>}
                {agent.source === 'claude' && <span>✨</span>}
                {agent.source === 'custom' && <span>👤</span>}
                {agent.source === 'openclaw' ? 'OpenClaw' : agent.source === 'claude' ? 'Claude' : '自定义'}
              </span>
            </div>

            {/* Skills */}
            {agent.skills && agent.skills.length > 0 && (
              <div>
                <button
                  onClick={() => setSkillsExpanded(!skillsExpanded)}
                  className="flex items-center justify-between w-full mb-2 group"
                >
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                      Skills
                    </h4>
                    <span className="text-xs text-gray-400 dark:text-gray-600">
                      ({enabledCount}/{totalCount} 启用)
                    </span>
                  </div>
                  <span className="text-gray-400 dark:text-gray-600 group-hover:text-gray-600 dark:group-hover:text-gray-400">
                    {skillsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                </button>

                {skillsExpanded && (
                  <>
                    {/* Search input */}
                    {totalCount > 10 && (
                      <div className="relative mb-2">
                        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-600" />
                        <input
                          type="text"
                          value={skillSearch}
                          onChange={e => setSkillSearch(e.target.value)}
                          placeholder="搜索 skills..."
                          className="w-full pl-7 pr-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
                        />
                      </div>
                    )}

                    {/* Toggle disabled skills */}
                    {agent.skills.some(s => !s.enabled) && (
                      <button
                        onClick={() => setShowDisabledSkills(!showDisabledSkills)}
                        className="text-xs text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-400 mb-2"
                      >
                        {showDisabledSkills ? '仅显示已启用' : '显示全部'}
                      </button>
                    )}

                    {/* Skills list */}
                    <div className="flex flex-wrap gap-1.5">
                      {filteredSkills.map(skill => (
                        <button
                          key={skill.id}
                          onClick={() => setSelectedSkill(skill.id)}
                          title={skill.description}
                          className={`
                            inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium cursor-pointer hover:shadow-sm transition-shadow
                            ${skill.enabled
                              ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-200 dark:hover:bg-emerald-500/20'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }
                          `}
                        >
                          <FileText className="w-3 h-3" />
                          {skill.name}
                        </button>
                      ))}
                    </div>

                    {/* Search result count */}
                    {skillSearch.trim() && filteredSkills.length !== (showDisabledSkills ? totalCount : enabledCount) && (
                      <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
                        找到 {filteredSkills.length} 个匹配
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Agent Definitions */}
            <AgentDefinitions agentId={agent.id} />

            {/* Workspace info */}
            {agent.workspace && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-1">工作目录</h4>
                <p className="text-xs text-gray-500 dark:text-gray-500 font-mono truncate">{agent.workspace}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Skill Content Modal */}
      <Modal
        open={selectedSkill !== null}
        onClose={() => setSelectedSkill(null)}
        title={skillContent?.name || selectedSkill || 'Skill'}
        size="lg"
      >
        {loadingSkill ? (
          <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
            <div className="w-4 h-4 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            加载中...
          </div>
        ) : skillContent ? (
          <div className="p-4">
            <div className="mb-3 text-xs text-gray-500 dark:text-gray-500 font-mono">
              {skillContent.path}
            </div>
            <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed bg-gray-50 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto max-h-[50vh] overflow-y-auto">
              {skillContent.content}
            </pre>
          </div>
        ) : (
          <div className="p-4 text-gray-500 text-center">
            无法加载 skill 内容
          </div>
        )}
      </Modal>
    </>
  );
}

interface AgentDefinitionsProps {
  agentId: string;
}

interface DefinitionsData {
  identity?: string;
  agents?: string;
  soul?: string;
  tools?: string;
  bootstrap?: string;
  heartbeat?: string;
  user?: string;
}

const FILE_LABELS: Record<string, string> = {
  identity: '身份定义',
  agents: 'Agent 配置',
  soul: '灵魂配置',
  tools: '工具配置',
  bootstrap: '启动配置',
  heartbeat: '心跳配置',
  user: '用户配置',
};

function AgentDefinitions({ agentId }: AgentDefinitionsProps) {
  const [definitions, setDefinitions] = useState<DefinitionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/agents/${agentId}/definitions`)
      .then(res => res.json())
      .then((data: DefinitionsData) => {
        if (!cancelled) {
          setDefinitions(data);
          // 默认展开第一个
          const firstKey = Object.keys(data)[0];
          if (firstKey) {
            setExpanded({ [firstKey]: true });
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDefinitions(null);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [agentId]);

  if (loading) {
    return (
      <div>
        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-2">Agent 定义</h4>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-600 py-4">
          <div className="w-3 h-3 border border-gray-400 dark:border-gray-600 border-t-transparent rounded-full animate-spin" />
          加载中...
        </div>
      </div>
    );
  }

  if (!definitions || Object.keys(definitions).length === 0) {
    return null;
  }

  return (
    <div>
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-2">Agent 定义</h4>
      <div className="space-y-2">
        {Object.entries(definitions).map(([key, content]) => (
          <div key={key} className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-100/50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
            >
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{FILE_LABELS[key] || key}</span>
              <span className="text-xs text-gray-500 dark:text-gray-500">{expanded[key] ? '▼' : '▶'}</span>
            </button>
            {expanded[key] && (
              <pre className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto p-3 bg-gray-50 dark:bg-gray-900">
                {content}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Legacy component - can be removed
