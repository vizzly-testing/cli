import {
  ChevronLeftIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  ListBulletIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Alert, Badge, IconButton } from '@vizzly-testing/bear-den';
import {
  ApprovalButtonGroup,
  MobileApprovalBar,
  ReviewModeProvider,
  useReviewMode,
  useReviewModeShortcuts,
  ViewModeToggle,
} from '@vizzly-testing/bear-den/review';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  filterReviewItems,
  getComparisonId,
  getResult,
  getReviewState,
  stepReviewZoom,
} from '../../utils/review.js';
import { ReviewProperties } from './review-properties.jsx';
import { ReviewSidebar } from './review-sidebar.jsx';
import { ReviewZoomControls } from './review-zoom-controls.jsx';
import { ScreenshotDisplay } from './screenshot-display.jsx';

let RESULT_NOTES = {
  new: 'New screenshot, no baseline yet',
  unchanged: 'Identical to baseline',
  error: 'Could not be compared',
};

export default function FullscreenViewer(props) {
  return (
    <ReviewModeProvider>
      <FullscreenViewerInner {...props} />
    </ReviewModeProvider>
  );
}

function FullscreenViewerInner({
  comparison,
  comparisons = [],
  onClose,
  onAccept,
  onReject,
  onDelete,
  onNavigate,
  isCurrentComparison,
}) {
  let [viewMode, setViewMode] = useState('overlay');
  let [showDiffOverlay, setShowDiffOverlay] = useState(true);
  let [onionSkinPosition, setOnionSkinPosition] = useState(50);
  let [sidebarTab, setSidebarTab] = useState(() =>
    window.matchMedia('(min-width: 640px)').matches ? 'queue' : null
  );
  let [queueFilter, setQueueFilter] = useState('needs-review');
  let [search, setSearch] = useState('');
  let [showBaseline, setShowBaseline] = useState(true);
  let [holdingBaseline, setHoldingBaseline] = useState(false);
  let [zoom, setZoom] = useState('fit-width');
  let [actionError, setActionError] = useState(null);
  let [showRegions, setShowRegions] = useState(false);
  let [isSaving, setIsSaving] = useState(false);
  let savingRef = useRef(false);
  let { isActive: isReviewMode } = useReviewMode();

  let filteredItems = useMemo(
    () => filterReviewItems(comparisons, queueFilter, search),
    [comparisons, queueFilter, search]
  );
  let selectedId = getComparisonId(comparison);
  let currentIndex = filteredItems.findIndex(
    item => getComparisonId(item) === selectedId
  );
  let canPrevious = currentIndex > 0;
  let canNext = currentIndex >= 0 && currentIndex < filteredItems.length - 1;
  let variants = comparisons.filter(
    item =>
      (item.originalName || item.name) ===
      (comparison?.originalName || comparison?.name)
  );

  let navigate = useCallback(
    item => {
      setActionError(null);
      onNavigate(item);
    },
    [onNavigate]
  );
  let previous = useCallback(() => {
    if (canPrevious) navigate(filteredItems[currentIndex - 1]);
  }, [canPrevious, navigate, filteredItems, currentIndex]);
  let next = useCallback(() => {
    if (canNext) navigate(filteredItems[currentIndex + 1]);
  }, [canNext, navigate, filteredItems, currentIndex]);

  // Keep the current screenshot open on a failed save. Advance only after
  // the local server has confirmed the baseline decision.
  let decide = useCallback(
    async (action, advance = true) => {
      if (!action || !comparison || savingRef.current) return;
      let nextItem =
        advance && queueFilter === 'needs-review' && currentIndex >= 0
          ? filteredItems[currentIndex + 1] || filteredItems[currentIndex - 1]
          : null;
      savingRef.current = true;
      setIsSaving(true);
      setActionError(null);
      try {
        await action(selectedId);
        if (!isCurrentComparison()) return;
        if (nextItem) navigate(nextItem);
        else if (
          !advance ||
          (queueFilter === 'needs-review' && currentIndex >= 0)
        )
          onClose();
      } catch (error) {
        if (isCurrentComparison()) {
          setActionError(`Could not save your review: ${error.message}`);
        }
      } finally {
        savingRef.current = false;
        setIsSaving(false);
      }
    },
    [
      comparison,
      queueFilter,
      currentIndex,
      filteredItems,
      selectedId,
      navigate,
      onClose,
      isCurrentComparison,
    ]
  );
  let approve = useCallback(() => decide(onAccept), [decide, onAccept]);
  let reject = useCallback(() => decide(onReject), [decide, onReject]);
  let remove = useCallback(() => decide(onDelete, false), [decide, onDelete]);
  let toggleDetails = useCallback(() => {
    setSidebarTab(current => (current === 'details' ? null : 'details'));
  }, []);
  let toggleDiff = useCallback(() => {
    if (viewMode === 'toggle') setShowBaseline(current => !current);
    else setShowDiffOverlay(current => !current);
  }, [viewMode]);

  useReviewModeShortcuts({
    a: onAccept ? approve : undefined,
    r: onReject ? reject : undefined,
    d: toggleDiff,
    t: () =>
      setViewMode(current => (current === 'overlay' ? 'toggle' : 'overlay')),
    1: () => setViewMode('overlay'),
    2: () => setViewMode('toggle'),
    3: () => setViewMode('onion-skin'),
  });

  useEffect(() => {
    let keyDown = event => {
      if (
        event.target.closest(
          'input, textarea, select, [contenteditable="true"], [role="menu"]'
        ) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      // Menus and focused controls own their keyboard interaction.
      if (event.defaultPrevented) return;
      if (
        ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(
          event.key
        ) &&
        event.target.closest('[role="tablist"], [role="radiogroup"]')
      )
        return;
      switch (event.key.toLowerCase()) {
        case 'arrowup':
        case 'arrowleft':
          event.preventDefault();
          previous();
          break;
        case 'arrowdown':
        case 'arrowright':
          event.preventDefault();
          next();
          break;
        case 'escape':
          if (document.querySelector('[role="menu"]')) return;
          event.preventDefault();
          onClose();
          break;
        case 'i':
          event.preventDefault();
          toggleDetails();
          break;
        case 'b':
          if (comparison?.baseline) setHoldingBaseline(true);
          break;
        case '+':
        case '=':
          event.preventDefault();
          setZoom(current => stepReviewZoom(current, 0.25));
          break;
        case '-':
          event.preventDefault();
          setZoom(current => stepReviewZoom(current, -0.25));
          break;
        case '0':
          setZoom(1);
          break;
        case '9':
          setZoom('fit');
          break;
      }
    };
    let releaseBaseline = event => {
      if (event.type === 'blur' || event.key?.toLowerCase() === 'b') {
        setHoldingBaseline(false);
      }
    };
    let keepSpaceForControls = event => {
      if (
        event.key === ' ' &&
        event.target.closest('button, input, select, [role="button"]')
      ) {
        event.stopPropagation();
      }
    };
    document.addEventListener('keydown', keepSpaceForControls);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', releaseBaseline);
    window.addEventListener('blur', releaseBaseline);
    return () => {
      document.removeEventListener('keydown', keepSpaceForControls);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', releaseBaseline);
      window.removeEventListener('blur', releaseBaseline);
    };
  }, [previous, next, onClose, toggleDetails, comparison?.baseline]);

  if (!comparison) return null;
  let reviewState = getReviewState(comparison);
  let result = getResult(comparison);
  let resultNote = RESULT_NOTES[result];
  let position =
    currentIndex < 0 ? '—' : `${currentIndex + 1}/${filteredItems.length}`;
  let canDelete = result === 'new' && onDelete;

  return (
    <div className="review-fullscreen" data-testid="fullscreen-viewer">
      <header className="shrink-0 border-b border-[var(--bd-border-subtle)] bg-[var(--bd-bg)] z-30">
        <div className="flex items-center gap-1 px-2 py-3 sm:gap-2 sm:px-4">
          <IconButton
            icon={XMarkIcon}
            label="Close comparison"
            onClick={onClose}
          />
          <span className="hidden sm:contents">
            <IconButton
              icon={SidebarIcon}
              label={sidebarTab ? 'Hide sidebar' : 'Show sidebar'}
              aria-pressed={sidebarTab != null}
              onClick={() =>
                setSidebarTab(current => (current ? null : 'queue'))
              }
            />
          </span>
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <h1 className="truncate text-sm font-medium text-[var(--bd-text-primary)]">
              {comparison.originalName || comparison.name}
            </h1>
            {resultNote && (
              <span className="hidden sm:block shrink-0 text-xs text-[var(--bd-text-tertiary)]">
                {resultNote}
              </span>
            )}
            {isReviewMode && (
              <Badge variant="warning" size="sm">
                Review Mode
              </Badge>
            )}
          </div>
          <div className="flex items-center">
            <IconButton
              icon={ChevronLeftIcon}
              label="Previous"
              disabled={!canPrevious}
              onClick={previous}
            />
            <span className="hidden sm:block min-w-12 px-1 text-center font-mono text-xs text-[var(--bd-text-muted)]">
              {position}
            </span>
            <IconButton
              icon={ChevronRightIcon}
              label="Next"
              disabled={!canNext}
              onClick={next}
            />
          </div>
          <div className="hidden sm:flex items-center gap-2">
            {canDelete && (
              <IconButton
                icon={TrashIcon}
                label="Delete screenshot"
                onClick={remove}
                disabled={isSaving}
              />
            )}
            <ApprovalButtonGroup
              status={reviewState}
              onApprove={onAccept ? approve : null}
              onReject={onReject ? reject : null}
              disabled={isSaving}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-[var(--bd-border-subtle)] px-2 py-2 sm:gap-3 sm:px-4">
          <div className="min-w-0 flex-1">
            <ReviewProperties
              comparison={comparison}
              variants={variants}
              onNavigate={navigate}
            />
          </div>
          {comparison.diff && (
            <ViewModeToggle
              value={viewMode}
              onChange={setViewMode}
              className="hidden sm:flex"
            />
          )}
          <ReviewZoomControls zoom={zoom} onChange={setZoom} />
        </div>
      </header>
      {actionError && (
        <Alert variant="danger" role="alert">
          {actionError}
        </Alert>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ReviewSidebar
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          comparison={comparison}
          items={filteredItems}
          total={comparisons.length}
          filter={queueFilter}
          onFilterChange={setQueueFilter}
          search={search}
          onSearchChange={setSearch}
          onNavigate={navigate}
          isReviewMode={isReviewMode}
          showRegions={showRegions}
          onRegionsChange={setShowRegions}
        />
        <main className="relative min-w-0 min-h-0 flex-1 overflow-hidden">
          <ScreenshotDisplay
            key={`${selectedId}:${comparison.timestamp}`}
            comparison={comparison}
            viewMode={holdingBaseline ? 'toggle' : viewMode}
            showDiffOverlay={showDiffOverlay}
            onDiffToggle={toggleDiff}
            showBaseline={holdingBaseline || showBaseline}
            onToggleBaseline={() => setShowBaseline(current => !current)}
            onionSkinPosition={onionSkinPosition}
            onOnionSkinChange={setOnionSkinPosition}
            zoom={zoom}
            showRegions={showRegions}
            disableLoadingOverlay
            className="w-full h-full"
          />
        </main>
      </div>
      <div className="review-mobile-bar sm:hidden">
        <MobileApprovalBar
          status={reviewState}
          onApprove={onAccept ? approve : null}
          onReject={onReject ? reject : null}
          disabled={isSaving}
        />
        <div className="flex items-center gap-1 border-t border-[var(--bd-border-subtle)] px-3 py-2">
          <IconButton
            icon={ListBulletIcon}
            label="Queue"
            size="sm"
            aria-pressed={sidebarTab === 'queue'}
            onClick={() =>
              setSidebarTab(current => (current === 'queue' ? null : 'queue'))
            }
          />
          <IconButton
            icon={InformationCircleIcon}
            label="Screenshot details"
            size="sm"
            aria-pressed={sidebarTab === 'details'}
            onClick={toggleDetails}
          />
          {canDelete && (
            <IconButton
              icon={TrashIcon}
              label="Delete screenshot"
              size="sm"
              onClick={remove}
              disabled={isSaving}
            />
          )}
          <div className="flex-1" />
          {comparison.diff && (
            <ViewModeToggle value={viewMode} onChange={setViewMode} compact />
          )}
          <span className="px-1 font-mono text-xs text-[var(--bd-text-muted)]">
            {position}
          </span>
        </div>
      </div>
    </div>
  );
}

function SidebarIcon({ className }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <rect
        x="3"
        y="4.5"
        width="18"
        height="15"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M9 4.5v15" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
