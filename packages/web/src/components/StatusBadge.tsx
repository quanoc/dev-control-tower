import type { AgentStatus } from '@pipeline/shared';

const STATUS_CONFIG: Record<AgentStatus, { color: string; label: string }> = {
  idle:    { color: 'bg-emerald-400', label: '空闲' },
  busy:    { color: 'bg-amber-400', label: '忙碌' },
  error:   { color: 'bg-red-400',     label: '错误' },
  offline: { color: 'bg-gray-500',    label: '离线' },
};

interface StatusBadgeProps {
  status: AgentStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span className={`inline-flex items-center gap-1.5 ${textSize}`}>
      <span className="relative">
        <span className={`${dotSize} rounded-full ${config.color}`} />
        {status === 'busy' && (
          <span className={`absolute inset-0 rounded-full ${config.color} animate-ping opacity-75`} />
        )}
      </span>
      <span className="text-gray-400">{config.label}</span>
    </span>
  );
}
