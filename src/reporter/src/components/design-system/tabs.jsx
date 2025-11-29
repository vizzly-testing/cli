/**
 * Tabs Component
 * Observatory Design System
 *
 * Variants: default, pills, underline
 */

export function Tabs({
  tabs = [],
  activeTab,
  onChange,
  variant = 'default',
  className = '',
}) {
  let variantStyles = {
    default: {
      container: 'border-b border-slate-700/50',
      tab: 'px-4 py-3 text-sm font-medium transition-colors relative',
      active: 'text-amber-400',
      inactive: 'text-slate-400 hover:text-white',
      indicator: 'absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500',
    },
    pills: {
      container: 'bg-slate-800/50 p-1 rounded-lg inline-flex gap-1',
      tab: 'px-4 py-2 text-sm font-medium rounded-md transition-all',
      active: 'bg-amber-500 text-slate-900',
      inactive: 'text-slate-400 hover:text-white hover:bg-white/5',
      indicator: '',
    },
    underline: {
      container: 'flex gap-6',
      tab: 'pb-3 text-sm font-medium transition-colors relative',
      active: 'text-white',
      inactive: 'text-slate-400 hover:text-white',
      indicator: 'absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500',
    },
  };

  let styles = variantStyles[variant];

  return (
    <div className={`${styles.container} ${className}`}>
      {tabs.map(tab => {
        let isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange?.(tab.key)}
            className={`${styles.tab} ${isActive ? styles.active : styles.inactive}`}
          >
            <span className="flex items-center gap-2">
              {tab.icon && <tab.icon className="w-4 h-4" />}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? variant === 'pills'
                        ? 'bg-slate-900/20 text-slate-900'
                        : 'bg-amber-500/20 text-amber-400'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </span>
            {isActive && styles.indicator && (
              <div className={styles.indicator} />
            )}
          </button>
        );
      })}
    </div>
  );
}
