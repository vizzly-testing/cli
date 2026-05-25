/**
 * Toast Component
 * Observatory Design System
 *
 * A notification banner/toast for temporary messages
 * Variants: success, warning, error, info
 *
 * Note: This component uses an onAutoHide callback instead of internal timers
 * to give the parent full control over timing and cleanup.
 */

import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { createPortal } from 'react-dom';

let variantConfig = {
  success: {
    icon: CheckCircleIcon,
    classes:
      'bg-[var(--accent-success-muted)] border-[color-mix(in_srgb,var(--accent-success)_30%,transparent)] text-[var(--text-primary)]',
    iconClass: 'text-[var(--accent-success)]',
  },
  warning: {
    icon: ExclamationTriangleIcon,
    classes:
      'bg-[var(--accent-warning-muted)] border-[color-mix(in_srgb,var(--accent-warning)_30%,transparent)] text-[var(--text-primary)]',
    iconClass: 'text-[var(--accent-warning)]',
  },
  error: {
    icon: XCircleIcon,
    classes:
      'bg-[var(--accent-danger-muted)] border-[color-mix(in_srgb,var(--accent-danger)_30%,transparent)] text-[var(--text-primary)]',
    iconClass: 'text-[var(--accent-danger)]',
  },
  info: {
    icon: InformationCircleIcon,
    classes:
      'bg-[var(--accent-info-muted)] border-[color-mix(in_srgb,var(--accent-info)_30%,transparent)] text-[var(--text-primary)]',
    iconClass: 'text-[var(--accent-info)]',
  },
};

export function Toast({
  message,
  variant = 'info',
  isVisible = false,
  onClose,
  title,
  position = 'top',
  className = '',
}) {
  if (!isVisible || !message) return null;

  let config = variantConfig[variant] || variantConfig.info;
  let Icon = config.icon;

  let positionClasses = {
    top: 'top-4 left-1/2 -translate-x-1/2',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    bottom: 'bottom-4 left-1/2 -translate-x-1/2',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  let toast = (
    <div
      className={`fixed z-50 ${positionClasses[position]} animate-in fade-in slide-in-from-top-2 duration-200`}
      role="alert"
      aria-live="polite"
    >
      <div
        className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm max-w-md ${config.classes} ${className}`}
      >
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${config.iconClass}`} />
        <div className="flex-1 min-w-0">
          {title && <p className="font-medium text-sm">{title}</p>}
          <p className={`text-sm ${title ? 'opacity-90' : ''}`}>{message}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Dismiss"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return createPortal(toast, document.body);
}

/**
 * ToastContainer - For managing multiple toasts
 * Use with a toast management hook/state
 */
export function ToastContainer({
  toasts = [],
  onDismiss,
  position = 'top-right',
}) {
  if (toasts.length === 0) return null;

  let positionClasses = {
    top: 'top-4 left-1/2 -translate-x-1/2 items-center',
    'top-right': 'top-4 right-4 items-end',
    'top-left': 'top-4 left-4 items-start',
    bottom: 'bottom-4 left-1/2 -translate-x-1/2 items-center',
    'bottom-right': 'bottom-4 right-4 items-end',
    'bottom-left': 'bottom-4 left-4 items-start',
  };

  return createPortal(
    <div
      className={`fixed z-50 flex flex-col gap-2 ${positionClasses[position]}`}
    >
      {toasts.map(toast => {
        let config = variantConfig[toast.variant] || variantConfig.info;
        let Icon = config.icon;

        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm max-w-md animate-in fade-in slide-in-from-top-2 duration-200 ${config.classes}`}
            role="alert"
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${config.iconClass}`} />
            <div className="flex-1 min-w-0">
              {toast.title && (
                <p className="font-medium text-sm">{toast.title}</p>
              )}
              <p className={`text-sm ${toast.title ? 'opacity-90' : ''}`}>
                {toast.message}
              </p>
            </div>
            {onDismiss && (
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Dismiss"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>,
    document.body
  );
}
