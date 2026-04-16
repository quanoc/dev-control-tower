import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
}

export function Card({ children, hover = false, className = '', ...props }: CardProps) {
  return (
    <div
      className={`
        bg-gray-900 border border-gray-800 rounded-xl
        ${hover ? 'hover:border-gray-700 transition-colors' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
}

export function CardHeader({ title, description, action, children }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800">
      <div>
        {title && <h3 className="text-base font-semibold text-gray-100">{title}</h3>}
        {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
        {children}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export function CardContent({ children, className = '' }: CardContentProps) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}
