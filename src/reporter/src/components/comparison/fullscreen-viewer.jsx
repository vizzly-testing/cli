/**
 * Fullscreen Comparison Viewer
 * Matches BearDen/Cloud product review UI patterns
 *
 * Features:
 * - Clean, focused layout prioritizing the screenshot
 * - Review queue with filtering (To Review, Changes, New, All)
 * - Keyboard-driven review mode (Space to toggle, A/R/D/T shortcuts)
 * - Inspector panel for metadata
 * - View mode toggle (Overlay, Toggle, Slide)
 * - Zoom controls with keyboard shortcuts
 */

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ComputerDesktopIcon,
  CubeTransparentIcon,
  DocumentMagnifyingGlassIcon,
  InformationCircleIcon,
  ListBulletIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VIEW_MODES } from '../../utils/constants.js';
import { withImageVersion } from '../../utils/image-url.js';
import {
  ApprovalButtonGroup,
  Badge,
  BrowserIcon,
  CloseButton,
  DrawerContent,
  DrawerFilterBar,
  DrawerFilterButton,
  DrawerFooter,
  DrawerHeader,
  InspectorPanel,
  MobileApprovalBar,
  MobileDrawer,
  QueueItem,
  ReviewModeProvider,
  useReviewMode,
  useReviewModeShortcuts,
  useZoom,
  VariantBreadcrumb,
  ViewModeToggle,
  ZoomControls,
} from '../design-system/index.js';
import { ScreenshotDisplay } from './screenshot-display.jsx';

/**
 * Get a stable ID for a comparison, falling back to signature or name
 */
function getComparisonId(comparison) {
  return comparison?.id || comparison?.signature || comparison?.name;
}

/**
 * Map CLI status to BearDen result type
 */
function mapStatusToResult(status) {
  switch (status) {
    case 'failed':
      return 'changed';
    case 'new':
    case 'baseline-created':
      return 'new';
    case 'passed':
      return 'unchanged';
    default:
      return status;
  }
}

/**
 * Main component - wraps with ReviewModeProvider
 */
export default function FullscreenViewer(props) {
  return (
    <ReviewModeProvider>
      <FullscreenViewerInner {...props} />
    </ReviewModeProvider>
  );
}

/**
 * Inner component that uses review mode
 */
function FullscreenViewerInner({
  comparison,
  comparisons = [],
  onClose,
  onAccept,
  onReject,
  onDelete,
  onNavigate,
}) {
  // UI state
  let [viewMode, setViewMode] = useState(VIEW_MODES.OVERLAY);
  let [showDiffOverlay, setShowDiffOverlay] = useState(true);
  let [onionSkinPosition, setOnionSkinPosition] = useState(50);
  let [showQueue, setShowQueue] = useState(true);
  let [showInspector, setShowInspector] = useState(false);
  let [queueFilter, setQueueFilter] = useState('needs-review');
  let [showBaseline, setShowBaseline] = useState(true);
  let [showRegions, setShowRegions] = useState(false);

  let { zoom, setZoom } = useZoom('fit');
  let { isActive: isReviewMode } = useReviewMode();

  // Ref for scrolling active queue item into view
  let activeQueueItemRef = useRef(null);

  // Toggle inspector (closes other panels)
  let toggleInspector = useCallback(() => {
    setShowInspector(prev => !prev);
  }, []);

  // Transform comparisons for queue display
  // Map CLI status to BearDen result format
  // QueueItem expects: name, result, approval_status, diff_percentage, status
  let queueItems = useMemo(() => {
    return comparisons.map(comp => ({
      ...comp,
      // Ensure name is set
      name: comp.name || comp.originalName || 'Unknown',
      // Set result for BearDen (changed, new, unchanged)
      result: mapStatusToResult(comp.status),
      // Keep original status so QueueItem can check both formats
      status: comp.status,
      // Map approval_status from userAction
      approval_status:
        comp.userAction === 'accepted'
          ? 'approved'
          : comp.userAction === 'rejected'
            ? 'rejected'
            : comp.status === 'passed'
              ? 'approved'
              : 'pending',
      // Ensure diff_percentage is available (BearDen format)
      diff_percentage: comp.diffPercentage ?? comp.diff_percentage,
      // Pass through diffClusters for change description
      diffClusters: comp.diffClusters || [],
      // Map properties for VariantBreadcrumb - support nested and flat formats
      viewport_width: comp.properties?.viewport_width ?? comp.viewport_width,
      viewport_height: comp.properties?.viewport_height ?? comp.viewport_height,
      browser: comp.properties?.browser ?? comp.browser,
    }));
  }, [comparisons]);

  // Group comparisons by original name (screenshots with same name but different variants)
  // This enables the variant breadcrumb navigation
  // Always show the breadcrumb for context (viewport/browser info), even with single variant
  let currentGroup = useMemo(() => {
    if (!comparison) return null;
    let currentName = comparison.name || comparison.originalName;
    let variants = queueItems.filter(
      item => (item.name || item.originalName) === currentName
    );
    return { name: currentName, comparisons: variants };
  }, [comparison, queueItems]);

  // Handle variant selection from VariantBreadcrumb
  let handleVariantSelect = useCallback(
    variant => {
      if (variant && onNavigate) {
        onNavigate(variant);
      }
    },
    [onNavigate]
  );

  // Filter queue items
  let filteredQueueItems = useMemo(() => {
    let filterFns = {
      all: () => true,
      'needs-review': item => {
        return (
          (item.result === 'changed' || item.result === 'new') &&
          item.approval_status !== 'approved' &&
          item.approval_status !== 'rejected'
        );
      },
      changes: item => item.result === 'changed',
      new: item => item.result === 'new',
    };

    let fn = filterFns[queueFilter] || filterFns.all;
    return queueItems.filter(fn);
  }, [queueItems, queueFilter]);

  // Find current index in filtered queue
  let currentFilteredIndex = useMemo(() => {
    if (!comparison) return -1;
    let compId = getComparisonId(comparison);
    return filteredQueueItems.findIndex(
      item => getComparisonId(item) === compId
    );
  }, [filteredQueueItems, comparison]);

  // Navigation capabilities
  let canNavigate = useMemo(
    () => ({
      prev: currentFilteredIndex > 0,
      next:
        currentFilteredIndex < filteredQueueItems.length - 1 &&
        currentFilteredIndex !== -1,
    }),
    [currentFilteredIndex, filteredQueueItems.length]
  );

  // Navigation handlers
  let handlePrevious = useCallback(() => {
    if (canNavigate.prev) {
      let prevItem = filteredQueueItems[currentFilteredIndex - 1];
      onNavigate(prevItem);
    }
  }, [canNavigate.prev, filteredQueueItems, currentFilteredIndex, onNavigate]);

  let handleNext = useCallback(() => {
    if (canNavigate.next) {
      let nextItem = filteredQueueItems[currentFilteredIndex + 1];
      onNavigate(nextItem);
    }
  }, [canNavigate.next, filteredQueueItems, currentFilteredIndex, onNavigate]);

  // Get next item after approval action (for auto-advance)
  let getNextItemAfterAction = useCallback(() => {
    if (currentFilteredIndex < filteredQueueItems.length - 1) {
      return filteredQueueItems[currentFilteredIndex + 1];
    }
    if (currentFilteredIndex > 0) {
      return filteredQueueItems[currentFilteredIndex - 1];
    }
    return null;
  }, [currentFilteredIndex, filteredQueueItems]);

  // Approval handlers with auto-advance
  let handleApprove = useCallback(() => {
    if (!onAccept || !comparison) return;
    let nextItem =
      queueFilter === 'needs-review' ? getNextItemAfterAction() : null;
    onAccept(getComparisonId(comparison));

    if (nextItem) {
      onNavigate(nextItem);
    } else if (
      queueFilter === 'needs-review' &&
      filteredQueueItems.length <= 1
    ) {
      onClose();
    }
  }, [
    onAccept,
    comparison,
    queueFilter,
    getNextItemAfterAction,
    filteredQueueItems.length,
    onNavigate,
    onClose,
  ]);

  let handleReject = useCallback(() => {
    if (!onReject || !comparison) return;
    let nextItem =
      queueFilter === 'needs-review' ? getNextItemAfterAction() : null;
    onReject(getComparisonId(comparison));

    if (nextItem) {
      onNavigate(nextItem);
    } else if (
      queueFilter === 'needs-review' &&
      filteredQueueItems.length <= 1
    ) {
      onClose();
    }
  }, [
    onReject,
    comparison,
    queueFilter,
    getNextItemAfterAction,
    filteredQueueItems.length,
    onNavigate,
    onClose,
  ]);

  let handleDelete = useCallback(() => {
    if (!onDelete || !comparison) return;
    onDelete(getComparisonId(comparison));
  }, [onDelete, comparison]);

  // View mode cycling for keyboard shortcut
  let cycleViewMode = useCallback(() => {
    setViewMode(current =>
      current === VIEW_MODES.OVERLAY ? VIEW_MODES.TOGGLE : VIEW_MODES.OVERLAY
    );
  }, []);

  // Toggle handler for 'd' - toggles diff overlay or baseline/current
  let handleDiffToggle = useCallback(() => {
    if (viewMode === VIEW_MODES.TOGGLE) {
      setShowBaseline(prev => !prev);
    } else {
      setShowDiffOverlay(prev => !prev);
    }
  }, [viewMode]);

  // Review mode shortcuts
  let reviewModeShortcuts = useMemo(
    () => ({
      a: onAccept ? handleApprove : undefined,
      r: onReject ? handleReject : undefined,
      d: handleDiffToggle,
      t: cycleViewMode,
      1: () => setViewMode(VIEW_MODES.OVERLAY),
      2: () => setViewMode(VIEW_MODES.TOGGLE),
      3: () => setViewMode(VIEW_MODES.ONION),
    }),
    [
      handleApprove,
      handleReject,
      onAccept,
      onReject,
      cycleViewMode,
      handleDiffToggle,
    ]
  );

  useReviewModeShortcuts(reviewModeShortcuts);

  // Global keyboard navigation (always active)
  useEffect(() => {
    let handleKeyDown = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')
        return;

      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          if (canNavigate.prev) handlePrevious();
          break;
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          if (canNavigate.next) handleNext();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'i':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            toggleInspector();
          }
          break;
        case 'g':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setShowRegions(prev => !prev);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canNavigate, handlePrevious, handleNext, onClose, toggleInspector]);

  // Scroll active queue item into view
  useEffect(() => {
    if (!showQueue) return;
    if (currentFilteredIndex < 0) return;
    if (currentFilteredIndex >= filteredQueueItems.length) return;

    let item = activeQueueItemRef.current;
    if (!item) return;

    let container = item.closest('.overflow-y-auto');
    if (!container) return;

    let itemRect = item.getBoundingClientRect();
    let containerRect = container.getBoundingClientRect();

    if (itemRect.top < containerRect.top) {
      container.scrollBy({
        top: itemRect.top - containerRect.top - 8,
        behavior: 'smooth',
      });
    } else if (itemRect.bottom > containerRect.bottom) {
      container.scrollBy({
        top: itemRect.bottom - containerRect.bottom + 8,
        behavior: 'smooth',
      });
    }
  }, [currentFilteredIndex, filteredQueueItems.length, showQueue]);

  if (!comparison) {
    return (
      <div className="min-h-screen bg-[var(--vz-bg)] flex items-center justify-center">
        <div className="text-center text-[var(--text-tertiary)]">
          <div className="text-lg mb-2">Comparison not found</div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--accent-info)] hover:text-[var(--text-primary)]"
          >
            Return to list
          </button>
        </div>
      </div>
    );
  }

  // Determine result and approval status for current comparison
  let result = mapStatusToResult(comparison.status);
  let approvalStatus =
    comparison.userAction === 'accepted'
      ? 'approved'
      : comparison.userAction === 'rejected'
        ? 'rejected'
        : comparison.status === 'passed'
          ? 'approved'
          : 'pending';

  // Result badge config
  let resultBadge = {
    new: { variant: 'info', label: 'New' },
    changed: { variant: 'warning', label: 'Changed' },
    unchanged: { variant: 'default', label: 'Unchanged' },
  }[result];

  // Whether we can delete (only for new screenshots)
  let canDelete =
    comparison.status === 'new' || comparison.status === 'baseline-created';

  // Extract metadata
  let metadata = comparison.properties || {};

  return (
    <div
      className="h-screen bg-[var(--vz-bg)] flex flex-col overflow-hidden"
      data-testid="fullscreen-viewer"
    >
      {/* Header */}
      <header className="flex-shrink-0 bg-[var(--vz-bg)] border-b border-[var(--vz-border-subtle)] z-30">
        {/* Primary row */}
        <div className="px-2 sm:px-4 py-2 flex items-center gap-1 sm:gap-3">
          <CloseButton onClick={onClose} />

          {/* Title area */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <h1 className="text-sm font-medium text-[var(--text-primary)] truncate">
              {comparison.name || comparison.originalName || 'Unknown'}
            </h1>
            {resultBadge && (
              <Badge
                variant={resultBadge.variant}
                size="sm"
                className="hidden xs:flex"
              >
                {resultBadge.label}
              </Badge>
            )}
            {isReviewMode && (
              <Badge
                variant="warning"
                size="sm"
                dot
                pulseDot
                className="hidden sm:flex"
              >
                Review Mode
              </Badge>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={handlePrevious}
              disabled={!canNavigate.prev}
              className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-85 disabled:cursor-not-allowed rounded-md hover:bg-[var(--vz-raised)] transition-colors"
              aria-label="Previous"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <span className="hidden sm:block text-xs text-[var(--text-muted)] font-medium tabular-nums px-1 min-w-[3rem] text-center">
              {currentFilteredIndex + 1}/{filteredQueueItems.length}
            </span>
            <button
              type="button"
              onClick={handleNext}
              disabled={!canNavigate.next}
              className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-85 disabled:cursor-not-allowed rounded-md hover:bg-[var(--vz-raised)] transition-colors"
              aria-label="Next"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="hidden sm:block h-5 w-px bg-[var(--vz-border-subtle)]" />

          {/* Approval buttons - desktop */}
          <div className="hidden sm:flex items-center gap-2">
            {canDelete && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs font-medium text-[var(--accent-danger)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-danger-muted)] rounded-md transition-colors"
                data-testid="btn-delete"
              >
                Delete
              </button>
            ) : null}
            <ApprovalButtonGroup
              status={approvalStatus}
              onApprove={onAccept ? handleApprove : null}
              onReject={onReject ? handleReject : null}
              compact
            />
          </div>

          {/* Tool buttons - desktop */}
          <div className="hidden sm:flex items-center">
            <button
              type="button"
              onClick={() => setShowQueue(!showQueue)}
              className={`flex items-center justify-center p-2 rounded-md transition-colors ${showQueue ? 'bg-[var(--accent-brand-muted)] text-[var(--accent-brand)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-raised)]'}`}
              title="Queue"
              aria-label="Toggle queue"
              data-testid="toggle-queue-btn"
            >
              <ListBulletIcon className="w-5 h-5 pointer-events-none" />
            </button>

            {/* Regions toggle - only show if comparison has regions */}
            {(comparison?.confirmedRegions?.length > 0 ||
              comparison?.hasConfirmedRegions) && (
              <button
                type="button"
                onClick={() => setShowRegions(!showRegions)}
                className={`p-2 rounded-md transition-colors ${showRegions ? 'bg-[var(--accent-success-muted)] text-[var(--accent-success)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-raised)]'}`}
                title="Show Regions (G)"
                aria-label="Toggle regions"
                data-testid="toggle-regions-btn"
              >
                <MapPinIcon className="w-5 h-5 pointer-events-none" />
              </button>
            )}

            <button
              type="button"
              onClick={toggleInspector}
              className={`p-2 rounded-md transition-colors ${showInspector ? 'bg-[var(--accent-info-muted)] text-[var(--accent-info)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-raised)]'}`}
              title="Details (I)"
              aria-label="Screenshot details"
              data-testid="toggle-inspector-btn"
            >
              <InformationCircleIcon className="w-5 h-5 pointer-events-none" />
            </button>
          </div>
        </div>

        {/* Secondary row: Variant selector + View mode + Zoom */}
        <div className="px-2 sm:px-4 py-1.5 sm:py-2 border-t border-[var(--vz-border-subtle)] flex items-center gap-2 sm:gap-3">
          {/* Variant breadcrumb - shows viewport/browser info, allows switching when multiple variants */}
          {currentGroup && currentGroup.comparisons.length > 0 && (
            <VariantBreadcrumb
              variants={currentGroup.comparisons}
              currentVariantId={getComparisonId(comparison)}
              onVariantSelect={handleVariantSelect}
            />
          )}

          <div className="flex-1" />

          {/* View mode - hidden on mobile */}
          {comparison.diff && (
            <ViewModeToggle
              value={viewMode}
              onChange={setViewMode}
              compact
              className="hidden sm:flex"
            />
          )}

          {/* Zoom */}
          <ZoomControls zoom={zoom} onZoomChange={setZoom} />
        </div>
      </header>

      {/* Main content area with sidebars */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Review Queue */}
        <MobileDrawer
          isOpen={showQueue}
          onClose={() => setShowQueue(false)}
          position="bottom"
          desktopPosition="left"
          width="w-80"
          mobileHeight="30vh"
          expandedHeight="80vh"
          alwaysVisibleOnDesktop={false}
          showBackdrop={false}
          testId="queue-drawer"
        >
          <DrawerHeader
            title="Queue"
            subtitle={`${filteredQueueItems.length} of ${queueItems.length} items`}
            onClose={() => setShowQueue(false)}
          />

          <DrawerFilterBar>
            {[
              { id: 'needs-review', label: 'To Review' },
              { id: 'changes', label: 'Changes' },
              { id: 'new', label: 'New' },
              { id: 'all', label: 'All' },
            ].map(filter => (
              <DrawerFilterButton
                key={filter.id}
                isActive={queueFilter === filter.id}
                onClick={() => setQueueFilter(filter.id)}
              >
                {filter.label}
              </DrawerFilterButton>
            ))}
          </DrawerFilterBar>

          <DrawerContent className="px-2 py-2 space-y-1">
            {filteredQueueItems.map(item => {
              let isActive =
                getComparisonId(item) === getComparisonId(comparison);
              return (
                <div
                  key={getComparisonId(item)}
                  ref={isActive ? activeQueueItemRef : null}
                >
                  <QueueItem
                    item={item}
                    isActive={isActive}
                    thumbnailUrl={withImageVersion(
                      item.current || item.baseline,
                      item.timestamp
                    )}
                    onClick={() => onNavigate(item)}
                  />
                </div>
              );
            })}
            {filteredQueueItems.length === 0 && (
              <div className="text-center py-8 text-[var(--text-muted)] text-xs">
                {queueFilter === 'needs-review'
                  ? 'All screenshots reviewed!'
                  : 'No items match this filter'}
              </div>
            )}
          </DrawerContent>

          <DrawerFooter className="hidden sm:flex flex-col items-center gap-1.5">
            <p className="text-xs text-[var(--text-muted)] text-center">
              <span className="text-[var(--text-tertiary)]">↑↓</span> navigate
              {' · '}
              <span className="text-[var(--text-tertiary)]">Space</span>{' '}
              {isReviewMode ? 'exit' : 'review mode'}
            </p>
            {isReviewMode && (
              <p className="text-xs text-[var(--text-muted)] text-center">
                <span className="text-[var(--accent-success)] font-medium">
                  A
                </span>{' '}
                approve
                {' · '}
                <span className="text-[var(--accent-danger)] font-medium">
                  R
                </span>{' '}
                reject
                {' · '}
                <span className="text-[var(--text-tertiary)] font-medium">
                  D
                </span>{' '}
                diff
                {' · '}
                <span className="text-[var(--text-tertiary)] font-medium">
                  T
                </span>{' '}
                view
              </p>
            )}
          </DrawerFooter>
        </MobileDrawer>

        {/* Screenshot display area */}
        <main className="flex-1 min-h-0 overflow-hidden relative">
          <ScreenshotDisplay
            key={getComparisonId(comparison)}
            comparison={comparison}
            viewMode={viewMode === VIEW_MODES.ONION ? 'onion-skin' : viewMode}
            showDiffOverlay={showDiffOverlay}
            onDiffToggle={() => setShowDiffOverlay(prev => !prev)}
            showBaseline={showBaseline}
            onToggleBaseline={() => setShowBaseline(prev => !prev)}
            onionSkinPosition={onionSkinPosition}
            onOnionSkinChange={setOnionSkinPosition}
            zoom={zoom}
            disableLoadingOverlay={true}
            showRegions={showRegions}
            className="w-full h-full"
          />
        </main>

        {/* Inspector Panel - order-last ensures it appears on right in flex container */}
        <InspectorPanel
          isOpen={showInspector}
          onClose={() => setShowInspector(false)}
          title="Screenshot Details"
          subtitle={comparison.name || comparison.originalName}
          className="order-last"
        >
          {/* Status */}
          <InspectorPanel.Section title="Status" icon={CubeTransparentIcon}>
            <div className="flex items-center gap-2 flex-wrap">
              {resultBadge && (
                <Badge variant={resultBadge.variant} size="sm">
                  {resultBadge.label}
                </Badge>
              )}
              <Badge
                variant={
                  approvalStatus === 'approved'
                    ? 'success'
                    : approvalStatus === 'rejected'
                      ? 'danger'
                      : 'default'
                }
                size="sm"
              >
                {approvalStatus}
              </Badge>
            </div>
          </InspectorPanel.Section>

          {/* Screenshot details */}
          <InspectorPanel.Section title="Screenshot" icon={ComputerDesktopIcon}>
            {metadata.browser && (
              <InspectorPanel.Row
                label="Browser"
                value={metadata.browser}
                icon={() => (
                  <BrowserIcon
                    browser={metadata.browser}
                    className="w-3.5 h-3.5"
                  />
                )}
              />
            )}
            <InspectorPanel.Row
              label="Viewport"
              value={
                metadata.viewport_width && metadata.viewport_height
                  ? `${metadata.viewport_width} × ${metadata.viewport_height}`
                  : null
              }
              mono
            />
            <InspectorPanel.Row label="Device" value={metadata.device} />
          </InspectorPanel.Section>

          {/* Diff analysis */}
          {result === 'changed' && comparison.diffPercentage != null && (
            <InspectorPanel.Section
              title="Diff Analysis"
              icon={DocumentMagnifyingGlassIcon}
            >
              <InspectorPanel.Row
                label="Changed"
                value={`${Number(comparison.diffPercentage).toFixed(3)}%`}
                mono
              />
              {comparison.diffPixels != null && (
                <InspectorPanel.Row
                  label="Pixels"
                  value={comparison.diffPixels.toLocaleString()}
                  mono
                />
              )}
              {comparison.threshold != null && (
                <InspectorPanel.Row
                  label="Threshold"
                  value={Number(comparison.threshold).toFixed(2)}
                  mono
                />
              )}
            </InspectorPanel.Section>
          )}

          {/* Actions */}
          <InspectorPanel.Section title="Identifier" icon={CubeTransparentIcon}>
            <InspectorPanel.Row
              label="Signature"
              value={comparison.signature || comparison.id}
              mono
              copyable
            />
          </InspectorPanel.Section>
        </InspectorPanel>
      </div>

      {/* Mobile Bottom Bar */}
      <div className="sm:hidden flex-shrink-0 bg-[var(--vz-bg)] border-t border-[var(--vz-border-subtle)] safe-area-pb">
        {/* Approval buttons */}
        <MobileApprovalBar
          status={approvalStatus}
          onApprove={onAccept ? handleApprove : null}
          onReject={onReject ? handleReject : null}
        />

        {/* Secondary tools row */}
        <div className="px-3 py-2 flex items-center gap-1 border-t border-[var(--vz-border-subtle)]">
          <button
            type="button"
            onClick={() => setShowQueue(!showQueue)}
            className={`flex items-center justify-center p-2.5 rounded-lg transition-colors ${showQueue ? 'bg-[var(--accent-brand-muted)] text-[var(--accent-brand)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-raised)] active:bg-[var(--vz-elevated)]'}`}
            aria-label="Queue"
            data-testid="mobile-toggle-queue-btn"
          >
            <ListBulletIcon className="w-5 h-5 pointer-events-none" />
          </button>

          <button
            type="button"
            onClick={toggleInspector}
            className={`flex items-center justify-center p-2.5 rounded-lg transition-colors ${showInspector ? 'bg-[var(--accent-info-muted)] text-[var(--accent-info)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-raised)] active:bg-[var(--vz-elevated)]'}`}
            aria-label="Screenshot details"
            data-testid="mobile-toggle-inspector-btn"
          >
            <InformationCircleIcon className="w-5 h-5 pointer-events-none" />
          </button>

          {/* Regions toggle - mobile */}
          {(comparison?.confirmedRegions?.length > 0 ||
            comparison?.hasConfirmedRegions) && (
            <button
              type="button"
              onClick={() => setShowRegions(!showRegions)}
              className={`flex items-center justify-center p-2.5 rounded-lg transition-colors ${showRegions ? 'bg-[var(--accent-success-muted)] text-[var(--accent-success)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-raised)] active:bg-[var(--vz-elevated)]'}`}
              aria-label="Toggle regions"
              data-testid="mobile-toggle-regions-btn"
            >
              <MapPinIcon className="w-5 h-5 pointer-events-none" />
            </button>
          )}

          {canDelete && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center justify-center p-2.5 rounded-lg text-[var(--accent-danger)] hover:text-[var(--text-primary)] hover:bg-[var(--accent-danger-muted)] active:bg-[var(--accent-danger-muted)] transition-colors"
              aria-label="Delete"
              data-testid="mobile-delete-btn"
            >
              <span className="text-xs font-medium">Delete</span>
            </button>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)] tabular-nums">
              {currentFilteredIndex + 1} / {filteredQueueItems.length}
            </span>
            {resultBadge && (
              <Badge variant={resultBadge.variant} size="sm">
                {resultBadge.label}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
