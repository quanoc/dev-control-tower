import type { Agent } from '@pipeline/shared';
import { X, Send } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from './StatusBadge';
import { api } from '../api/client';

interface AgentDetailProps {
  agent: Agent;
  onClose: () => void;
}

export function AgentDetail({ agent, onClose }: AgentDetailProps) {
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const handleSend = async () => {
    if (!command.trim() || sending) return;
    setSending(true);
    setResponse(null);
    try {
      const result = await api.agents.sendCommand(agent.id, command);
      setResponse(result.output || result.text || JSON.stringify(result));
    } catch (err: any) {
      setResponse(`Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-6 mb-4 border border-gray-800 bg-gray-900/80 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{agent.emoji}</span>
          <div>
            <h3 className="text-lg font-semibold text-gray-100">{agent.name}</h3>
            <p className="text-sm text-gray-500">{agent.role}</p>
          </div>
          <StatusBadge status={agent.status} size="md" />
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* Description */}
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-1">能力特点</h4>
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">{agent.description}</pre>
        </div>

        {/* Skills */}
        {agent.skills.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Skills</h4>
            <div className="flex flex-wrap gap-2">
              {agent.skills.map(skill => (
                <span
                  key={skill.id}
                  className={`
                    inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
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

        {/* Current task */}
        {agent.currentTaskId && (
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-1">当前任务</h4>
            <p className="text-sm text-amber-400">正在处理任务 #{agent.currentTaskId}</p>
          </div>
        )}

        {/* Command input */}
        <div>
          <h4 className="text-sm font-medium text-gray-400 mb-2">发送指令</h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={command}
              onChange={e => setCommand(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="输入指令..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSend}
              disabled={sending || !command.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              发送
            </button>
          </div>
          {response && (
            <div className="mt-3 p-3 bg-gray-800 rounded-lg text-sm text-gray-300 max-h-48 overflow-y-auto whitespace-pre-wrap">
              {response}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
