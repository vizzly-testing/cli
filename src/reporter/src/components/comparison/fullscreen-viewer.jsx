import {
  ArrowsPointingInIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VIEW_MODES } from '../../utils/constants.js';
import { ScreenshotDisplay } from './screenshot-display.jsx';

/**
 * Get a stable ID for a comparison, falling back to signature or name
 */
function getComparisonId(comparison) {
  return comparison?.id || comparison?.signature || comparison?.name;
}

/**
 * Zoom Controls Component - matches Observatory design exactly
 */
function ZoomControls({ zoom, onZoomChange }) {
  const zoomIn = useCallback(() => {
    if (zoom === 'fit') {
      onZoomChange(0.75);
    } else {
      onZoomChange(Math.min(3, zoom + 0.25));
    }
  }, [zoom, onZoomChange]);

  const zoomOut = useCallback(() => {
    if (zoom === 'fit') {
      onZoomChange(0.5);
    } else {
      onZoomChange(Math.max(0.1, zoom - 0.25));
    }
  }, [zoom, onZoomChange]);

  const fitToScreen = useCallback(() => {
    onZoomChange('fit');
  }, [onZoomChange]);

  const actualSize = useCallback(() => {
    onZoomChange(1);
  }, [onZoomChange]);

  const displayValue = zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`;

  return (
    <div className="flex items-center gap-2">
      {/* Compact zoom controls */}
      <div className="flex items-center bg-gray-800/90 backdrop-blur-md rounded-lg border border-gray-600/40 shadow-lg">
        <button
          type="button"
          onClick={zoomOut}
          className="p-2 text-gray-300 hover:text-white hover:bg-gray-700/60 rounded-l-lg transition-colors"
          title="Zoom out (−)"
        >
          <MagnifyingGlassMinusIcon className="w-4 h-4" />
        </button>

        <div className="px-3 py-1.5 min-w-[60px] text-center text-sm font-medium text-gray-200">
          {displayValue}
        </div>

        <button
          type="button"
          onClick={zoomIn}
          className="p-2 text-gray-300 hover:text-white hover:bg-gray-700/60 rounded-r-lg transition-colors"
          title="Zoom in (+)"
        >
          <MagnifyingGlassPlusIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Quick action buttons */}
      <button
        type="button"
        onClick={fitToScreen}
        className={`p-2 rounded-lg transition-colors ${
          zoom === 'fit'
            ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40'
            : 'bg-gray-800/90 text-gray-300 hover:text-white hover:bg-gray-700/60 border border-gray-600/40'
        }`}
        title="Fit to screen"
      >
        <ArrowsPointingInIcon className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={actualSize}
        className={`p-2 rounded-lg transition-colors ${
          zoom === 1
            ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40'
            : 'bg-gray-800/90 text-gray-300 hover:text-white hover:bg-gray-700/60 border border-gray-600/40'
        }`}
        title="Actual size"
      >
        <span className="text-xs font-bold w-4 h-4 flex items-center justify-center">
          1:1
        </span>
      </button>
    </div>
  );
}

/**
 * Filmstrip thumbnail component - matches Observatory design
 */
function FilmstripThumbnail({ comparison, isActive, onClick, index }) {
  const thumbnailSrc = comparison.current || comparison.baseline;
  const isFailed = comparison.status === 'failed';
  const isNew =
    comparison.status === 'new' || comparison.status === 'baseline-created';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-shrink-0 group transition-all duration-200 ${
        isActive
          ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900 rounded-lg scale-110'
          : 'hover:ring-2 hover:ring-gray-500 hover:ring-offset-2 hover:ring-offset-gray-900 rounded-lg opacity-60 hover:opacity-100'
      }`}
      title={comparison.name || `Screenshot ${index + 1}`}
    >
      <div className="relative w-14 h-20 bg-gray-800 rounded-lg overflow-hidden">
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={comparison.name || 'Thumbnail'}
            className="absolute inset-0 w-full h-full object-cover object-top"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center">
            <span className="text-lg font-medium text-gray-500">
              {comparison.name ? comparison.name.charAt(0).toUpperCase() : '?'}
            </span>
          </div>
        )}

        {/* Change type badge */}
        {isNew && (
          <div className="absolute bottom-1 left-1 px-1 py-0.5 bg-blue-600/90 rounded text-[9px] font-bold text-white shadow-sm">
            NEW
          </div>
        )}
        {isFailed && !isNew && (
          <div className="absolute bottom-1 left-1 px-1 py-0.5 bg-amber-600/90 rounded text-[9px] font-bold text-white shadow-sm">
            DIFF
          </div>
        )}
      </div>

      {/* Hover tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 border border-gray-700 text-xs text-gray-200 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg">
        {comparison.name || `Screenshot ${index + 1}`}
      </div>
    </button>
  );
}

/**
 * Fullscreen comparison viewer - mirrors the Vizzly cloud product UI exactly
 * Displays a single comparison with navigation between screenshots
 */
export default function FullscreenViewer({
  comparison,
  comparisons = [],
  onClose,
  onAccept,
  onReject,
  onNavigate,
}) {
  const [viewMode, setViewMode] = useState(VIEW_MODES.OVERLAY);
  const [showMetadata, setShowMetadata] = useState(false);
  const [zoomLevel, setZoomLevel] = useState('fit'); // 'fit' | number
  const [showDiffOverlay, setShowDiffOverlay] = useState(true);
  const [onionSkinPosition, setOnionSkinPosition] = useState(50);
  const filmstripRef = useRef(null);

  // Sort comparisons: failed (diffs) first, then new, then passed
  // Uses initialStatus to keep order stable after approval
  const sortedComparisons = useMemo(() => {
    const statusOrder = { failed: 0, new: 1, 'baseline-created': 1, passed: 2 };
    return [...comparisons].sort((a, b) => {
      // Use initialStatus for sorting to keep order stable after approval
      const statusA = a.initialStatus || a.status;
      const statusB = b.initialStatus || b.status;
      const orderA = statusOrder[statusA] ?? 3;
      const orderB = statusOrder[statusB] ?? 3;
      return orderA - orderB;
    });
  }, [comparisons]);

  // Find current index in sorted list
  const currentIndex = useMemo(() => {
    const compId = getComparisonId(comparison);
    return sortedComparisons.findIndex(
      (c, i) => getComparisonId(c, i) === compId
    );
  }, [comparison, sortedComparisons]);

  // Navigation capabilities
  const canNavigate = useMemo(
    () => ({
      prev: currentIndex > 0,
      next: currentIndex < sortedComparisons.length - 1,
    }),
    [currentIndex, sortedComparisons.length]
  );

  // Navigation handlers
  const handlePrevious = useCallback(() => {
    if (canNavigate.prev && sortedComparisons[currentIndex - 1]) {
      onNavigate(sortedComparisons[currentIndex - 1]);
    }
  }, [canNavigate.prev, sortedComparisons, currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (canNavigate.next && sortedComparisons[currentIndex + 1]) {
      onNavigate(sortedComparisons[currentIndex + 1]);
    }
  }, [canNavigate.next, sortedComparisons, currentIndex, onNavigate]);

  // Scroll filmstrip to active thumbnail
  useEffect(() => {
    if (filmstripRef.current && currentIndex >= 0) {
      const container = filmstripRef.current;
      const thumbnails = container.children;
      if (thumbnails[currentIndex]) {
        const thumb = thumbnails[currentIndex];
        const containerRect = container.getBoundingClientRect();
        const thumbRect = thumb.getBoundingClientRect();

        if (
          thumbRect.left < containerRect.left ||
          thumbRect.right > containerRect.right
        ) {
          thumb.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
          });
        }
      }
    }
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (canNavigate.prev) handlePrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (canNavigate.next) handleNext();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canNavigate, handlePrevious, handleNext, onClose]);

  if (!comparison) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-white font-medium mb-2">
            Comparison not found
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            Return to list
          </button>
        </div>
      </div>
    );
  }

  // Show actions for comparisons that can be approved/rejected
  // - failed: needs review, can approve (accept change) or reject
  // - passed: auto-matched baseline, can still reject if needed
  // - rejected: previously rejected, can still change decision
  // - new/baseline-created: no baseline to compare, no approve/reject needed
  const canReview =
    comparison.status === 'failed' ||
    comparison.status === 'passed' ||
    comparison.status === 'rejected';

  // Determine current approval state:
  // - comparison.userAction reflects the user's explicit decision (from server)
  // - comparison.status reflects persisted state
  // - passed comparisons are implicitly approved unless user rejected
  const isAccepted =
    comparison.userAction === 'accepted' ||
    (comparison.status === 'passed' && comparison.userAction !== 'rejected');
  const isRejected =
    comparison.userAction === 'rejected' || comparison.status === 'rejected';

  // View mode options
  const viewModes = [
    { value: VIEW_MODES.OVERLAY, label: 'Overlay' },
    { value: VIEW_MODES.TOGGLE, label: 'Toggle' },
    { value: VIEW_MODES.ONION, label: 'Slide' },
  ];

  // Properties for dropdown
  const props = [];
  if (comparison.properties?.browser)
    props.push({ key: 'Browser', value: comparison.properties.browser });
  if (
    comparison.properties?.viewport_width &&
    comparison.properties?.viewport_height
  ) {
    props.push({
      key: 'Viewport',
      value: `${comparison.properties.viewport_width}×${comparison.properties.viewport_height}`,
    });
  }
  if (comparison.properties?.device)
    props.push({ key: 'Device', value: comparison.properties.device });

  return (
    <div
      className="fixed inset-0 bg-gray-900 z-50 flex flex-col"
      data-testid="fullscreen-viewer"
    >
      {/* Header Bar - matches Observatory design exactly */}
      <div className="flex-shrink-0 bg-gray-900/95 backdrop-blur-md border-b border-gray-800/50 z-30">
        <div className="px-4 py-2.5 flex items-center justify-between gap-2">
          {/* Left: Close and Navigation */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700/60 transition-colors"
              title="Back (Esc)"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>

            {/* Navigation */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevious}
                disabled={!canNavigate.prev}
                className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg hover:bg-gray-700/60 transition-colors"
                title="Previous (←)"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-500 font-medium tabular-nums min-w-[3rem] text-center">
                {currentIndex + 1}/{sortedComparisons.length}
              </span>
              <button
                type="button"
                onClick={handleNext}
                disabled={!canNavigate.next}
                className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg hover:bg-gray-700/60 transition-colors"
                title="Next (→)"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="h-5 w-px bg-gray-700/50" />

            {/* Screenshot Name */}
            <h1 className="text-sm font-medium text-gray-200 truncate max-w-[300px]">
              {comparison.name || comparison.originalName || 'Unknown'}
            </h1>

            {/* Metadata toggle */}
            {props.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMetadata(!showMetadata)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                <span>{props.length} props</span>
                <ChevronDownIcon
                  className={`w-3 h-3 transition-transform ${showMetadata ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>

          {/* Center: Approval Actions - always show both buttons, highlight selected */}
          {canReview && (
            <div className="flex items-center bg-gray-800/60 rounded-lg p-0.5 border border-gray-700/50">
              <button
                type="button"
                onClick={() => onReject(getComparisonId(comparison))}
                data-testid="btn-reject"
                data-active={isRejected}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  isRejected
                    ? 'bg-red-600 text-white'
                    : 'text-red-400 hover:text-red-300 hover:bg-red-600/20'
                }`}
              >
                <span className="w-1.5 h-1.5 bg-current rounded-full" />
                Reject
              </button>
              <button
                type="button"
                onClick={() => onAccept(getComparisonId(comparison))}
                data-testid="btn-approve"
                data-active={isAccepted}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  isAccepted
                    ? 'bg-green-600 text-white'
                    : 'text-green-400 hover:text-green-300 hover:bg-green-600/20'
                }`}
              >
                <span className="w-1.5 h-1.5 bg-current rounded-full" />
                Approve
              </button>
            </div>
          )}

          {/* Right: Zoom Controls and View Modes */}
          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <ZoomControls zoom={zoomLevel} onZoomChange={setZoomLevel} />

            {/* View Mode Toggle - hidden on mobile, shown on larger screens */}
            <div className="hidden sm:flex items-center bg-gray-800/60 rounded-lg p-0.5 border border-gray-700/50">
              {viewModes.map(mode => (
                <button
                  type="button"
                  key={mode.value}
                  onClick={() => comparison.diff && setViewMode(mode.value)}
                  disabled={!comparison.diff}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                    !comparison.diff
                      ? 'text-gray-600 cursor-not-allowed'
                      : viewMode === mode.value
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700/60'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Expandable Metadata Panel - matches Observatory */}
        {showMetadata && props.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-800/50 bg-gray-900/50">
            <div className="flex flex-wrap gap-2">
              {props.map(prop => (
                <span
                  key={prop.key}
                  className="inline-flex items-center px-2 py-0.5 bg-gray-800/60 text-xs rounded-md"
                >
                  <span className="text-gray-500">{prop.key}:</span>
                  <span className="ml-1 text-gray-300">{prop.value}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScreenshotDisplay
          key={getComparisonId(comparison)}
          comparison={comparison}
          viewMode={viewMode === VIEW_MODES.ONION ? 'onion-skin' : viewMode}
          showDiffOverlay={showDiffOverlay}
          onDiffToggle={() => setShowDiffOverlay(prev => !prev)}
          onionSkinPosition={onionSkinPosition}
          onOnionSkinChange={setOnionSkinPosition}
          zoom={zoomLevel}
          disableLoadingOverlay={true}
          className="w-full h-full"
        />
      </div>

      {/* Filmstrip Navigation */}
      <div className="flex-shrink-0 bg-gray-900 border-t border-gray-800/50">
        <div className="px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Screenshot count */}
            <div className="text-sm text-gray-500 flex-shrink-0">
              {currentIndex + 1} of {sortedComparisons.length}
            </div>

            {/* Filmstrip */}
            <div
              ref={filmstripRef}
              className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-hide py-1"
            >
              {sortedComparisons.map((comp, index) => (
                <FilmstripThumbnail
                  key={getComparisonId(comp, index)}
                  comparison={comp}
                  index={index}
                  isActive={index === currentIndex}
                  onClick={() => onNavigate(comp)}
                />
              ))}
            </div>

            {/* Keyboard hints */}
            <div className="hidden md:flex items-center gap-3 text-xs text-gray-500 flex-shrink-0">
              <span>
                Use{' '}
                <kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">
                  ←
                </kbd>{' '}
                <kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400">
                  →
                </kbd>{' '}
                to navigate
              </span>
              <ChevronDownIcon className="w-4 h-4 rotate-[-90deg]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
