import type { Agent } from '@pipeline/shared';
import { X } from 'lucide-react';
import { useState, useEffect } from 'react';

interface AgentDrawerProps {
  agent: Agent;
  onClose: () => void;
}

export function AgentDrawer({ agent, onClose }: AgentDrawerProps) {
  const [showDisabledSkills, setShowDisabledSkills] = useState(false);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-drawer"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[360px] bg-gray-900 border-l border-gray-800 z-modal flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{agent.emoji}</span>
            <div>
              <h3 className="text-sm font-semibold text-gray-100">{agent.name}</h3>
              <p className="text-xs text-gray-500">{agent.role}</p>
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
            {/* Source */}
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">来源</h4>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${
                agent.source === 'openclaw'
                  ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                  : agent.source === 'claude'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
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
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Skills</h4>
                  {agent.skills.some(s => !s.enabled) && (
                    <button
                      onClick={() => setShowDisabledSkills(!showDisabledSkills)}
                      className="text-xs text-gray-500 hover:text-gray-400"
                    >
                      {showDisabledSkills ? '隐藏未启用' : '显示未启用'}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(showDisabledSkills ? agent.skills : agent.skills.filter(s => s.enabled)).map(skill => (
                    <span
                      key={skill.id}
                      className={`
                        inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
                        ${skill.enabled
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-gray-800 text-gray-500 border border-gray-700'
                        }
                      `}
                    >
                      {skill.enabled ? '✓' : '✗'} {skill.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Agent Definitions */}
            <AgentDefinitions agentId={agent.id} />

            {/* Workspace info */}
            {agent.workspace && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">工作目录</h4>
                <p className="text-xs text-gray-500 font-mono truncate">{agent.workspace}</p>
              </div>
            )}
          </div>
        </div>
      </div>
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
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Agent 定义</h4>
        <div className="flex items-center gap-2 text-xs text-gray-600 py-4">
          <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" />
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
      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Agent 定义</h4>
      <div className="space-y-2">
        {Object.entries(definitions).map(([key, content]) => (
          <div key={key} className="border border-gray-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 hover:bg-gray-800 text-left"
            >
              <span className="text-xs font-medium text-gray-300">{FILE_LABELS[key] || key}</span>
              <span className="text-xs text-gray-500">{expanded[key] ? '▼' : '▶'}</span>
            </button>
            {expanded[key] && (
              <pre className="text-xs text-gray-400 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto p-3 bg-gray-900">
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
