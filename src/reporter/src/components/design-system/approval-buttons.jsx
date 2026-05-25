/**
 * ApprovalButtons Component
 * Observatory Design System
 *
 * Approve/Reject buttons for visual review workflows.
 * Mobile-first with compact and full variants.
 *
 * Features:
 * - Clear visual states (pending, approved, rejected)
 * - Touch-friendly sizing
 * - Compact mode for mobile headers
 * - Loading states
 */

import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

/**
 * Single approval button
 */
export function ApprovalButton({
  variant = 'approve', // 'approve' | 'reject'
  isActive = false,
  onClick,
  disabled = false,
  loading = false,
  compact = false,
  showLabel = true,
  className = '',
  testId,
}) {
  let config = {
    approve: {
      label: 'Approve',
      icon: CheckIcon,
      activeClasses:
        'bg-[var(--accent-success-muted)] text-[var(--accent-success)] border border-[color-mix(in_srgb,var(--accent-success)_28%,transparent)]',
      inactiveClasses:
        'text-[var(--text-tertiary)] hover:text-[var(--accent-success)] hover:bg-[var(--accent-success-muted)] border border-transparent',
      dotColor: 'bg-[var(--accent-success)]',
    },
    reject: {
      label: 'Reject',
      icon: XMarkIcon,
      activeClasses:
        'bg-[var(--accent-danger-muted)] text-[var(--accent-danger)] border border-[color-mix(in_srgb,var(--accent-danger)_28%,transparent)]',
      inactiveClasses:
        'text-[var(--text-tertiary)] hover:text-[var(--accent-danger)] hover:bg-[var(--accent-danger-muted)] border border-transparent',
      dotColor: 'bg-[var(--accent-danger)]',
    },
  }[variant];

  let Icon = config.icon;

  let buttonTestId = testId || `btn-${variant}`;

  // Compact mode for mobile - icon only or smaller
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className={`
          flex items-center justify-center
          p-2 sm:px-3 sm:py-1.5
          rounded-lg text-sm font-medium
          transition-all duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          ${isActive ? config.activeClasses : config.inactiveClasses}
          ${className}
        `}
        title={config.label}
        aria-label={config.label}
        aria-pressed={isActive}
        data-testid={buttonTestId}
        data-active={isActive}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            <Icon className="w-4 h-4 sm:mr-1.5" />
            <span className="hidden sm:inline">{config.label}</span>
          </>
        )}
      </button>
    );
  }

  // Full mode
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        flex items-center gap-2
        px-3 sm:px-4 py-2
        rounded-lg text-sm font-semibold
        transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${isActive ? config.activeClasses : config.inactiveClasses}
        ${className}
      `}
      aria-pressed={isActive}
      data-testid={buttonTestId}
      data-active={isActive}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
      )}
      {showLabel && <span>{config.label}</span>}
    </button>
  );
}

/**
 * ApprovalButtonGroup - Paired approve/reject buttons
 */
export function ApprovalButtonGroup({
  status, // 'pending' | 'approved' | 'auto_approved' | 'rejected'
  onApprove,
  onReject,
  disabled = false,
  loading = false,
  compact = false,
  className = '',
}) {
  let isApproved = status === 'approved' || status === 'auto_approved';
  let isRejected = status === 'rejected';

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {onReject && (
        <ApprovalButton
          variant="reject"
          isActive={isRejected}
          onClick={onReject}
          disabled={disabled}
          loading={loading && isRejected}
          compact={compact}
        />
      )}
      {onApprove && (
        <ApprovalButton
          variant="approve"
          isActive={isApproved}
          onClick={onApprove}
          disabled={disabled}
          loading={loading && isApproved}
          compact={compact}
        />
      )}
    </div>
  );
}

/**
 * MobileApprovalBar - Bottom bar version for mobile
 * Touch-friendly approve/reject with clear visual states
 */
export function MobileApprovalBar({
  status,
  onApprove,
  onReject,
  disabled = false,
  loading = false,
  className = '',
  testIdPrefix = 'mobile',
}) {
  let isApproved = status === 'approved' || status === 'auto_approved';
  let isRejected = status === 'rejected';

  return (
    <div
      className={`
        flex items-stretch gap-2
        px-3 py-2.5
        ${className}
      `}
    >
      {onReject && (
        <button
          type="button"
          onClick={onReject}
          disabled={disabled || loading}
          data-testid={`${testIdPrefix}-btn-reject`}
          data-active={isRejected}
          className={`
            flex-1
            flex items-center justify-center gap-2
            py-3 px-4
            rounded-xl text-sm font-semibold
            transition-all duration-150 active:scale-[0.98]
            disabled:opacity-50 disabled:cursor-not-allowed
            ${
              isRejected
                ? 'bg-[var(--accent-danger-muted)] text-[var(--accent-danger)] border border-[color-mix(in_srgb,var(--accent-danger)_28%,transparent)]'
                : 'bg-[var(--vz-raised)] text-[var(--text-secondary)] border border-[var(--vz-border-subtle)] hover:bg-[var(--vz-elevated)] active:bg-[var(--accent-danger-muted)] active:text-[var(--accent-danger)]'
            }
          `}
        >
          <XMarkIcon className="w-5 h-5" />
          <span>Reject</span>
        </button>
      )}

      {onApprove && (
        <button
          type="button"
          onClick={onApprove}
          disabled={disabled || loading}
          data-testid={`${testIdPrefix}-btn-approve`}
          data-active={isApproved}
          className={`
            flex-1
            flex items-center justify-center gap-2
            py-3 px-4
            rounded-xl text-sm font-semibold
            transition-all duration-150 active:scale-[0.98]
            disabled:opacity-50 disabled:cursor-not-allowed
            ${
              isApproved
                ? 'bg-[var(--accent-success-muted)] text-[var(--accent-success)] border border-[color-mix(in_srgb,var(--accent-success)_28%,transparent)]'
                : 'bg-[var(--vz-raised)] text-[var(--text-secondary)] border border-[var(--vz-border-subtle)] hover:bg-[var(--vz-elevated)] active:bg-[var(--accent-success-muted)] active:text-[var(--accent-success)]'
            }
          `}
        >
          <CheckIcon className="w-5 h-5" />
          <span>Approve</span>
        </button>
      )}
    </div>
  );
}

export default ApprovalButtonGroup;
