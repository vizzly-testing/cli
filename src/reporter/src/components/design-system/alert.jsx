/**
 * Alert Component
 * Observatory Design System
 *
 * Variants: success, warning, danger, info
 */

import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const variantConfig = {
  success: {
    icon: CheckCircleIcon,
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    iconColor: 'text-emerald-400',
    textColor: 'text-emerald-300',
  },
  warning: {
    icon: ExclamationTriangleIcon,
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    iconColor: 'text-amber-400',
    textColor: 'text-amber-300',
  },
  danger: {
    icon: XCircleIcon,
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    iconColor: 'text-red-400',
    textColor: 'text-red-300',
  },
  info: {
    icon: InformationCircleIcon,
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    iconColor: 'text-blue-400',
    textColor: 'text-blue-300',
  },
};

export function Alert({
  variant = 'info',
  title,
  children,
  icon: CustomIcon,
  dismissible = false,
  onDismiss,
  className = '',
}) {
  const config = variantConfig[variant];
  const Icon = CustomIcon || config.icon;

  return (
    <div
      className={`rounded-xl border ${config.bg} ${config.border} p-4 ${className}`}
      role="alert"
    >
      <div className="flex gap-3">
        <div className={`flex-shrink-0 ${config.iconColor}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          {title && (
            <h3 className={`text-sm font-medium ${config.textColor}`}>
              {title}
            </h3>
          )}
          {children && (
            <div className={`text-sm ${title ? 'mt-1' : ''} text-slate-400`}>
              {children}
            </div>
          )}
        </div>
        {dismissible && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
