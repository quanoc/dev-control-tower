import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'cyan' | 'purple' | 'orange' | 'amber';
  className?: string;
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-gray-800 text-gray-400',
  primary: 'bg-blue-500/15 text-blue-400',
  success: 'bg-emerald-500/15 text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-400',
  danger: 'bg-red-500/15 text-red-400',
  info: 'bg-cyan-500/15 text-cyan-400',
  cyan: 'bg-cyan-500/20 text-cyan-400',
  purple: 'bg-purple-500/15 text-purple-400',
  orange: 'bg-orange-500/20 text-orange-400',
  amber: 'bg-amber-500/20 text-amber-400',
};

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
