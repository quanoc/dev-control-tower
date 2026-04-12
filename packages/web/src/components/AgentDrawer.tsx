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
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[360px] bg-gray-900 border-l border-gray-800 z-50 flex flex-col shadow-2xl">
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

            {/* IDENTITY.md content */}
            <IdentityContent agentId={agent.id} />

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

interface IdentityContentProps {
  agentId: string;
}

function IdentityContent({ agentId }: IdentityContentProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/agents/${agentId}/identity`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled) {
          setContent(data.content || '');
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContent(null);
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

  if (!content) {
    return null;
  }

  return (
    <div>
      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Agent 定义</h4>
      <pre className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
        {content}
      </pre>
    </div>
  );
}
