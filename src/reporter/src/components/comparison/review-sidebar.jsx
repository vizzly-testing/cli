import {
  CheckIcon,
  ComputerDesktopIcon,
  CubeTransparentIcon,
  DocumentMagnifyingGlassIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { IconButton, SearchInput } from '@vizzly-testing/bear-den';
import {
  DrawerFilterBar,
  DrawerFilterButton,
  DrawerFooter,
  InspectorPanel,
  ReviewQueueItem,
} from '@vizzly-testing/bear-den/review';
import { useEffect, useRef, useState } from 'react';
import { withImageVersion } from '../../utils/image-url.js';
import {
  getComparisonId,
  getResult,
  getReviewMetadata,
  getReviewState,
  groupReviewItems,
} from '../../utils/review.js';

let SIDEBAR_TABS = ['queue', 'details'];
let QUEUE_FILTERS = [
  ['needs-review', 'To Review'],
  ['changes', 'Changes'],
  ['new', 'New'],
  ['all', 'All'],
];
let RESULT_DESCRIPTIONS = { new: 'New screenshot', error: 'Failed to compare' };

export function ReviewSidebar(props) {
  return props.tab == null ? null : <ReviewSidebarContent {...props} />;
}

function ReviewSidebarContent({
  tab,
  onTabChange,
  comparison,
  items,
  total,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  onNavigate,
  isReviewMode,
  showRegions,
  onRegionsChange,
}) {
  let activeRef = useRef(null);
  let [isExpanded, setIsExpanded] = useState(false);
  let selectedId = getComparisonId(comparison);
  let groups = groupReviewItems(items);

  useEffect(() => {
    if (
      tab !== 'queue' ||
      !items.some(item => getComparisonId(item) === selectedId)
    )
      return;
    // Scroll only the queue, never the screenshot canvas or page.
    let item = activeRef.current;
    let container = item?.closest('[data-queue-scroll]');
    if (!container) return;
    let itemRect = item.getBoundingClientRect();
    let containerRect = container.getBoundingClientRect();
    if (itemRect.top < containerRect.top) {
      container.scrollTop += itemRect.top - containerRect.top;
    } else if (itemRect.bottom > containerRect.bottom) {
      container.scrollTop += itemRect.bottom - containerRect.bottom;
    }
  }, [selectedId, tab, items]);

  return (
    <aside
      aria-label="Review sidebar"
      className="fixed inset-x-0 bottom-0 z-50 flex min-h-0 h-[var(--review-sidebar-height)] flex-col overflow-hidden rounded-t-xl border-t border-[var(--bd-border-subtle)] bg-[var(--bd-surface)] shadow-2xl shadow-black/50 sm:relative sm:inset-auto sm:z-auto sm:h-full sm:w-80 sm:shrink-0 sm:rounded-none sm:border-t-0 sm:border-r sm:shadow-none"
      style={{ '--review-sidebar-height': isExpanded ? '85dvh' : '60dvh' }}
    >
      <button
        type="button"
        className="sm:hidden flex h-6 shrink-0 items-center justify-center"
        aria-label={isExpanded ? 'Collapse drawer' : 'Expand drawer'}
        onClick={() => setIsExpanded(current => !current)}
      >
        <span className="h-1 w-10 rounded-full bg-[var(--bd-border-strong)]" />
      </button>
      <div className="flex h-12 shrink-0 items-center border-b border-[var(--bd-border-subtle)] px-2">
        <div role="tablist" aria-label="Review sidebar" className="flex h-full">
          {SIDEBAR_TABS.map(name => (
            <button
              type="button"
              role="tab"
              key={name}
              id={`review-tab-${name}`}
              aria-selected={tab === name}
              aria-controls={`review-panel-${name}`}
              tabIndex={tab === name ? 0 : -1}
              onClick={() => onTabChange(name)}
              onKeyDown={event => {
                if (
                  !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
                    event.key
                  )
                )
                  return;
                event.preventDefault();
                let destinations = {
                  Home: 'queue',
                  End: 'details',
                  ArrowLeft: name === 'queue' ? 'details' : 'queue',
                  ArrowRight: name === 'queue' ? 'details' : 'queue',
                };
                let next = destinations[event.key];
                onTabChange(next);
                document.getElementById(`review-tab-${next}`)?.focus();
              }}
              className="review-sidebar-tab"
            >
              {name === 'queue' ? 'Queue' : 'Details'}
            </button>
          ))}
        </div>
        <IconButton
          className="ml-auto"
          icon={XMarkIcon}
          label="Close sidebar"
          onClick={() => onTabChange(null)}
          size="sm"
          variant="ghost"
        />
      </div>
      {tab === 'queue' ? (
        <div
          className="flex min-h-0 flex-1 flex-col"
          role="tabpanel"
          id="review-panel-queue"
          aria-labelledby="review-tab-queue"
        >
          <div className="px-3 py-2">
            <SearchInput
              aria-label="Search review queue"
              placeholder="Search screenshots…"
              value={search}
              onValueChange={onSearchChange}
            />
          </div>
          <DrawerFilterBar>
            {QUEUE_FILTERS.map(([id, label]) => (
              <DrawerFilterButton
                key={id}
                isActive={filter === id}
                onClick={() => onFilterChange(id)}
              >
                {label}
              </DrawerFilterButton>
            ))}
          </DrawerFilterBar>
          <p className="px-4 py-2 text-xs text-[var(--bd-text-muted)] font-mono">
            {items.length} of {total} items
          </p>
          <div
            className="min-h-0 flex-1 overflow-y-auto bd-scrollbar-thin"
            data-queue-scroll
          >
            <div className="space-y-1 p-2">
              {groups.map(group => {
                let selectedItem = group.variants.find(
                  item => getComparisonId(item) === selectedId
                );
                let selected = Boolean(selectedItem);
                let item = selectedItem || group.variants[0];
                let decision = getReviewState(item);
                return (
                  <div key={group.name} ref={selected ? activeRef : null}>
                    <ReviewQueueItem
                      className="items-center gap-3 px-2 py-1.5"
                      title={group.name}
                      description={RESULT_DESCRIPTIONS[getResult(item)]}
                      selected={selected}
                      onClick={() => onNavigate(item)}
                      leading={
                        <img
                          alt=""
                          src={withImageVersion(
                            item.current || item.baseline,
                            item.timestamp
                          )}
                          className="h-9 w-14 rounded object-cover object-top bg-[var(--bd-raised)]"
                        />
                      }
                      trailing={
                        decision === 'approved' ? (
                          <CheckIcon
                            className="h-4 w-4 text-[var(--bd-success)]"
                            aria-label="Approved"
                          />
                        ) : decision === 'rejected' ? (
                          <XMarkIcon
                            className="h-4 w-4 text-[var(--bd-danger)]"
                            aria-label="Rejected"
                          />
                        ) : group.variants.length > 1 ? (
                          <span className="font-mono text-xs text-[var(--bd-text-muted)]">
                            {group.variants.length}
                          </span>
                        ) : undefined
                      }
                    />
                    {group.variants.length > 1 && (
                      <ul
                        aria-label={`${group.name} variants`}
                        className="ml-[4.25rem] space-y-0.5 py-1"
                      >
                        {group.variants.map(variant => {
                          let metadata = getReviewMetadata(variant);
                          let id = getComparisonId(variant);
                          return (
                            <li key={id}>
                              <button
                                type="button"
                                onClick={() => onNavigate(variant)}
                                aria-current={
                                  id === selectedId ? 'true' : undefined
                                }
                                className="review-variant"
                              >
                                {[
                                  metadata.browser,
                                  metadata.viewport,
                                  metadata.device,
                                  metadata.theme,
                                  metadata.locale,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || variant.name}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
              {items.length === 0 && (
                <p className="py-8 text-center text-xs text-[var(--bd-text-muted)]">
                  {filter === 'needs-review' && !search
                    ? 'All screenshots reviewed!'
                    : 'No screenshots match your filters'}
                </p>
              )}
            </div>
          </div>
          <DrawerFooter className="hidden sm:block text-center text-xs text-[var(--bd-text-muted)]">
            {isReviewMode
              ? 'A approve · R reject · D diff · T view'
              : '↑↓ navigate · B baseline · I details · Space review'}
          </DrawerFooter>
        </div>
      ) : tab === 'details' ? (
        <div
          className="min-h-0 flex-1 overflow-y-auto bd-scrollbar-thin"
          role="tabpanel"
          id="review-panel-details"
          aria-labelledby="review-tab-details"
        >
          <ReviewDetails
            comparison={comparison}
            showRegions={showRegions}
            onRegionsChange={onRegionsChange}
          />
        </div>
      ) : null}
    </aside>
  );
}

function ReviewDetails({ comparison, showRegions, onRegionsChange }) {
  let metadata = getReviewMetadata(comparison);
  return (
    <div className="p-4 space-y-5">
      <InspectorPanel.Section title="Status" icon={CubeTransparentIcon}>
        <InspectorPanel.Row label="Result" value={getResult(comparison)} />
        <InspectorPanel.Row
          label="Decision"
          value={getReviewState(comparison)}
        />
      </InspectorPanel.Section>
      {comparison.warnings?.length > 0 && (
        <InspectorPanel.Section title="Warnings" icon={ExclamationTriangleIcon}>
          {comparison.warnings.map(warning => (
            <InspectorPanel.Row
              key={`${warning.code}-${warning.option}`}
              label={warning.option || 'Warning'}
              value={warning.message}
            />
          ))}
        </InspectorPanel.Section>
      )}
      <InspectorPanel.Section title="Screenshot" icon={ComputerDesktopIcon}>
        {Object.entries(metadata).map(([key, value]) => (
          <InspectorPanel.Row
            key={key}
            label={key.replaceAll('_', ' ')}
            value={String(value)}
            mono={key === 'viewport'}
          />
        ))}
      </InspectorPanel.Section>
      {comparison.diffPercentage != null && (
        <InspectorPanel.Section
          title="Diff Analysis"
          icon={DocumentMagnifyingGlassIcon}
        >
          <InspectorPanel.Row
            label="Changed"
            value={`${Number(comparison.diffPercentage).toFixed(3)}%`}
            mono
          />
          <InspectorPanel.Row
            label="Pixels"
            value={comparison.diffCount?.toLocaleString()}
            mono
          />
          <InspectorPanel.Row
            label="Threshold"
            value={comparison.threshold}
            mono
          />
          {comparison.diffClusters?.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-[var(--bd-text-secondary)]">
              <input
                type="checkbox"
                checked={showRegions}
                onChange={event => onRegionsChange(event.target.checked)}
              />
              Show changed regions
            </label>
          )}
        </InspectorPanel.Section>
      )}
      <InspectorPanel.Section title="Identifier" icon={CubeTransparentIcon}>
        <InspectorPanel.Row
          label="Signature"
          value={comparison.signature || comparison.id}
          mono
          copyable
        />
      </InspectorPanel.Section>
    </div>
  );
}
