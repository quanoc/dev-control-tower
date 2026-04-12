import type { Agent } from '@pipeline/shared';

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

function sortByPipeline(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => {
    const ai = PIPELINE_ORDER.indexOf(a.id);
    const bi = PIPELINE_ORDER.indexOf(b.id);
    return ai - bi;
  });
}

export function AgentBar({ agents, selectedId, onSelect }: AgentBarProps) {
  const sorted = sortByPipeline(agents);

  return (
    <div className="flex items-stretch gap-2 px-6 py-2 overflow-x-auto">
      {sorted.map(agent => {
        const isSelected = selectedId === agent.id;
        const roleLabel = ROLE_LABELS[agent.id] || agent.role;
        const roleType = ROLE_TYPE[agent.id] || '';
        const statusLabel = STATUS_LABELS[agent.status] || '待命';
        const statusColor = STATUS_COLORS[agent.status] || 'text-gray-600';

        return (
          <button
            key={agent.id}
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
            <span className="text-lg flex-shrink-0">{agent.emoji}</span>

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
      })}
    </div>
  );
}
