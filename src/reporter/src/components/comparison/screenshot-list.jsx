import {
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import SmartImage from '../ui/smart-image.jsx';

/**
 * Get a stable ID for a comparison, falling back to signature or index
 */
function getComparisonId(comparison, index) {
  return comparison.id || comparison.signature || `comparison-${index}`;
}

/**
 * Status indicator dot with appropriate color
 */
function StatusDot({ status }) {
  let colors = {
    failed: 'bg-red-500',
    passed: 'bg-emerald-500',
    new: 'bg-blue-500',
    'baseline-created': 'bg-blue-500',
  };

  return (
    <span
      className={`w-2.5 h-2.5 rounded-full ${colors[status] || 'bg-slate-500'}`}
    />
  );
}

/**
 * Status badge for accepted/rejected state
 */
function ActionBadge({ userAction }) {
  if (userAction === 'accepted') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
        <CheckCircleIcon className="w-3 h-3" />
        Accepted
      </span>
    );
  }
  if (userAction === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">
        <ExclamationCircleIcon className="w-3 h-3" />
        Rejected
      </span>
    );
  }
  return null;
}

/**
 * Get viewport string from comparison properties
 */
function getViewport(comparison) {
  if (
    comparison.properties?.viewport_width &&
    comparison.properties?.viewport_height
  ) {
    return `${comparison.properties.viewport_width}×${comparison.properties.viewport_height}`;
  }
  if (comparison.properties?.viewport) {
    return `${comparison.properties.viewport.width}×${comparison.properties.viewport.height}`;
  }
  return null;
}

/**
 * Individual screenshot row - clickable to open fullscreen viewer
 */
function ScreenshotRow({ comparison, onClick, userAction }) {
  let viewport = getViewport(comparison);
  let browser = comparison.properties?.browser;
  let isFailed = comparison.status === 'failed';
  let isNew =
    comparison.status === 'new' || comparison.status === 'baseline-created';

  // Choose the best image to show as thumbnail
  let thumbnailSrc = comparison.current || comparison.baseline;

  return (
    <button
      onClick={() => onClick(comparison)}
      className={`
        w-full flex items-center gap-3 md:gap-4 p-3 md:p-4
        bg-white/5 hover:bg-white/10 active:bg-white/15
        border rounded-lg transition-all duration-150
        touch-manipulation text-left
        ${isFailed ? 'border-red-500/40 hover:border-red-500/60' : 'border-slate-700/50 hover:border-slate-600'}
      `}
    >
      {/* Thumbnail */}
      <div
        className={`
          relative w-16 h-12 md:w-20 md:h-14 rounded-md overflow-hidden flex-shrink-0 bg-slate-800
          ${isFailed ? 'ring-2 ring-red-500/50' : isNew ? 'ring-2 ring-blue-500/50' : ''}
        `}
      >
        {thumbnailSrc ? (
          <SmartImage
            src={thumbnailSrc}
            alt={comparison.name || 'Screenshot'}
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
        {/* Status overlay for failed/new */}
        {isFailed && (
          <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
          </div>
        )}
        {isNew && (
          <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
            <span className="text-[10px] font-bold text-blue-400 bg-blue-900/80 px-1.5 py-0.5 rounded">
              NEW
            </span>
          </div>
        )}
      </div>

      {/* Name and metadata */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base md:text-lg font-medium text-white truncate">
            {comparison.name || comparison.originalName || 'Unknown'}
          </h3>
          <StatusDot status={comparison.status} />
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-400">
          {browser && (
            <span className="bg-slate-700/50 px-2 py-0.5 rounded">
              {browser}
            </span>
          )}
          {viewport && (
            <span className="bg-slate-700/50 px-2 py-0.5 rounded">
              {viewport}
            </span>
          )}
          {comparison.diffPercentage > 0 && (
            <span className="text-red-400">
              {comparison.diffPercentage.toFixed(2)}% diff
            </span>
          )}
        </div>
      </div>

      {/* Action badge */}
      <div className="flex-shrink-0">
        <ActionBadge userAction={userAction} />
      </div>

      {/* Chevron indicator */}
      <div className="flex-shrink-0 text-slate-500">
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </button>
  );
}

/**
 * Screenshot list component - simple scannable list
 * Click any row to open the fullscreen comparison viewer
 */
export default function ScreenshotList({
  comparisons,
  onSelectComparison,
  loadingStates = {},
}) {
  if (!comparisons || comparisons.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        No screenshots to display
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {comparisons.map((comparison, index) => {
        let stableId = getComparisonId(comparison, index);
        return (
          <ScreenshotRow
            key={stableId}
            comparison={{ ...comparison, id: stableId }}
            onClick={onSelectComparison}
            userAction={loadingStates[stableId]}
          />
        );
      })}
    </div>
  );
}
