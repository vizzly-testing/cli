/**
 * Modal Component
 * BearDen Design System
 *
 * Dialog/Modal component with variants
 */

import { XMarkIcon } from '@heroicons/react/24/outline';
import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showClose = true,
  className = '',
}) {
  let titleId = useId();
  let descriptionId = useId();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    let handleEscape = e => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  let sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[90vw]',
  };

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
        aria-label="Close"
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={`relative bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-2xl shadow-2xl w-full ${sizeClasses[size]} animate-in zoom-in-95 fade-in duration-200 ${className}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={description ? descriptionId : undefined}
        >
          {/* Header */}
          {(title || showClose) && (
            <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--vz-border-subtle)]">
              <div>
                {title && (
                  <h2
                    id={titleId}
                    className="text-lg font-semibold text-[var(--text-primary)]"
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    id={descriptionId}
                    className="text-sm text-[var(--text-tertiary)] mt-1"
                  >
                    {description}
                  </p>
                )}
              </div>
              {showClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-raised)] rounded-lg p-1.5 -mr-1.5 transition-colors"
                  aria-label="Close"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div className="px-6 py-5">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ModalFooter({ children, className = '' }) {
  return (
    <div
      className={`flex items-center justify-end gap-3 pt-4 mt-4 border-t border-[var(--vz-border-subtle)] ${className}`}
    >
      {children}
    </div>
  );
}
