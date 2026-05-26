/**
 * Static Report View
 *
 * A polished, hook-free component for SSR static report generation.
 * Uses native HTML5 <details>/<summary> for expand/collapse without JavaScript.
 * Designed for quick visual scanning with grouped status sections.
 */

import { isNewComparisonStatus } from '../utils/status-utils.js';

// Status configuration
let statusConfig = {
  failed: {
    label: 'Changed',
    borderClass: 'border-l-[var(--accent-danger)]',
    badgeClass:
      'bg-[var(--accent-danger-muted)] text-[var(--accent-danger)] ring-[color-mix(in_srgb,var(--accent-danger)_30%,transparent)]',
    dotClass: 'bg-[var(--accent-danger)]',
    sectionTitle: 'Visual Changes',
    sectionIcon: '◐',
  },
  new: {
    label: 'New',
    borderClass: 'border-l-[var(--accent-media)]',
    badgeClass:
      'bg-[var(--accent-media-muted)] text-[var(--accent-media)] ring-[color-mix(in_srgb,var(--accent-media)_30%,transparent)]',
    dotClass: 'bg-[var(--accent-media)]',
    sectionTitle: 'New Screenshots',
    sectionIcon: '+',
  },
  passed: {
    label: 'Passed',
    borderClass: 'border-l-[var(--accent-success)]',
    badgeClass:
      'bg-[var(--accent-success-muted)] text-[var(--accent-success)] ring-[color-mix(in_srgb,var(--accent-success)_30%,transparent)]',
    dotClass: 'bg-[var(--accent-success)]',
    sectionTitle: 'Passed',
    sectionIcon: '✓',
  },
  error: {
    label: 'Error',
    borderClass: 'border-l-[var(--accent-warning)]',
    badgeClass:
      'bg-[var(--accent-warning-muted)] text-[var(--accent-warning)] ring-[color-mix(in_srgb,var(--accent-warning)_30%,transparent)]',
    dotClass: 'bg-[var(--accent-warning)]',
    sectionTitle: 'Errors',
    sectionIcon: '!',
  },
};

function StatusBadge({ status }) {
  let config = statusConfig[status] || statusConfig.error;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${config.badgeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      {config.label}
    </span>
  );
}

function DiffBadge({ percentage }) {
  if (percentage === undefined || percentage === null || percentage === 0)
    return null;
  return (
    <span className="font-mono text-xs text-[var(--accent-danger)] tabular-nums">
      {percentage.toFixed(2)}%
    </span>
  );
}

function MetaInfo({ properties }) {
  if (!properties) return null;
  let { viewport_width, viewport_height, browser } = properties;

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
      {viewport_width && viewport_height && (
        <span className="font-mono tabular-nums">
          {viewport_width}×{viewport_height}
        </span>
      )}
      {browser && (
        <>
          <span className="text-[var(--text-muted)]">·</span>
          <span className="capitalize">{browser}</span>
        </>
      )}
    </div>
  );
}

/**
 * Comparison item for failed/changed screenshots
 * Expandable with side-by-side comparison view
 */
function FailedComparison({ comparison, isEven }) {
  let { name, status, current, baseline, diff, diffPercentage, properties } =
    comparison;
  let config = statusConfig[status] || statusConfig.failed;

  return (
    <details className="group">
      <summary
        className={`
          flex items-center gap-4 p-4 cursor-pointer
          ${isEven ? 'bg-[var(--vz-surface)]' : 'bg-[var(--vz-elevated)]'}
          hover:bg-[var(--vz-raised)]
          border-l-4 ${config.borderClass}
          rounded-r-lg transition-all duration-150
          list-none [&::-webkit-details-marker]:hidden
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent-brand)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--vz-bg)]
        `}
      >
        {/* Thumbnail */}
        <div className="relative w-16 h-10 flex-shrink-0 rounded overflow-hidden bg-[var(--vz-bg)]">
          {(current || baseline) && (
            <img
              src={current || baseline}
              alt=""
              className="w-full h-full object-cover object-top"
            />
          )}
          {diff && (
            <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--accent-danger)_20%,transparent)] flex items-center justify-center">
              <span className="w-2 h-2 bg-[var(--accent-danger)] rounded-full animate-pulse" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[var(--text-primary)] truncate">
              {name}
            </span>
            <DiffBadge percentage={diffPercentage} />
          </div>
          <MetaInfo properties={properties} />
        </div>

        {/* Expand indicator */}
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <div className="flex items-center gap-1.5 text-[var(--text-muted)] group-hover:text-[var(--text-tertiary)] transition-colors">
            <span className="text-xs hidden sm:inline opacity-0 group-hover:opacity-100 transition-opacity">
              Details
            </span>
            <svg
              className="w-5 h-5 transition-transform duration-200 group-open:rotate-180"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </summary>

      {/* Expanded content: side-by-side comparison */}
      <div className="mt-1 p-4 bg-[var(--vz-surface)] rounded-lg border border-[var(--vz-border-subtle)] animate-[fadeIn_150ms_ease-out]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Baseline */}
          {baseline && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                  Baseline
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  Expected
                </span>
              </div>
              <a
                href={baseline}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden border border-[var(--vz-border-subtle)] hover:border-[var(--vz-border-strong)] transition-colors"
              >
                <img
                  src={baseline}
                  alt={`${name} baseline`}
                  className="w-full"
                />
              </a>
            </div>
          )}

          {/* Current */}
          {current && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                  Current
                </span>
                <span className="text-xs text-[var(--text-muted)]">Actual</span>
              </div>
              <a
                href={current}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden border border-[var(--vz-border-subtle)] hover:border-[var(--vz-border-strong)] transition-colors"
              >
                <img src={current} alt={`${name} current`} className="w-full" />
              </a>
            </div>
          )}
        </div>

        {/* Diff image */}
        {diff && (
          <div className="mt-4 pt-4 border-t border-[var(--vz-border-subtle)]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-[var(--accent-danger)] uppercase tracking-wider">
                Difference
              </span>
              {diffPercentage > 0 && (
                <span className="text-xs text-[color-mix(in_srgb,var(--accent-danger)_70%,transparent)] font-mono">
                  {diffPercentage.toFixed(2)}% of pixels changed
                </span>
              )}
            </div>
            <a
              href={diff}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg overflow-hidden border border-[color-mix(in_srgb,var(--accent-danger)_32%,transparent)] hover:border-[color-mix(in_srgb,var(--accent-danger)_52%,transparent)] transition-colors max-w-2xl"
            >
              <img src={diff} alt={`${name} diff`} className="w-full" />
            </a>
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * Comparison item for new screenshots
 * Expandable to show the new screenshot
 */
function NewComparison({ comparison, isEven }) {
  let { name, current, baseline, properties } = comparison;
  let imageSrc = current || baseline;

  return (
    <details className="group">
      <summary
        className={`
          flex items-center gap-4 p-4 cursor-pointer
          ${isEven ? 'bg-[var(--vz-surface)]' : 'bg-[var(--vz-elevated)]'}
          hover:bg-[var(--vz-raised)]
          border-l-4 border-l-[var(--accent-media)]
          rounded-r-lg transition-all duration-150
          list-none [&::-webkit-details-marker]:hidden
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent-brand)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--vz-bg)]
        `}
      >
        {/* Thumbnail */}
        <div className="w-16 h-10 flex-shrink-0 rounded overflow-hidden bg-[var(--vz-bg)]">
          {imageSrc && (
            <img
              src={imageSrc}
              alt=""
              className="w-full h-full object-cover object-top"
            />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-[var(--text-primary)] truncate block">
            {name}
          </span>
          <MetaInfo properties={properties} />
        </div>

        {/* Expand indicator */}
        <div className="flex items-center gap-3">
          <StatusBadge status="new" />
          <div className="flex items-center gap-1.5 text-[var(--text-muted)] group-hover:text-[var(--text-tertiary)] transition-colors">
            <span className="text-xs hidden sm:inline opacity-0 group-hover:opacity-100 transition-opacity">
              Preview
            </span>
            <svg
              className="w-5 h-5 transition-transform duration-200 group-open:rotate-180"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </summary>

      {/* Expanded: show the new screenshot */}
      <div className="mt-1 p-4 bg-[var(--vz-surface)] rounded-lg border border-[var(--vz-border-subtle)] animate-[fadeIn_150ms_ease-out]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-[var(--accent-media)] uppercase tracking-wider">
            New Screenshot
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            No baseline to compare
          </span>
        </div>
        {imageSrc && (
          <a
            href={imageSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg overflow-hidden border border-[color-mix(in_srgb,var(--accent-media)_32%,transparent)] hover:border-[color-mix(in_srgb,var(--accent-media)_52%,transparent)] transition-colors max-w-2xl"
          >
            <img src={imageSrc} alt={name} className="w-full" />
          </a>
        )}
      </div>
    </details>
  );
}

/**
 * Compact passed item - no expand needed
 */
function PassedComparison({ comparison }) {
  let { name, properties } = comparison;

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-2.5
        bg-[var(--vz-surface)] hover:bg-[var(--vz-raised)]
        border-l-4 border-l-[color-mix(in_srgb,var(--accent-success)_50%,transparent)]
        rounded-r-lg transition-colors
      `}
    >
      {/* Checkmark */}
      <div className="w-5 h-5 rounded-full bg-[var(--accent-success-muted)] flex items-center justify-center flex-shrink-0">
        <svg
          className="w-3 h-3 text-[var(--accent-success)]"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {/* Name */}
      <span className="flex-1 text-sm text-[var(--text-secondary)] truncate">
        {name}
      </span>

      {/* Meta */}
      <MetaInfo properties={properties} />
    </div>
  );
}

/**
 * Section header for grouping
 */
function SectionHeader({ title, count, icon, colorClass }) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 mb-3">
      <span className={`text-lg font-mono ${colorClass}`}>{icon}</span>
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
        {title}
      </h3>
      <span className="text-sm text-[var(--text-muted)] font-mono">
        ({count})
      </span>
    </div>
  );
}

/**
 * Summary stats bar
 */
function SummaryBar({ stats }) {
  let hasIssues = stats.failed > 0 || stats.new > 0;

  return (
    <div
      className={`
        flex flex-wrap items-center gap-6 p-4 rounded-xl mb-8
        ${hasIssues ? 'bg-[var(--vz-surface)] border border-[var(--vz-border)]' : 'bg-[var(--accent-success-muted)] border border-[color-mix(in_srgb,var(--accent-success)_24%,transparent)]'}
      `}
    >
      {/* Status indicator */}
      <div className="flex items-center gap-3">
        {hasIssues ? (
          <>
            <div className="w-10 h-10 rounded-full bg-[var(--accent-warning-muted)] flex items-center justify-center">
              <span className="text-[var(--accent-warning)] text-lg">◐</span>
            </div>
            <div>
              <div className="text-[var(--text-primary)] font-semibold">
                Review Required
              </div>
              <div className="text-sm text-[var(--text-tertiary)]">
                {stats.failed + (stats.new || 0)} items need attention
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full bg-[var(--accent-success-muted)] flex items-center justify-center">
              <svg
                className="w-5 h-5 text-[var(--accent-success)]"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <div className="text-[var(--text-primary)] font-semibold">
                All Tests Passed
              </div>
              <div className="text-sm text-[var(--text-tertiary)]">
                No visual changes detected
              </div>
            </div>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 ml-auto">
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">
            {stats.total}
          </div>
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
            Total
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[var(--accent-success)] tabular-nums">
            {stats.passed}
          </div>
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
            Passed
          </div>
        </div>
        {stats.failed > 0 && (
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--accent-danger)] tabular-nums">
              {stats.failed}
            </div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
              Changed
            </div>
          </div>
        )}
        {(stats.new || 0) > 0 && (
          <div className="text-center">
            <div className="text-2xl font-bold text-[var(--accent-media)] tabular-nums">
              {stats.new}
            </div>
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
              New
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimestamp(timestamp) {
  if (!timestamp) return null;
  let date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Header({ timestamp }) {
  return (
    <header className="bg-[var(--vz-bg)] border-b border-[var(--vz-border-subtle)] sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[var(--accent-brand)] rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-[var(--vz-bg)]"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
            </svg>
          </div>
          <div>
            <div className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
              Vizzly
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              Visual Test Report
            </div>
          </div>
        </div>

        {/* Timestamp */}
        {timestamp && (
          <div className="text-xs text-[var(--text-muted)] tabular-nums">
            {formatTimestamp(timestamp)}
          </div>
        )}
      </div>
    </header>
  );
}

export default function StaticReportView({ reportData }) {
  if (!reportData?.comparisons) {
    return (
      <div className="min-h-screen bg-[var(--vz-bg)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-medium mb-2">No Report Data</div>
          <p className="text-[var(--text-tertiary)]">
            No comparison data available for this report.
          </p>
        </div>
      </div>
    );
  }

  let { comparisons } = reportData;

  // Calculate stats
  let stats = {
    total: comparisons.length,
    passed: comparisons.filter(c => c.status === 'passed').length,
    failed: comparisons.filter(c => c.status === 'failed').length,
    new: comparisons.filter(c => isNewComparisonStatus(c.status)).length,
    error: comparisons.filter(c => c.status === 'error').length,
  };

  // Group comparisons by status
  let failed = comparisons.filter(c => c.status === 'failed');
  let newItems = comparisons.filter(c => isNewComparisonStatus(c.status));
  let passed = comparisons.filter(c => c.status === 'passed');
  let errors = comparisons.filter(c => c.status === 'error');

  return (
    <div className="min-h-screen bg-[var(--vz-bg)] text-[var(--text-primary)]">
      <Header timestamp={reportData.timestamp} />

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Summary */}
        <SummaryBar stats={stats} />

        {/* Failed/Changed Section */}
        {failed.length > 0 && (
          <section className="mb-8">
            <SectionHeader
              title="Visual Changes"
              count={failed.length}
              icon="◐"
              colorClass="text-[var(--accent-danger)]"
            />
            <div className="space-y-2">
              {failed.map((comparison, index) => (
                <FailedComparison
                  key={
                    comparison.id || comparison.signature || `failed-${index}`
                  }
                  comparison={comparison}
                  isEven={index % 2 === 0}
                />
              ))}
            </div>
          </section>
        )}

        {/* New Section */}
        {newItems.length > 0 && (
          <section className="mb-8">
            <SectionHeader
              title="New Screenshots"
              count={newItems.length}
              icon="+"
              colorClass="text-[var(--accent-media)]"
            />
            <div className="space-y-2">
              {newItems.map((comparison, index) => (
                <NewComparison
                  key={comparison.id || comparison.signature || `new-${index}`}
                  comparison={comparison}
                  isEven={index % 2 === 0}
                />
              ))}
            </div>
          </section>
        )}

        {/* Errors Section */}
        {errors.length > 0 && (
          <section className="mb-8">
            <SectionHeader
              title="Errors"
              count={errors.length}
              icon="!"
              colorClass="text-[var(--accent-warning)]"
            />
            <div className="space-y-2">
              {errors.map((comparison, index) => (
                <FailedComparison
                  key={
                    comparison.id || comparison.signature || `error-${index}`
                  }
                  comparison={comparison}
                  isEven={index % 2 === 0}
                />
              ))}
            </div>
          </section>
        )}

        {/* Passed Section */}
        {passed.length > 0 && (
          <section className="mb-8">
            <details className="group">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-lg font-mono text-[var(--accent-success)]">
                    ✓
                  </span>
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Passed
                  </h3>
                  <span className="text-sm text-[var(--text-muted)] font-mono">
                    ({passed.length})
                  </span>
                  <svg
                    className="w-4 h-4 text-[var(--text-muted)] transition-transform group-open:rotate-180 ml-auto"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </summary>
              <div className="space-y-1">
                {passed.map((comparison, index) => (
                  <PassedComparison
                    key={
                      comparison.id || comparison.signature || `passed-${index}`
                    }
                    comparison={comparison}
                  />
                ))}
              </div>
            </details>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-[var(--vz-border-subtle)] text-center">
          <p className="text-sm text-[var(--text-muted)]">
            Visual regression report generated by{' '}
            <a
              href="https://vizzly.dev"
              className="text-[var(--accent-brand)] hover:text-[var(--accent-brand-hover)] transition-colors"
            >
              Vizzly
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
