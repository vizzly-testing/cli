import {
  CheckCircleIcon,
  ChevronRightIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { useMemo } from 'react';
import { Badge, Button } from '../design-system/index.js';
import SmartImage from '../ui/smart-image.jsx';

/**
 * Group comparisons by name and calculate aggregate stats
 */
function groupComparisons(comparisons) {
  let grouped = new Map();

  for (let comp of comparisons) {
    let name = comp.name || comp.originalName || 'Unknown';

    if (!grouped.has(name)) {
      grouped.set(name, {
        name,
        comparisons: [],
        browsers: new Set(),
        viewports: [],
        hasChanges: false,
        hasNew: false,
        allPassed: true,
        maxDiff: 0,
        failedCount: 0,
        newCount: 0,
        passedCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
      });
    }

    let group = grouped.get(name);
    group.comparisons.push(comp);

    // Track browsers
    if (comp.properties?.browser) {
      group.browsers.add(comp.properties.browser);
    }

    // Track viewports with dimensions
    if (comp.properties?.viewport_width && comp.properties?.viewport_height) {
      group.viewports.push({
        width: comp.properties.viewport_width,
        height: comp.properties.viewport_height,
        id: comp.id,
        status: comp.status,
      });
    }

    // Aggregate stats
    if (comp.status === 'failed') {
      group.hasChanges = true;
      group.allPassed = false;
      group.failedCount++;
      group.maxDiff = Math.max(group.maxDiff, comp.diffPercentage || 0);
    } else if (comp.status === 'new' || comp.status === 'baseline-created') {
      group.hasNew = true;
      group.allPassed = false;
      group.newCount++;
    } else if (comp.status === 'passed') {
      group.passedCount++;
    }

    // Track user actions
    if (comp.userAction === 'accepted') {
      group.acceptedCount++;
    } else if (comp.userAction === 'rejected') {
      group.rejectedCount++;
    }
  }

  // Convert to array and sort
  return Array.from(grouped.values())
    .map(group => ({
      ...group,
      browsers: Array.from(group.browsers),
      // Sort viewports by size (largest first)
      viewports: group.viewports.sort(
        (a, b) => b.width * b.height - a.width * a.height
      ),
      // Use first comparison as primary
      primary: group.comparisons[0],
    }))
    .sort((a, b) => {
      // Failed first, then new, then passed
      if (a.hasChanges && !b.hasChanges) return -1;
      if (!a.hasChanges && b.hasChanges) return 1;
      if (a.hasNew && !b.hasNew) return -1;
      if (!a.hasNew && b.hasNew) return 1;
      // Then by max diff (highest first)
      if (a.maxDiff !== b.maxDiff) return b.maxDiff - a.maxDiff;
      // Finally alphabetical
      return a.name.localeCompare(b.name);
    });
}

/**
 * Device icon based on viewport width
 */
function DeviceIcon({ width, className = 'w-3.5 h-3.5' }) {
  if (width <= 480) {
    return <DevicePhoneMobileIcon className={className} />;
  }
  if (width <= 1024) {
    return <DeviceTabletIcon className={className} />;
  }
  return <ComputerDesktopIcon className={className} />;
}

/**
 * Status badge for a group
 */
function GroupStatus({ group }) {
  if (group.acceptedCount === group.comparisons.length) {
    return (
      <Badge variant="success" size="sm">
        <CheckCircleIcon className="w-3 h-3 mr-1" />
        Accepted
      </Badge>
    );
  }

  if (group.rejectedCount > 0) {
    return (
      <Badge variant="warning" size="sm">
        <XCircleIcon className="w-3 h-3 mr-1" />
        Rejected
      </Badge>
    );
  }

  if (group.hasChanges) {
    return (
      <Badge variant="danger" size="sm">
        {group.failedCount} changed
      </Badge>
    );
  }

  if (group.hasNew) {
    return (
      <Badge variant="info" size="sm">
        {group.newCount} new
      </Badge>
    );
  }

  return (
    <Badge variant="success" size="sm">
      Passed
    </Badge>
  );
}

/**
 * Variant chips showing browser/viewport combinations
 */
function VariantChips({ group, maxVisible = 4 }) {
  let totalVariants = group.comparisons.length;

  if (totalVariants <= 1) {
    // Single variant - show browser and viewport inline
    let viewport = group.viewports[0];
    let browser = group.browsers[0];

    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        {viewport && (
          <span className="inline-flex items-center gap-1">
            <DeviceIcon width={viewport.width} className="w-3 h-3" />
            {viewport.width}×{viewport.height}
          </span>
        )}
        {browser && <span>{browser}</span>}
      </div>
    );
  }

  // Multiple variants - show compact chips
  let visibleViewports = group.viewports.slice(0, maxVisible);
  let remainingCount = totalVariants - maxVisible;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {visibleViewports.map((vp, idx) => (
        <span
          key={idx}
          className={`
            inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium
            ${
              vp.status === 'failed'
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : vp.status === 'new' || vp.status === 'baseline-created'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
            }
          `}
        >
          <DeviceIcon width={vp.width} className="w-2.5 h-2.5" />
          {vp.width}
        </span>
      ))}
      {remainingCount > 0 && (
        <span className="text-[10px] text-slate-500">
          +{remainingCount} more
        </span>
      )}
      {group.browsers.length > 0 && (
        <span className="text-[10px] text-slate-500 ml-1">
          · {group.browsers.join(', ')}
        </span>
      )}
    </div>
  );
}

/**
 * Screenshot group row - click to view, actions inline
 */
function ScreenshotGroupRow({
  group,
  onSelect,
  onAcceptGroup,
  onRejectGroup,
  isAccepting,
}) {
  let { primary, hasChanges, hasNew, maxDiff } = group;
  let needsAction = hasChanges || hasNew;
  let thumbnailSrc = primary.current || primary.baseline;

  // Border color based on status
  let borderClass = hasChanges
    ? 'border-red-500/40 hover:border-red-500/60'
    : hasNew
      ? 'border-blue-500/40 hover:border-blue-500/60'
      : 'border-slate-700/50 hover:border-slate-600';

  return (
    <div
      className={`
        group flex items-center gap-3 p-3
        bg-slate-800/30 hover:bg-slate-800/50
        border rounded-lg transition-all
        ${borderClass}
      `}
    >
      {/* Thumbnail - clickable */}
      <button
        type="button"
        onClick={() => onSelect(primary)}
        className="relative w-16 h-11 rounded-md overflow-hidden flex-shrink-0 bg-slate-900 hover:ring-2 hover:ring-amber-500/50 transition-all"
      >
        {thumbnailSrc ? (
          <SmartImage
            src={thumbnailSrc}
            alt={group.name}
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            <ComputerDesktopIcon className="w-5 h-5" />
          </div>
        )}
        {/* Overlay for failed/new */}
        {hasChanges && (
          <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          </div>
        )}
        {!hasChanges && hasNew && (
          <div className="absolute inset-0 bg-blue-500/10" />
        )}
        {/* Variant count badge */}
        {group.comparisons.length > 1 && (
          <div className="absolute bottom-0.5 right-0.5 px-1 py-0.5 text-[9px] font-bold bg-slate-900/90 text-slate-300 rounded">
            {group.comparisons.length}
          </div>
        )}
      </button>

      {/* Name and variants - clickable */}
      <button
        type="button"
        onClick={() => onSelect(primary)}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-white truncate">
            {group.name}
          </h3>
          {maxDiff > 0 && (
            <span className="text-xs font-mono text-red-400">
              {maxDiff.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="mt-1">
          <VariantChips group={group} />
        </div>
      </button>

      {/* Status and Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <GroupStatus group={group} />

        {/* Action buttons - show on hover or when needs action */}
        {needsAction && (
          <div
            className={`flex items-center gap-1 ${group.acceptedCount === 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={e => {
                e.stopPropagation();
                onAcceptGroup(group);
              }}
              disabled={isAccepting}
              className="!p-1.5 text-emerald-400 hover:bg-emerald-500/20"
              title={`Accept ${group.comparisons.length > 1 ? `all ${group.comparisons.length} variants` : ''}`}
            >
              <CheckCircleIcon className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={e => {
                e.stopPropagation();
                onRejectGroup(group);
              }}
              disabled={isAccepting}
              className="!p-1.5 text-red-400 hover:bg-red-500/20"
              title="Reject"
            >
              <XCircleIcon className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Chevron */}
        <ChevronRightIcon className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
      </div>
    </div>
  );
}

/**
 * Screenshot list for TDD mode
 * Groups screenshots by name, shows variants inline
 * Click to open fullscreen comparison viewer
 */
export default function ScreenshotList({
  comparisons,
  onSelectComparison,
  onAcceptComparison,
  onRejectComparison,
  loadingStates = {},
}) {
  let groups = useMemo(() => {
    if (!comparisons || comparisons.length === 0) return [];
    return groupComparisons(comparisons);
  }, [comparisons]);

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        No screenshots to display
      </div>
    );
  }

  let handleAcceptGroup = group => {
    if (!onAcceptComparison) return;
    for (let comp of group.comparisons) {
      onAcceptComparison(comp.id || comp.signature || comp.name);
    }
  };

  let handleRejectGroup = group => {
    if (!onRejectComparison) return;
    for (let comp of group.comparisons) {
      onRejectComparison(comp.id || comp.signature || comp.name);
    }
  };

  // Check if any items are currently being accepted
  let isAccepting = Object.values(loadingStates).some(s => s === 'accepting');

  return (
    <div className="space-y-2">
      {groups.map(group => (
        <ScreenshotGroupRow
          key={group.name}
          group={group}
          onSelect={onSelectComparison}
          onAcceptGroup={handleAcceptGroup}
          onRejectGroup={handleRejectGroup}
          isAccepting={isAccepting}
        />
      ))}
    </div>
  );
}
