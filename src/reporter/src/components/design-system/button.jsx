/**
 * Button Component
 * Observatory Design System
 *
 * Variants: primary, secondary, ghost, danger, warning, success
 * Sizes: sm, md, lg
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
  ...props
}) {
  const baseClasses =
    'vz-btn inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900';

  const variantClasses = {
    primary:
      'bg-amber-500 hover:bg-amber-400 text-slate-900 focus-visible:ring-amber-500',
    secondary:
      'bg-white/10 hover:bg-white/15 text-white border border-white/10 hover:border-white/20 focus-visible:ring-white/50',
    ghost:
      'bg-transparent hover:bg-white/5 text-slate-300 hover:text-white focus-visible:ring-white/30',
    danger:
      'bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 focus-visible:ring-red-500',
    warning:
      'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 focus-visible:ring-amber-500',
    success:
      'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 focus-visible:ring-emerald-500',
  };

  const sizeClasses = {
    sm: 'text-xs px-3 py-1.5 h-7',
    md: 'text-sm px-4 py-2 h-9',
    lg: 'text-base px-6 py-3 h-11',
  };

  const classes = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? 'w-full' : '',
    disabled || loading
      ? 'opacity-50 cursor-not-allowed pointer-events-none'
      : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
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
    </button>
  );
}
