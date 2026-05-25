/**
 * Alert Component
 * BearDen Design System
 *
 * For feedback messages and notifications
 * Variants: success, warning, danger, info
 */

import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

export function Alert({
  variant = 'info',
  title,
  children,
  dismissible = false,
  onDismiss,
  icon: CustomIcon,
  className = '',
  ...props
}) {
  let variants = {
    success: {
      container:
        'bg-[var(--accent-success-muted)] border-[color-mix(in_srgb,var(--accent-success)_24%,transparent)]',
      icon: 'text-[var(--accent-success)]',
      title: 'text-[var(--accent-success)]',
      text: 'text-[var(--text-secondary)]',
      DefaultIcon: CheckCircleIcon,
    },
    warning: {
      container:
        'bg-[var(--accent-warning-muted)] border-[color-mix(in_srgb,var(--accent-warning)_24%,transparent)]',
      icon: 'text-[var(--accent-warning)]',
      title: 'text-[var(--accent-warning)]',
      text: 'text-[var(--text-secondary)]',
      DefaultIcon: ExclamationTriangleIcon,
    },
    danger: {
      container:
        'bg-[var(--accent-danger-muted)] border-[color-mix(in_srgb,var(--accent-danger)_24%,transparent)]',
      icon: 'text-[var(--accent-danger)]',
      title: 'text-[var(--accent-danger)]',
      text: 'text-[var(--text-secondary)]',
      DefaultIcon: XCircleIcon,
    },
    info: {
      container:
        'bg-[var(--accent-info-muted)] border-[color-mix(in_srgb,var(--accent-info)_24%,transparent)]',
      icon: 'text-[var(--accent-info)]',
      title: 'text-[var(--accent-info)]',
      text: 'text-[var(--text-secondary)]',
      DefaultIcon: InformationCircleIcon,
    },
  };

  let {
    container,
    icon,
    title: titleColor,
    text,
    DefaultIcon,
  } = variants[variant];
  let Icon = CustomIcon || DefaultIcon;

  return (
    <div
      className={`flex gap-3 p-4 rounded-lg border ${container} ${className}`}
      {...props}
    >
      <div className={`flex-shrink-0 ${icon}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        {title && (
          <h4 className={`text-sm font-medium ${titleColor}`}>{title}</h4>
        )}
        {children && (
          <div className={`text-sm ${text} ${title ? 'mt-1' : ''}`}>
            {children}
          </div>
        )}
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={onDismiss}
          className={`flex-shrink-0 ${icon} hover:opacity-70 transition-opacity`}
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
