/**
 * ConfirmationDialog Component
 * Observatory Design System
 *
 * A specialized modal for confirmation actions (delete, dangerous operations, etc.)
 * Variants: danger, warning, info
 */

import {
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './button.jsx';

export function ConfirmationDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
  icon: CustomIcon,
  children,
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
      if (e.key === 'Escape' && isOpen && !loading) {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel, loading]);

  if (!isOpen) return null;

  let variantStyles = {
    danger: {
      header:
        'bg-[var(--accent-danger-muted)] border-[color-mix(in_srgb,var(--accent-danger)_28%,transparent)]',
      iconBg: 'bg-[var(--accent-danger)]',
      title: 'text-[var(--accent-danger)]',
      message: 'text-[var(--text-secondary)]',
      buttonVariant: 'danger',
    },
    warning: {
      header:
        'bg-[var(--accent-warning-muted)] border-[color-mix(in_srgb,var(--accent-warning)_28%,transparent)]',
      iconBg: 'bg-[var(--accent-warning)]',
      title: 'text-[var(--accent-warning)]',
      message: 'text-[var(--text-secondary)]',
      buttonVariant: 'warning',
    },
    info: {
      header:
        'bg-[var(--accent-info-muted)] border-[color-mix(in_srgb,var(--accent-info)_28%,transparent)]',
      iconBg: 'bg-[var(--accent-info)]',
      title: 'text-[var(--accent-info)]',
      message: 'text-[var(--text-secondary)]',
      buttonVariant: 'primary',
    },
  };

  let styles = variantStyles[variant] || variantStyles.danger;
  let Icon = CustomIcon || ExclamationTriangleIcon;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={loading ? undefined : onCancel}
        aria-label="Close dialog"
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={message || children ? descriptionId : undefined}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="absolute top-5 right-5 z-10 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-raised)] rounded-lg p-1 transition-colors disabled:opacity-50"
            aria-label="Close dialog"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>

          {/* Header with icon */}
          <div
            className={`px-8 pt-8 pb-6 border-b border-[var(--vz-border-subtle)] ${styles.header}`}
          >
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${styles.iconBg}`}
              >
                <Icon className="w-6 h-6 text-[var(--vz-bg)]" />
              </div>
              <h3
                id={titleId}
                className={`text-xl font-semibold pr-8 ${styles.title}`}
              >
                {title}
              </h3>
            </div>
          </div>

          {/* Content */}
          <div id={descriptionId} className="px-8 py-6">
            {message && (
              <p className={`text-sm leading-relaxed ${styles.message}`}>
                {message}
              </p>
            )}
            {children && (
              <div
                className={`text-sm leading-relaxed ${styles.message} ${message ? 'mt-4' : ''}`}
              >
                {children}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 py-6 bg-[var(--vz-elevated)] border-t border-[var(--vz-border-subtle)]">
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <Button variant="secondary" onClick={onCancel} disabled={loading}>
                {cancelText}
              </Button>
              <Button
                variant={styles.buttonVariant}
                onClick={onConfirm}
                loading={loading}
              >
                {confirmText}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
