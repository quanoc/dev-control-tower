import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'wide' | 'full';
}

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  wide: 'w-[80vw] max-w-[1200px]',
  full: 'inset-4 md:inset-8 flex flex-col',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  if (!open) return null;

  const isFull = size === 'full';
  const containerBase =
    'relative bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden';
  const containerClasses = isFull
    ? `${containerBase} ${sizeClasses.full}`
    : `${containerBase} w-full mx-auto ${sizeClasses[size]}`;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Container */}
      <div
        className={containerClasses}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        aria-describedby={description ? 'modal-desc' : undefined}
      >
        {/* Header */}
        {(title || !isFull) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
            <div>
              {title && (
                <h2
                  id="modal-title"
                  className="text-lg font-semibold text-gray-100"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p id="modal-desc" className="text-sm text-gray-500 mt-0.5">
                  {description}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        )}

        {/* Body */}
        <div className={isFull ? 'flex-1 overflow-y-auto max-h-[calc(100vh-180px)]' : 'overflow-y-auto max-h-[70vh]'}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
