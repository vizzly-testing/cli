/**
 * Status Dot Component
 * BearDen Design System
 *
 * Small status indicator dot
 */

export function StatusDot({
  status = 'default',
  variant,
  pulse = false,
  size = 'md',
  className = '',
}) {
  let statusColors = {
    default: 'bg-[var(--text-muted)]',
    success: 'bg-[var(--accent-success)]',
    warning: 'bg-[var(--accent-warning)]',
    danger: 'bg-[var(--accent-danger)]',
    info: 'bg-[var(--accent-info)]',
    processing: 'bg-[var(--accent-info)]',
  };

  let statusKey = variant || status;
  let statusClass = statusColors[statusKey] || statusColors.default;

  let sizeClasses = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-3 h-3',
  };

  let shouldPulse = pulse || statusKey === 'processing';

  return (
    <span className={`relative inline-flex ${className}`}>
      {shouldPulse && (
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusClass}`}
        />
      )}
      <span
        className={`relative inline-flex rounded-full ${sizeClasses[size]} ${statusClass}`}
      />
    </span>
  );
}
