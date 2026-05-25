import { CheckCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * SVG overlay that renders hot spot region bounding boxes on a screenshot
 *
 * Renders:
 * - Candidate regions: Amber dashed border, pulsing, clickable
 * - Confirmed regions: Green subtle border with optional label
 */
export function HotSpotOverlay({
  confirmed = [],
  candidates = [],
  imageWidth,
  imageHeight,
  onRegionClick,
  onConfirmRegion,
  onRejectRegion,
  showConfirmed = true,
  showCandidates = true,
  disabled = false,
}) {
  let [activeRegion, setActiveRegion] = useState(null);
  let [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });

  let handleRegionClick = useCallback(
    (region, event) => {
      if (disabled) return;

      // Stop propagation to prevent other handlers
      event.stopPropagation();

      // Use clientX/clientY for viewport-relative fixed positioning
      // These are already in viewport coordinates, perfect for fixed positioning
      setPopoverPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setActiveRegion(region);
      onRegionClick?.(region);
    },
    [disabled, onRegionClick]
  );

  let handleConfirm = useCallback(
    (region, label = null) => {
      onConfirmRegion?.(region.id, label);
      setActiveRegion(null);
    },
    [onConfirmRegion]
  );

  let handleReject = useCallback(
    region => {
      onRejectRegion?.(region.id);
      setActiveRegion(null);
    },
    [onRejectRegion]
  );

  let handleClosePopover = useCallback(() => {
    setActiveRegion(null);
  }, []);

  if (!imageWidth || !imageHeight) {
    return null;
  }

  return (
    <div className="hot-spot-overlay-container absolute inset-0 pointer-events-none z-20">
      <svg
        viewBox={`0 0 ${imageWidth} ${imageHeight}`}
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <defs>
          {/* Pulsing animation for candidates */}
          <style>
            {`
              @keyframes pulse-glow {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
              }
              .hot-spot-candidate {
                animation: pulse-glow 2s ease-in-out infinite;
              }
              .hot-spot-confirmed-box {
                fill: color-mix(in srgb, var(--accent-success) 12%, transparent);
                stroke: color-mix(in srgb, var(--accent-success) 82%, transparent);
              }
              .hot-spot-confirmed-box:hover {
                fill: color-mix(in srgb, var(--accent-success) 22%, transparent);
              }
              .hot-spot-confirmed-label {
                fill: var(--accent-success);
              }
              .hot-spot-label-text {
                fill: var(--accent-brand-contrast);
              }
              .hot-spot-candidate-box {
                fill: color-mix(in srgb, var(--accent-warning) 12%, transparent);
                stroke: color-mix(in srgb, var(--accent-warning) 82%, transparent);
              }
              .hot-spot-candidate-box:hover {
                fill: color-mix(in srgb, var(--accent-warning) 22%, transparent);
              }
              .hot-spot-candidate-dot {
                fill: var(--accent-warning);
                stroke: var(--vz-bg);
              }
            `}
          </style>
        </defs>

        {/* Confirmed regions (green dashed, similar style to candidates) */}
        {showConfirmed &&
          confirmed.map(region => {
            // Calculate dimensions with minimum size for visibility
            let width = Math.max(region.x2 - region.x1, 20);
            let height = Math.max(region.y2 - region.y1, 20);
            // Center the expanded box on the original region center
            let centerX = (region.x1 + region.x2) / 2;
            let centerY = (region.y1 + region.y2) / 2;
            let x = centerX - width / 2;
            let y = centerY - height / 2;

            return (
              <g key={region.id} className="pointer-events-auto">
                {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG hot spots are direct image-region pointer targets. */}
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  strokeWidth="2"
                  strokeDasharray="6 3"
                  rx="2"
                  className="hot-spot-confirmed-box cursor-pointer"
                  onClick={e => handleRegionClick(region, e)}
                />
                {/* Label badge if present */}
                {region.label && (
                  <g>
                    <rect
                      x={x}
                      y={y - 18}
                      width={region.label.length * 7 + 12}
                      height={16}
                      className="hot-spot-confirmed-label"
                      rx="3"
                    />
                    <text
                      x={x + 6}
                      y={y - 6}
                      className="hot-spot-label-text"
                      fontSize="10"
                      fontFamily="ui-monospace, monospace"
                    >
                      {region.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

        {/* Candidate regions (amber dashed, pulsing) */}
        {showCandidates &&
          candidates.map(region => {
            // Calculate dimensions with minimum size for visibility
            let width = Math.max(region.x2 - region.x1, 20);
            let height = Math.max(region.y2 - region.y1, 20);
            // Center the expanded box on the original region center
            let centerX = (region.x1 + region.x2) / 2;
            let centerY = (region.y1 + region.y2) / 2;
            let x = centerX - width / 2;
            let y = centerY - height / 2;

            return (
              <g
                key={region.id}
                className="pointer-events-auto hot-spot-candidate"
              >
                {/* Invisible larger hit area for easier clicking */}
                {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG hot spots are direct image-region pointer targets. */}
                <rect
                  x={x - 5}
                  y={y - 5}
                  width={width + 10}
                  height={height + 10}
                  fill="transparent"
                  className="cursor-pointer"
                  onClick={e => handleRegionClick(region, e)}
                />
                {/* Visible region box */}
                {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG hot spots are direct image-region pointer targets. */}
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  strokeWidth="2"
                  strokeDasharray="6 3"
                  rx="2"
                  className="hot-spot-candidate-box cursor-pointer"
                  onClick={e => handleRegionClick(region, e)}
                />
                {/* Candidate indicator dot */}
                <circle
                  cx={x + width - 4}
                  cy={y + 4}
                  r="6"
                  className="hot-spot-candidate-dot"
                  strokeWidth="1"
                />
              </g>
            );
          })}
      </svg>

      {/* Popover for active region - rendered via portal to escape zoom transforms */}
      {activeRegion &&
        createPortal(
          <HotSpotPopover
            region={activeRegion}
            position={popoverPosition}
            onConfirm={handleConfirm}
            onReject={handleReject}
            onClose={handleClosePopover}
            isCandidate={activeRegion.status === 'candidate'}
          />,
          document.body
        )}
    </div>
  );
}

/**
 * Popover for region details and actions
 */
function HotSpotPopover({
  region,
  position,
  onConfirm,
  onReject,
  onClose,
  isCandidate,
}) {
  let [label, setLabel] = useState('');
  let [showLabelInput, setShowLabelInput] = useState(false);

  let handleConfirmWithLabel = useCallback(() => {
    onConfirm(region, label || null);
  }, [onConfirm, region, label]);

  let handleConfirmQuick = useCallback(() => {
    onConfirm(region, null);
  }, [onConfirm, region]);

  // Calculate position to keep popover in view (using viewport coordinates)
  let popoverWidth = 250;
  let popoverHeight = 220;

  // Start with click position
  let x = position.x - popoverWidth / 2; // Center horizontally on click
  let y = position.y;

  // Keep popover within viewport bounds horizontally
  if (x < 10) {
    x = 10;
  } else if (x + popoverWidth > window.innerWidth - 10) {
    x = window.innerWidth - popoverWidth - 10;
  }

  // If enough room above click point, show above; otherwise show below
  let showAbove = y > popoverHeight + 20;
  if (showAbove) {
    y = y - popoverHeight - 10; // Position above click
  } else {
    y = y + 10; // Position below click
  }

  // Keep within vertical bounds
  if (y < 10) y = 10;
  if (y + popoverHeight > window.innerHeight - 10) {
    y = window.innerHeight - popoverHeight - 10;
  }

  let style = {
    left: `${x}px`,
    top: `${y}px`,
  };

  return (
    <>
      {/* Backdrop to close popover */}
      <button
        type="button"
        className="fixed inset-0 z-[60] pointer-events-auto"
        onClick={onClose}
        aria-label="Close hot spot editor"
      />

      {/* Popover - fixed positioning for zoom independence */}
      <div
        className="fixed z-[70] pointer-events-auto bg-[var(--vz-elevated)] border border-[var(--vz-border)] rounded-lg shadow-xl min-w-[200px] max-w-[280px]"
        style={style}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vz-border-subtle)]">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {isCandidate ? 'Detected Change' : 'Dynamic Region'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-3 py-2 space-y-2">
          {/* Status */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-tertiary)]">Status</span>
            <span
              className={`font-medium ${isCandidate ? 'text-[var(--accent-warning)]' : 'text-[var(--accent-success)]'}`}
            >
              {isCandidate ? 'Pending Review' : 'Confirmed Dynamic'}
            </span>
          </div>

          {/* Occurrence count */}
          {region.occurrence_count > 1 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-tertiary)]">Seen</span>
              <span className="text-[var(--text-secondary)]">
                {region.occurrence_count} times
              </span>
            </div>
          )}

          {/* Existing label */}
          {region.label && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-tertiary)]">Label</span>
              <span className="text-[var(--text-secondary)] font-mono">
                {region.label}
              </span>
            </div>
          )}

          {/* Label input for candidates */}
          {isCandidate && showLabelInput && (
            <div className="pt-1">
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g., timestamp, avatar"
                className="w-full px-2 py-1.5 text-xs bg-[var(--vz-bg)] border border-[var(--vz-border)] rounded text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-brand)]"
              />
            </div>
          )}
        </div>

        {/* Actions for candidates */}
        {isCandidate && (
          <div className="px-3 py-2 border-t border-[var(--vz-border-subtle)] space-y-2">
            <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
              Is this dynamic content that changes between builds?
            </p>
            {!showLabelInput ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmQuick}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--accent-success-muted)] text-[var(--accent-success)] rounded hover:bg-[color-mix(in_srgb,var(--accent-success-muted)_82%,white)] transition-colors"
                  title="Mark as dynamic content - future changes here will be auto-approved"
                >
                  <CheckCircleIcon className="w-3.5 h-3.5" />
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => onReject(region)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--accent-danger-muted)] text-[var(--accent-danger)] rounded hover:bg-[color-mix(in_srgb,var(--accent-danger-muted)_82%,white)] transition-colors"
                  title="Not dynamic - this is a real change that needs review"
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConfirmWithLabel}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--accent-success-muted)] text-[var(--accent-success)] rounded hover:bg-[color-mix(in_srgb,var(--accent-success-muted)_82%,white)] transition-colors"
              >
                <CheckCircleIcon className="w-3.5 h-3.5" />
                Confirm as Dynamic
              </button>
            )}

            {!showLabelInput && (
              <button
                type="button"
                onClick={() => setShowLabelInput(true)}
                className="w-full text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] underline underline-offset-2"
              >
                Add a label (optional)
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default HotSpotOverlay;
