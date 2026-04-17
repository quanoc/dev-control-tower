import { ReactNode } from 'react';

interface SectionHeaderProps {
  icon: ReactNode;
  title: string;
  badge: string;
  info?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({ icon, title, badge, info, actions, className = '' }: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-3">
        <div className="w-4 h-4 flex items-center justify-center">{icon}</div>
        <h2 className="text-lg font-semibold text-gray-100 min-w-[90px]">{title}</h2>
        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded">
          {badge}
        </span>
        {info}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
