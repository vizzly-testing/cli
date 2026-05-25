/**
 * Badge Component
 * BearDen Design System
 *
 * For status indicators, labels, and counts
 * Variants: default, success, warning, danger, info, media, purple
 * Sizes: sm, md
 */

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  dot = false,
  pulseDot = false,
  className = '',
  ...props
}) {
  let variantClasses = {
    default:
      'bg-white/5 text-[var(--text-secondary)] border-[var(--vz-border-subtle)]',
    success:
      'bg-[var(--accent-success-muted)] text-[var(--accent-success)] border-[color-mix(in_srgb,var(--accent-success)_24%,transparent)]',
    warning:
      'bg-[var(--accent-warning-muted)] text-[var(--accent-warning)] border-[color-mix(in_srgb,var(--accent-warning)_24%,transparent)]',
    danger:
      'bg-[var(--accent-danger-muted)] text-[var(--accent-danger)] border-[color-mix(in_srgb,var(--accent-danger)_24%,transparent)]',
    info: 'bg-[var(--accent-info-muted)] text-[var(--accent-info)] border-[color-mix(in_srgb,var(--accent-info)_24%,transparent)]',
    media:
      'bg-[var(--accent-media-muted)] text-[var(--accent-media)] border-[color-mix(in_srgb,var(--accent-media)_24%,transparent)]',
    purple:
      'bg-[var(--accent-media-muted)] text-[var(--accent-media)] border-[color-mix(in_srgb,var(--accent-media)_24%,transparent)]',
  };

  let dotColors = {
    default: 'bg-[var(--text-tertiary)]',
    success: 'bg-[var(--accent-success)]',
    warning: 'bg-[var(--accent-warning)]',
    danger: 'bg-[var(--accent-danger)]',
    info: 'bg-[var(--accent-info)]',
    media: 'bg-[var(--accent-media)]',
    purple: 'bg-[var(--accent-media)]',
  };

  let sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  };

  let classes = [
    'inline-flex items-center gap-1.5 font-medium rounded-full border',
    variantClasses[variant],
    sizeClasses[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} {...props}>
      {dot && (
        <span className="relative flex h-2 w-2">
          {pulseDot && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColors[variant]}`}
            />
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${dotColors[variant]}`}
          />
        </span>
      )}
      {children}
    </span>
  );
}
