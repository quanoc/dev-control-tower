import { useEffect, useMemo, useRef, useState } from 'react';
import type { Agent } from '@pipeline/shared';
import { ChevronDown } from 'lucide-react';

interface AgentBarProps {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

// Pipeline order: 小徐(PM) → 张架(架构) → 码哥(开发) → 小质(测试) → 小文(文档) → 小云(运维)
const PIPELINE_ORDER = [
  'xiaoxi-pm',
  'zhangjia-arch',
  'magerd',
  'xiaozhi-test',
  'xiaowen-docs',
  'xiaoyun-ops',
];

const CLAUDE_SHOWN_LIMIT = 2;

const ROLE_LABELS: Record<string, string> = {
  'xiaoxi-pm':      '需求评审',
  'zhangjia-arch':  '架构设计',
  'magerd':         '代码开发',
  'xiaozhi-test':   '测试验证',
  'xiaowen-docs':   '文档输出',
  'xiaoyun-ops':    '部署运维',
};

const ROLE_TYPE: Record<string, string> = {
  'xiaoxi-pm':      'PM',
  'zhangjia-arch':  'AR',
  'magerd':         'RD',
  'xiaozhi-test':   'QA',
  'xiaowen-docs':   'TW',
  'xiaoyun-ops':    'OP',
};

const STATUS_LABELS: Record<string, string> = {
  idle:    '待命',
  busy:    '工作中',
  error:   '异常',
  offline: '离线',
};

const STATUS_COLORS: Record<string, string> = {
  idle:    'text-emerald-500',
  busy:    'text-amber-500',
  error:   'text-red-500',
  offline: 'text-gray-600',
};

interface GroupedAgents {
  openclaw: Agent[];
  claude: Agent[];
  others: Agent[];
}

function groupAgents(agents: Agent[]): GroupedAgents {
  const result: GroupedAgents = { openclaw: [], claude: [], others: [] };

  for (const agent of agents) {
    if (agent.source === 'openclaw') {
      result.openclaw.push(agent);
    } else if (agent.source === 'claude') {
      result.claude.push(agent);
    } else {
      result.others.push(agent);
    }
  }

  // Sort OpenClaw by pipeline order
  result.openclaw.sort((a, b) => {
    const ai = PIPELINE_ORDER.indexOf(a.id);
    const bi = PIPELINE_ORDER.indexOf(b.id);
    // Put ordered ones first, then unordered ones
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return 0;
  });

  return result;
}

interface AgentButtonProps {
  agent: Agent;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function AgentButton({ agent, selectedId, onSelect }: AgentButtonProps) {
  const isSelected = selectedId === agent.id;
  const roleLabel = ROLE_LABELS[agent.id] || agent.role;
  const roleType = ROLE_TYPE[agent.id] || '';
  const statusLabel = STATUS_LABELS[agent.status] || '待命';
  const statusColor = STATUS_COLORS[agent.status] || 'text-gray-600';

  return (
    <button
      onClick={() => onSelect(isSelected ? null : agent.id)}
      className={`
        flex items-center gap-3 px-4 py-1.5 rounded-lg
        border transition-all duration-150 cursor-pointer flex-shrink-0
        ${isSelected
          ? 'border-blue-500/50 bg-blue-500/10'
          : 'border-gray-800 hover:border-gray-700 hover:bg-gray-900/50'
        }
      `}
    >
      {/* Left: emoji */}
      <span className="text-lg flex-shrink-0">{agent.emoji || '🤖'}</span>

      {/* Right: two rows */}
      <div className="flex flex-col items-start">
        {/* Row 1: name + role type */}
        <div className="flex items-baseline gap-1">
          <span className={`text-sm font-medium leading-none ${isSelected ? 'text-blue-300' : 'text-gray-200'}`}>
            {agent.name}
          </span>
          {roleType && (
            <span className={`text-[10px] font-mono leading-none ${isSelected ? 'text-blue-400' : 'text-gray-500'}`}>
              {roleType}
            </span>
          )}
        </div>
        {/* Row 2: role label + status */}
        <span className="text-[11px] text-gray-500 leading-none flex items-center gap-1.5 mt-1">
          <span>{roleLabel}</span>
          <span className="text-gray-700">·</span>
          <span className={statusColor}>{statusLabel}</span>
        </span>
      </div>
    </button>
  );
}

export function AgentBar({ agents, selectedId, onSelect }: AgentBarProps) {
  const [showAllClaude, setShowAllClaude] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [layoutMode, setLayoutMode] = useState<'one-row' | 'two-rows' | 'scroll'>('one-row');

  const grouped = useMemo(() => groupAgents(agents), [agents]);

  const visibleClaude = showAllClaude
    ? grouped.claude
    : grouped.claude.slice(0, CLAUDE_SHOWN_LIMIT);
  const hiddenClaudeCount = grouped.claude.length - CLAUDE_SHOWN_LIMIT;

  // Combine: OpenClaw + visible Claude + others
  const displayAgents = [...grouped.openclaw, ...visibleClaude, ...grouped.others];

  // 计算布局模式
  useEffect(() => {
    const container = containerRef.current;
    const measureEl = measureRef.current;
    if (!container || !measureEl) return;

    const checkLayout = () => {
      const containerWidth = container.clientWidth;
      const oneRowWidth = measureEl.scrollWidth;

      if (oneRowWidth <= containerWidth) {
        setLayoutMode('one-row');
      } else if (oneRowWidth <= containerWidth * 2) {
        setLayoutMode('two-rows');
      } else {
        setLayoutMode('scroll');
      }
    };

    checkLayout();

    const resizeObserver = new ResizeObserver(checkLayout);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [displayAgents.length]);

  return (
    <>
      {/* 隐藏的测量层 */}
      <div
        ref={measureRef}
        className="fixed -left-[9999px] flex gap-2 px-6"
        aria-hidden="true"
      >
        {displayAgents.map(agent => (
          <AgentButton
            key={agent.id}
            agent={agent}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>

      {/* 实际显示层 */}
      <div
        ref={containerRef}
        className={`
          flex items-stretch gap-2 px-6 py-2
          ${layoutMode === 'one-row' ? 'flex-nowrap overflow-x-auto' : ''}
          ${layoutMode === 'two-rows' ? 'flex-wrap' : ''}
          ${layoutMode === 'scroll' ? 'flex-wrap max-h-[88px] overflow-x-auto overflow-y-hidden' : ''}
        `}
      >
        {displayAgents.map(agent => (
          <AgentButton
            key={agent.id}
            agent={agent}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}

        {/* Claude agents overflow indicator */}
        {hiddenClaudeCount > 0 && !showAllClaude && (
          <button
            onClick={() => setShowAllClaude(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-800 hover:border-gray-700 hover:bg-gray-900/50 transition-all duration-150 cursor-pointer flex-shrink-0 text-gray-400 text-sm"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            +{hiddenClaudeCount}
          </button>
        )}
      </div>
    </>
  );
}
