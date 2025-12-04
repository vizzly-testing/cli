/**
 * Skeleton Components
 * Observatory Design System
 *
 * Loading placeholder animations
 */

export function Skeleton({ variant = 'text', className = '', count = 1 }) {
  const variantClasses = {
    text: 'h-4 w-full',
    heading: 'h-6 w-3/5',
    avatar: 'w-10 h-10 rounded-full',
    button: 'h-9 w-24 rounded-lg',
    badge: 'h-5 w-16 rounded-full',
    card: 'h-32 w-full rounded-xl',
  };

  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <>
      {items.map(i => (
        <div
          key={`skeleton-${variant}-${i}`}
          className={`skeleton ${variantClasses[variant]} ${className}`}
        />
      ))}
    </>
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`vz-card vz-card--no-hover p-6 space-y-4 ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton variant="avatar" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="heading" />
          <Skeleton variant="text" className="w-2/3" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <Skeleton variant="text" className="w-4/5" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4, className = '' }) {
  return (
    <div className={`vz-card vz-card--no-hover overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex gap-4 p-4 bg-slate-900/30 border-b border-slate-700/50">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton
            key={`header-col-${i}`}
            variant="text"
            className="h-3 flex-1"
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          className="flex gap-4 p-4 border-b border-slate-700/30 last:border-b-0"
        >
          {Array.from({ length: columns }, (_, colIndex) => (
            <Skeleton
              key={`row-${rowIndex}-col-${colIndex}`}
              variant="text"
              className={`flex-1 ${colIndex === 0 ? 'w-1/4' : ''}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
