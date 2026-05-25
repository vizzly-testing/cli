/**
 * Tabs Component
 * BearDen Design System
 *
 * Tab navigation component
 */

import { useEffect, useState } from 'react';

export function Tabs({
  tabs = [],
  defaultTab,
  onChange,
  variant = 'default',
  className = '',
}) {
  let [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  // Sync internal state with external defaultTab prop (controlled component pattern)
  useEffect(() => {
    if (defaultTab !== undefined) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  let handleTabChange = tabId => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  let variantClasses = {
    default: {
      container: 'border-b border-[var(--vz-border-subtle)]',
      tab: 'px-4 py-3 text-sm font-medium transition-colors relative',
      active: 'text-[var(--accent-brand)]',
      inactive: 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
      indicator:
        'absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-brand)]',
    },
    pills: {
      container: 'bg-[var(--vz-raised)] rounded-lg p-1 inline-flex',
      tab: 'px-4 py-2 text-sm font-medium rounded-md transition-all',
      active: 'bg-[var(--accent-brand)] text-[var(--vz-bg)]',
      inactive:
        'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/5',
      indicator: '',
    },
    underline: {
      container: 'flex gap-6',
      tab: 'pb-3 text-sm font-medium transition-colors relative',
      active: 'text-[var(--text-primary)]',
      inactive: 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
      indicator:
        'absolute bottom-0 left-0 right-0 h-px bg-[var(--accent-brand)]',
    },
  };

  let styles = variantClasses[variant];

  return (
    <div className={className} data-testid="tabs">
      <div className={styles.container}>
        {tabs.map(tab => (
          <button
            type="button"
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : styles.inactive}`}
            data-testid={`tab-${tab.id}`}
            data-active={activeTab === tab.id}
          >
            <span className="flex items-center gap-2">
              {tab.icon && <tab.icon className="w-4 h-4" />}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                    activeTab === tab.id
                      ? 'bg-[var(--accent-brand-muted)] text-[var(--accent-brand)]'
                      : 'bg-[var(--vz-raised)] text-[var(--text-tertiary)]'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </span>
            {activeTab === tab.id && styles.indicator && (
              <div className={styles.indicator} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
