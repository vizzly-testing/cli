/**
 * Skeleton Component
 * BearDen Design System
 *
 * Loading placeholder with shimmer effect
 */

export function Skeleton({
  variant = 'text',
  width,
  height,
  className = '',
  count = 1,
}) {
  let baseClasses = 'animate-pulse bg-[var(--vz-raised)] rounded';

  let variantClasses = {
    text: 'h-4 rounded',
    heading: 'h-8 rounded',
    avatar: 'rounded-full',
    card: 'rounded-xl',
    button: 'h-10 rounded-lg',
    badge: 'h-6 w-16 rounded-full',
  };

  let defaultSizes = {
    text: { width: '100%', height: '16px' },
    heading: { width: '60%', height: '32px' },
    avatar: { width: '40px', height: '40px' },
    card: { width: '100%', height: '200px' },
    button: { width: '100px', height: '40px' },
    badge: { width: '64px', height: '24px' },
  };

  let defaultSize = defaultSizes[variant];

  let skeletons = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={{
        width: width || defaultSize.width,
        height: height || defaultSize.height,
      }}
    />
  ));

  if (count === 1) return skeletons[0];

  return <div className="space-y-2">{skeletons}</div>;
}

// Preset skeleton compositions
export function SkeletonCard({ className = '' }) {
  return (
    <div
      className={`bg-[var(--vz-surface)] border border-[var(--vz-border-subtle)] rounded-xl p-6 ${className}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <Skeleton variant="avatar" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="60%" height="12px" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <Skeleton variant="text" width="80%" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4, className = '' }) {
  return (
    <div className={className}>
      {/* Header */}
      <div className="flex gap-4 pb-4 border-b border-[var(--vz-border-subtle)]">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton
            key={i}
            variant="text"
            width={`${100 / columns}%`}
            height="12px"
          />
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y divide-[var(--vz-border-subtle)]">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4 py-4">
            {Array.from({ length: columns }, (_, colIndex) => (
              <Skeleton
                key={colIndex}
                variant="text"
                width={`${100 / columns}%`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
