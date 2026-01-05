/**
 * Static Report View
 *
 * A polished, hook-free component for SSR static report generation.
 * Uses native HTML5 <details>/<summary> for expand/collapse without JavaScript.
 * Designed for quick visual scanning with grouped status sections.
 */

// Status configuration
const statusConfig = {
  failed: {
    label: 'Changed',
    borderClass: 'border-l-red-500',
    badgeClass: 'bg-red-500/15 text-red-400 ring-red-500/30',
    dotClass: 'bg-red-500',
    sectionTitle: 'Visual Changes',
    sectionIcon: '◐',
  },
  new: {
    label: 'New',
    borderClass: 'border-l-blue-500',
    badgeClass: 'bg-blue-500/15 text-blue-400 ring-blue-500/30',
    dotClass: 'bg-blue-500',
    sectionTitle: 'New Screenshots',
    sectionIcon: '+',
  },
  passed: {
    label: 'Passed',
    borderClass: 'border-l-emerald-500',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
    dotClass: 'bg-emerald-500',
    sectionTitle: 'Passed',
    sectionIcon: '✓',
  },
  error: {
    label: 'Error',
    borderClass: 'border-l-orange-500',
    badgeClass: 'bg-orange-500/15 text-orange-400 ring-orange-500/30',
    dotClass: 'bg-orange-500',
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
    <span className="font-mono text-xs text-red-400/80 tabular-nums">
      {percentage.toFixed(2)}%
    </span>
  );
}

function MetaInfo({ properties }) {
  if (!properties) return null;
  let { viewport_width, viewport_height, browser } = properties;

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      {viewport_width && viewport_height && (
        <span className="font-mono tabular-nums">
          {viewport_width}×{viewport_height}
        </span>
      )}
      {browser && (
        <>
          <span className="text-slate-600">·</span>
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
          ${isEven ? 'bg-slate-800/30' : 'bg-slate-800/50'}
          hover:bg-slate-700/50
          border-l-4 ${config.borderClass}
          rounded-r-lg transition-all duration-150
          list-none [&::-webkit-details-marker]:hidden
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
        `}
      >
        {/* Thumbnail */}
        <div className="relative w-16 h-10 flex-shrink-0 rounded overflow-hidden bg-slate-900">
          {(current || baseline) && (
            <img
              src={current || baseline}
              alt=""
              className="w-full h-full object-cover object-top"
            />
          )}
          {diff && (
            <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white truncate">{name}</span>
            <DiffBadge percentage={diffPercentage} />
          </div>
          <MetaInfo properties={properties} />
        </div>

        {/* Expand indicator */}
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <div className="flex items-center gap-1.5 text-slate-500 group-hover:text-slate-400 transition-colors">
            <span className="text-xs hidden sm:inline opacity-0 group-hover:opacity-100 transition-opacity">
              Details
            </span>
            <svg
              className="w-5 h-5 transition-transform duration-200 group-open:rotate-180"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
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
      <div className="mt-1 p-4 bg-slate-800/20 rounded-lg border border-slate-700/30 animate-[fadeIn_150ms_ease-out]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Baseline */}
          {baseline && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Baseline
                </span>
                <span className="text-xs text-slate-600">Expected</span>
              </div>
              <a
                href={baseline}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden border border-slate-700/50 hover:border-slate-600 transition-colors"
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
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Current
                </span>
                <span className="text-xs text-slate-600">Actual</span>
              </div>
              <a
                href={current}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg overflow-hidden border border-slate-700/50 hover:border-slate-600 transition-colors"
              >
                <img src={current} alt={`${name} current`} className="w-full" />
              </a>
            </div>
          )}
        </div>

        {/* Diff image */}
        {diff && (
          <div className="mt-4 pt-4 border-t border-slate-700/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-red-400 uppercase tracking-wider">
                Difference
              </span>
              {diffPercentage > 0 && (
                <span className="text-xs text-red-400/60 font-mono">
                  {diffPercentage.toFixed(2)}% of pixels changed
                </span>
              )}
            </div>
            <a
              href={diff}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg overflow-hidden border border-red-500/30 hover:border-red-500/50 transition-colors max-w-2xl"
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
          ${isEven ? 'bg-slate-800/30' : 'bg-slate-800/50'}
          hover:bg-slate-700/50
          border-l-4 border-l-blue-500
          rounded-r-lg transition-all duration-150
          list-none [&::-webkit-details-marker]:hidden
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
        `}
      >
        {/* Thumbnail */}
        <div className="w-16 h-10 flex-shrink-0 rounded overflow-hidden bg-slate-900">
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
          <span className="font-medium text-white truncate block">{name}</span>
          <MetaInfo properties={properties} />
        </div>

        {/* Expand indicator */}
        <div className="flex items-center gap-3">
          <StatusBadge status="new" />
          <div className="flex items-center gap-1.5 text-slate-500 group-hover:text-slate-400 transition-colors">
            <span className="text-xs hidden sm:inline opacity-0 group-hover:opacity-100 transition-opacity">
              Preview
            </span>
            <svg
              className="w-5 h-5 transition-transform duration-200 group-open:rotate-180"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
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
      <div className="mt-1 p-4 bg-slate-800/20 rounded-lg border border-slate-700/30 animate-[fadeIn_150ms_ease-out]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">
            New Screenshot
          </span>
          <span className="text-xs text-slate-600">No baseline to compare</span>
        </div>
        {imageSrc && (
          <a
            href={imageSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg overflow-hidden border border-blue-500/30 hover:border-blue-500/50 transition-colors max-w-2xl"
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
        bg-slate-800/20 hover:bg-slate-800/30
        border-l-4 border-l-emerald-500/50
        rounded-r-lg transition-colors
      `}
    >
      {/* Checkmark */}
      <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
        <svg
          className="w-3 h-3 text-emerald-400"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {/* Name */}
      <span className="flex-1 text-sm text-slate-300 truncate">{name}</span>

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
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
        {title}
      </h3>
      <span className="text-sm text-slate-500 font-mono">({count})</span>
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
        ${hasIssues ? 'bg-slate-800/60 border border-slate-700/50' : 'bg-emerald-500/10 border border-emerald-500/20'}
      `}
    >
      {/* Status indicator */}
      <div className="flex items-center gap-3">
        {hasIssues ? (
          <>
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <span className="text-amber-400 text-lg">◐</span>
            </div>
            <div>
              <div className="text-white font-semibold">Review Required</div>
              <div className="text-sm text-slate-400">
                {stats.failed + (stats.new || 0)} items need attention
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-emerald-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <div className="text-white font-semibold">All Tests Passed</div>
              <div className="text-sm text-slate-400">
                No visual changes detected
              </div>
            </div>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 ml-auto">
        <div className="text-center">
          <div className="text-2xl font-bold text-white tabular-nums">
            {stats.total}
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">
            Total
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-emerald-400 tabular-nums">
            {stats.passed}
          </div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">
            Passed
          </div>
        </div>
        {stats.failed > 0 && (
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400 tabular-nums">
              {stats.failed}
            </div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">
              Changed
            </div>
          </div>
        )}
        {(stats.new || 0) > 0 && (
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400 tabular-nums">
              {stats.new}
            </div>
            <div className="text-xs text-slate-500 uppercase tracking-wider">
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
    <header className="bg-slate-950/80 backdrop-blur-sm border-b border-slate-800/60 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/20">
            <svg
              className="w-5 h-5 text-slate-900"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
            </svg>
          </div>
          <div>
            <div className="text-lg font-semibold text-white tracking-tight">
              Vizzly
            </div>
            <div className="text-xs text-slate-500">Visual Test Report</div>
          </div>
        </div>

        {/* Timestamp */}
        {timestamp && (
          <div className="text-xs text-slate-500 tabular-nums">
            {formatTimestamp(timestamp)}
          </div>
        )}
      </div>
    </header>
  );
}

export default function StaticReportView({ reportData }) {
  if (!reportData || !reportData.comparisons) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-medium mb-2">No Report Data</div>
          <p className="text-slate-400">
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
    new: comparisons.filter(c => c.status === 'new').length,
    error: comparisons.filter(c => c.status === 'error').length,
  };

  // Group comparisons by status
  let failed = comparisons.filter(c => c.status === 'failed');
  let newItems = comparisons.filter(c => c.status === 'new');
  let passed = comparisons.filter(c => c.status === 'passed');
  let errors = comparisons.filter(c => c.status === 'error');

  return (
    <div className="min-h-screen bg-slate-900 text-white">
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
              colorClass="text-red-400"
            />
            <div className="space-y-2">
              {failed.map((comparison, index) => (
                <FailedComparison
                  key={comparison.id || comparison.signature || `failed-${index}`}
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
              colorClass="text-blue-400"
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
              colorClass="text-orange-400"
            />
            <div className="space-y-2">
              {errors.map((comparison, index) => (
                <FailedComparison
                  key={comparison.id || comparison.signature || `error-${index}`}
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
                  <span className="text-lg font-mono text-emerald-400">✓</span>
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    Passed
                  </h3>
                  <span className="text-sm text-slate-500 font-mono">
                    ({passed.length})
                  </span>
                  <svg
                    className="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180 ml-auto"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
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
        <footer className="mt-12 pt-6 border-t border-slate-800/60 text-center">
          <p className="text-sm text-slate-500">
            Visual regression report generated by{' '}
            <a
              href="https://vizzly.dev"
              className="text-amber-400 hover:text-amber-300 transition-colors"
            >
              Vizzly
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
