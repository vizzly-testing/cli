import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
} from '@heroicons/react/24/outline';
import ComparisonViewer from './comparison-viewer.jsx';
import { VIEW_MODES } from '../../utils/constants.js';

/**
 * Get a stable ID for a comparison, falling back to signature or index
 */
function getComparisonId(comparison, index = 0) {
  return comparison?.id || comparison?.signature || `comparison-${index}`;
}

/**
 * Filmstrip thumbnail component
 */
function FilmstripThumbnail({ comparison, isActive, onClick, index }) {
  let thumbnailSrc = comparison.current || comparison.baseline;
  let isFailed = comparison.status === 'failed';
  let isNew =
    comparison.status === 'new' || comparison.status === 'baseline-created';

  return (
    <button
      onClick={onClick}
      className={`
        relative flex-shrink-0 w-16 h-12 rounded overflow-hidden transition-all duration-150
        ${isActive ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900' : 'opacity-60 hover:opacity-100'}
      `}
      title={comparison.name || `Screenshot ${index + 1}`}
    >
      {thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt={comparison.name || 'Thumbnail'}
          className="w-full h-full object-cover object-top"
        />
      ) : (
        <div className="w-full h-full bg-gray-700 flex items-center justify-center">
          <span className="text-[8px] text-gray-500">No image</span>
        </div>
      )}
      {/* Status badge */}
      {isFailed && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-red-600/80 to-transparent px-1 py-0.5">
          <span className="text-[8px] font-bold text-white uppercase tracking-wide">
            DIFF
          </span>
        </div>
      )}
      {isNew && (
        <div className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center">
          <span className="text-[6px] font-bold text-white">✓</span>
        </div>
      )}
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
  userAction,
}) {
  let [viewMode, setViewMode] = useState(VIEW_MODES.OVERLAY);
  let [showPropsDropdown, setShowPropsDropdown] = useState(false);
  let [zoomLevel, setZoomLevel] = useState('fit'); // 'fit' | '1:1' | number
  let filmstripRef = useRef(null);

  // Find current index and group info using stable IDs
  let { currentIndex } = useMemo(() => {
    let compId = getComparisonId(comparison);
    let index = comparisons.findIndex(
      (c, i) => getComparisonId(c, i) === compId
    );

    return { currentIndex: index };
  }, [comparison, comparisons]);

  // Navigation capabilities
  let canNavigate = useMemo(
    () => ({
      prev: currentIndex > 0,
      next: currentIndex < comparisons.length - 1,
    }),
    [currentIndex, comparisons.length]
  );

  // Navigation handlers
  let handlePrevious = useCallback(() => {
    if (canNavigate.prev && comparisons[currentIndex - 1]) {
      onNavigate(comparisons[currentIndex - 1]);
    }
  }, [canNavigate.prev, comparisons, currentIndex, onNavigate]);

  let handleNext = useCallback(() => {
    if (canNavigate.next && comparisons[currentIndex + 1]) {
      onNavigate(comparisons[currentIndex + 1]);
    }
  }, [canNavigate.next, comparisons, currentIndex, onNavigate]);

  // Scroll filmstrip to active thumbnail
  useEffect(() => {
    if (filmstripRef.current && currentIndex >= 0) {
      let container = filmstripRef.current;
      let thumbnails = container.children;
      if (thumbnails[currentIndex]) {
        let thumb = thumbnails[currentIndex];
        let containerRect = container.getBoundingClientRect();
        let thumbRect = thumb.getBoundingClientRect();

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
    let handleKeyDown = e => {
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
        <div className="text-center text-gray-400">
          <div className="text-lg mb-2">Comparison not found</div>
          <button
            onClick={onClose}
            className="text-blue-400 hover:text-blue-300"
          >
            Return to list
          </button>
        </div>
      </div>
    );
  }

  let showActions = comparison.status === 'failed' && !userAction;
  let isAccepted = userAction === 'accepted';
  let isRejected = userAction === 'rejected';

  // View mode options
  let viewModes = [
    { value: VIEW_MODES.OVERLAY, label: 'Overlay' },
    { value: VIEW_MODES.TOGGLE, label: 'Toggle' },
    { value: VIEW_MODES.ONION, label: 'Slide' },
  ];

  // Properties for dropdown
  let props = [];
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
      {/* Header Bar - matches cloud product exactly */}
      <div className="flex-shrink-0 bg-gray-900 border-b border-gray-700/50">
        <div className="px-4 py-3 relative">
          {/* Top Row: Navigation, Title, Props */}
          <div className="flex items-center justify-between">
            {/* Left: Close, Nav, Count, Title */}
            <div className="flex items-center gap-2">
              {/* Close Button */}
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700/60 transition-all"
                title="Close (Esc)"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>

              {/* Navigation with count */}
              <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg px-1">
                <button
                  onClick={handlePrevious}
                  disabled={!canNavigate.prev}
                  className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded transition-all"
                  title="Previous (←)"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>

                <span className="text-sm text-gray-300 font-medium px-2 tabular-nums">
                  {currentIndex + 1}/{comparisons.length}
                </span>

                <button
                  onClick={handleNext}
                  disabled={!canNavigate.next}
                  className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded transition-all"
                  title="Next (→)"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Screenshot Name */}
              <h1 className="text-base font-semibold text-white ml-2 truncate max-w-md">
                {comparison.name || comparison.originalName || 'Unknown'}
              </h1>

              {/* Props Dropdown */}
              {props.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowPropsDropdown(!showPropsDropdown)}
                    className="flex items-center gap-1 px-2 py-1 text-sm text-gray-400 hover:text-white rounded hover:bg-gray-700/50 transition-all"
                  >
                    <span>{props.length} props</span>
                    <ChevronDownIcon className="w-3 h-3" />
                  </button>

                  {showPropsDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowPropsDropdown(false)}
                      />
                      <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 min-w-[160px]">
                        {props.map((prop, i) => (
                          <div
                            key={i}
                            className="px-3 py-2 text-sm border-b border-gray-700/50 last:border-0"
                          >
                            <span className="text-gray-500">{prop.key}:</span>
                            <span className="text-gray-200 ml-2">
                              {prop.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Center: Action Buttons */}
            <div className="flex items-center gap-3">
              {/* Reject/Accept */}
              {showActions && (
                <div className="flex items-center bg-gray-800/60 rounded-lg p-1 border border-gray-700/50">
                  <button
                    onClick={() => onReject(getComparisonId(comparison))}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all text-red-400 hover:text-red-300 hover:bg-red-600/20"
                  >
                    <span className="w-2 h-2 bg-current rounded-full" />
                    Reject
                  </button>

                  <button
                    onClick={() => onAccept(getComparisonId(comparison))}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all bg-green-600 text-white hover:bg-green-500"
                  >
                    <span className="w-2 h-2 bg-current rounded-full" />
                    Approve
                  </button>
                </div>
              )}

              {/* Show accepted/rejected state */}
              {isAccepted && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 text-white">
                  <CheckIcon className="w-4 h-4" />
                  Approved
                </div>
              )}

              {isRejected && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-yellow-600 text-white">
                  <ExclamationTriangleIcon className="w-4 h-4" />
                  Rejected
                </div>
              )}

              {/* Diff percentage badge */}
              {comparison.diffPercentage > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <span>{comparison.diffPercentage.toFixed(0)}%</span>
                </div>
              )}
            </div>

            {/* Right: Zoom Controls and View Modes */}
            <div className="flex items-center gap-2">
              {/* Zoom Controls */}
              <div className="flex items-center bg-gray-800/60 rounded-lg border border-gray-700/50">
                <button
                  onClick={() => setZoomLevel('fit')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-l-md transition-all ${
                    zoomLevel === 'fit'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Fit to screen"
                >
                  Fit
                </button>
                <button
                  onClick={() =>
                    setZoomLevel(prev =>
                      typeof prev === 'number' ? Math.max(0.25, prev - 0.25) : 1
                    )
                  }
                  className="p-1.5 text-gray-400 hover:text-white transition-all border-l border-gray-700/50"
                  title="Zoom out"
                >
                  <MagnifyingGlassMinusIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() =>
                    setZoomLevel(prev =>
                      typeof prev === 'number' ? Math.min(4, prev + 0.25) : 1.25
                    )
                  }
                  className="p-1.5 text-gray-400 hover:text-white transition-all border-l border-gray-700/50"
                  title="Zoom in"
                >
                  <MagnifyingGlassPlusIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoomLevel('1:1')}
                  className={`px-3 py-1.5 text-sm font-medium transition-all border-l border-gray-700/50 ${
                    zoomLevel === '1:1'
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Actual size"
                >
                  1:1
                </button>
              </div>

              {/* View Mode Toggle */}
              {comparison.diff && (
                <div className="flex items-center bg-gray-800/60 rounded-lg p-1 border border-gray-700/50">
                  {viewModes.map(mode => (
                    <button
                      key={mode.value}
                      onClick={() => setViewMode(mode.value)}
                      className={`
                        px-3 py-1.5 text-sm font-medium rounded-md transition-all
                        ${
                          viewMode === mode.value
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white hover:bg-gray-700/60'
                        }
                      `}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Next hint - positioned below the nav controls */}
          {canNavigate.next && (
            <div className="absolute top-full left-[88px] mt-1">
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-800/60 px-2 py-0.5 rounded">
                Next (→)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-auto bg-[#1a1a2e] relative">
        {/* Checkered background for transparency */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #252540 25%, transparent 25%),
              linear-gradient(-45deg, #252540 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #252540 75%),
              linear-gradient(-45deg, transparent 75%, #252540 75%)
            `,
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
          }}
        />

        <div className="relative w-full h-full flex items-center justify-center p-4">
          <div
            className="relative"
            style={{
              transform:
                zoomLevel === 'fit'
                  ? 'scale(1)'
                  : zoomLevel === '1:1'
                    ? 'scale(1)'
                    : `scale(${zoomLevel})`,
              transformOrigin: 'center',
              maxWidth: zoomLevel === 'fit' ? '100%' : 'none',
              maxHeight: zoomLevel === 'fit' ? '100%' : 'none',
            }}
          >
            <ComparisonViewer comparison={comparison} viewMode={viewMode} />
          </div>
        </div>
      </div>

      {/* Filmstrip Navigation */}
      <div className="flex-shrink-0 bg-gray-900 border-t border-gray-700/50">
        <div className="px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Screenshot count */}
            <div className="text-sm text-gray-500 flex-shrink-0">
              {currentIndex + 1} of {comparisons.length}
            </div>

            {/* Filmstrip */}
            <div
              ref={filmstripRef}
              className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-hide py-1"
            >
              {comparisons.map((comp, index) => (
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
