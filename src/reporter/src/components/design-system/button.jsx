/**
 * Button Component
 * Observatory Design System
 *
 * Variants: primary, secondary, ghost, danger, warning, success
 * Sizes: sm, md, lg
 *
 * Polymorphic: Use `as` prop to render as different elements (e.g., 'a' for links)
 */

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon: Icon,
  iconPosition = 'left',
  fullWidth = false,
  className = '',
  as: Component = 'button',
  ...props
}) {
  let isDisabled = disabled || loading;
  let baseClasses =
    'vz-btn inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--vz-bg)]';

  let variantClasses = {
    primary:
      'vz-btn--primary bg-[var(--accent-brand)] hover:bg-[var(--accent-brand-hover)] text-[var(--vz-bg)] focus-visible:ring-[var(--accent-brand)]',
    secondary:
      'vz-btn--secondary bg-[var(--vz-raised)] hover:bg-white/10 text-[var(--text-primary)] border border-[var(--vz-border)] hover:border-[var(--vz-border-strong)] focus-visible:ring-[var(--text-tertiary)]',
    ghost:
      'vz-btn--ghost bg-transparent hover:bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:ring-[var(--text-tertiary)]',
    danger:
      'vz-btn--danger bg-[var(--accent-danger-muted)] hover:bg-[color-mix(in_srgb,var(--accent-danger)_22%,transparent)] text-[var(--accent-danger)] focus-visible:ring-[var(--accent-danger)]',
    warning:
      'vz-btn--warning bg-[var(--accent-warning-muted)] hover:bg-[color-mix(in_srgb,var(--accent-warning)_22%,transparent)] text-[var(--accent-warning)] focus-visible:ring-[var(--accent-warning)]',
    success:
      'vz-btn--success bg-[var(--accent-success-muted)] hover:bg-[color-mix(in_srgb,var(--accent-success)_22%,transparent)] text-[var(--accent-success)] focus-visible:ring-[var(--accent-success)]',
  };

  let sizeClasses = {
    sm: 'text-xs px-3 py-1.5 h-7',
    md: 'text-sm px-4 py-2 h-9',
    lg: 'text-base px-6 py-3 h-11',
  };

  let classes = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? 'w-full' : '',
    isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  let handleDisabledClick = event => {
    event.preventDefault();
    event.stopPropagation();
  };

  let elementProps =
    Component === 'button'
      ? { ...props, disabled: isDisabled }
      : {
          ...props,
          'aria-disabled': isDisabled || undefined,
          tabIndex: isDisabled ? -1 : props.tabIndex,
          onClick: isDisabled ? handleDisabledClick : props.onClick,
        };

  return (
    <Component
      className={classes}
      aria-busy={loading || undefined}
      {...elementProps}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {Icon && iconPosition === 'left' && !loading && (
        <Icon className="w-4 h-4" />
      )}
      {children}
      {Icon && iconPosition === 'right' && !loading && (
        <Icon className="w-4 h-4" />
      )}
    </Component>
  );
}
