/**
 * Timeline Component
 * Observatory Design System
 *
 * Build status timeline visualization
 */

export function Timeline({
  items = [],
  onItemClick,
  maxItems = 20,
  className = '',
}) {
  let displayItems = items.slice(0, maxItems);

  let getStatusClass = item => {
    if (item.status === 'processing' || item.status === 'pending') {
      return 'bg-[var(--accent-info)] animate-pulse';
    }
    if (item.status === 'approved' || item.approval_status === 'approved') {
      return 'bg-[var(--accent-success)]';
    }
    if (
      item.status === 'rejected' ||
      item.status === 'failed' ||
      item.approval_status === 'rejected'
    ) {
      return 'bg-[var(--accent-danger)]';
    }
    return 'bg-[var(--accent-warning)]';
  };

  if (!displayItems.length) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-[var(--text-muted)]">No items yet</p>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-1 ${className}`}>
      {displayItems.map((item, index) => (
        <button
          type="button"
          key={item.id || index}
          onClick={() => onItemClick?.(item)}
          className={`group relative w-1.5 rounded-full transition-all duration-150 hover:scale-y-110 cursor-pointer ${getStatusClass(item)}`}
          style={{
            height: `${Math.max(16, 32)}px`,
            opacity: 0.7 + (index / displayItems.length) * 0.3,
          }}
        >
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-10">
            <div className="bg-[var(--vz-raised)] border border-[var(--vz-border)] rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
              {item.label && (
                <div className="text-xs font-medium text-[var(--text-primary)]">
                  {item.label}
                </div>
              )}
              {item.sublabel && (
                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  {item.sublabel}
                </div>
              )}
              {item.time && (
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {item.time}
                </div>
              )}
            </div>
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
              <div className="border-4 border-transparent border-t-[var(--vz-raised)]" />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
