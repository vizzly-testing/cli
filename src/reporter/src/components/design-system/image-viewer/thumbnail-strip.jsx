/**
 * Thumbnail Strip Component
 * BearDen Design System - Image Viewer
 *
 * A horizontal thumbnail navigation strip for image galleries
 * Supports lazy loading, auto-scroll to active, and collapsible state
 */

import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';

/**
 * Individual Thumbnail
 */
function Thumbnail({
  src,
  alt,
  label,
  isActive,
  onClick,
  badge,
  statusIcon,
  activeRef,
}) {
  let [loaded, setLoaded] = useState(false);
  let [error, setError] = useState(false);

  return (
    <button
      type="button"
      ref={isActive ? activeRef : null}
      onClick={onClick}
      className={`relative shrink-0 group transition-all duration-200 snap-center ${
        isActive
          ? 'ring-2 ring-[var(--accent-brand)] ring-offset-2 ring-offset-[var(--vz-bg)] rounded-lg scale-110'
          : 'hover:ring-2 hover:ring-[var(--vz-border-strong)] hover:ring-offset-2 hover:ring-offset-[var(--vz-bg)] rounded-lg opacity-60 hover:opacity-100'
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--vz-bg)]`}
    >
      {/* Thumbnail container */}
      <div className="relative w-14 h-20 bg-[var(--vz-raised)] rounded-lg overflow-hidden">
        {/* Image */}
        {src && !error && (
          <img
            src={src}
            alt={alt || label || 'Thumbnail'}
            className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-200 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
        )}

        {/* Fallback */}
        {(!loaded || error || !src) && (
          <div className="absolute inset-0 bg-[var(--vz-raised)] flex items-center justify-center">
            <span className="text-lg font-medium text-[var(--text-muted)]">
              {(label || alt || '?').charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Status icon */}
        {statusIcon && (
          <div className="absolute top-1 right-1 w-3.5 h-3.5 drop-shadow-md">
            {statusIcon}
          </div>
        )}

        {/* Badge */}
        {badge && (
          <div className="absolute bottom-1 left-1 px-1 py-0.5 bg-[var(--vz-elevated)] rounded text-[9px] font-bold text-[var(--text-primary)] shadow-sm">
            {badge}
          </div>
        )}
      </div>

      {/* Hover tooltip */}
      {label && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--vz-elevated)] border border-[var(--vz-border)] text-xs text-[var(--text-secondary)] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg">
          {label}
        </div>
      )}
    </button>
  );
}

/**
 * Thumbnail Strip Component
 *
 * @param {Array} items - Array of { id, src, alt, label, badge, statusIcon }
 * @param {string|number} activeId - ID of the currently active item
 * @param {Function} onSelect - Callback when a thumbnail is clicked: (id) => void
 * @param {boolean} collapsible - Enable collapse/expand functionality
 * @param {boolean} isExpanded - Current expanded state (controlled)
 * @param {Function} onToggle - Callback to toggle expanded state
 * @param {string} navigationHint - Hint text for keyboard navigation
 */
export function ThumbnailStrip({
  items = [],
  activeId,
  onSelect,
  collapsible = false,
  isExpanded = true,
  onToggle,
  navigationHint = 'Use ← → to navigate',
  className = '',
}) {
  let stripRef = useRef(null);
  let activeRef = useRef(null);

  // Find active index
  let activeIndex = items.findIndex(item => item.id === activeId);

  // Scroll active thumbnail into view when activeId changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally trigger on activeId change
  useEffect(() => {
    if (activeRef.current && stripRef.current) {
      let container = stripRef.current;
      let thumb = activeRef.current;
      let scrollLeft =
        thumb.offsetLeft - container.offsetWidth / 2 + thumb.offsetWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, [activeId]);

  if (items.length <= 1) return null;

  // Collapsed state
  if (collapsible && !isExpanded) {
    return (
      <div
        className={`bg-[var(--vz-bg)] border-t border-[var(--vz-border-subtle)] ${className}`}
      >
        <button
          type="button"
          onClick={onToggle}
          className="w-full px-4 py-3 md:py-2 flex items-center justify-center gap-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ChevronUpIcon className="w-4 h-4" />
          <span className="text-xs font-medium">
            {activeIndex + 1} of {items.length} items
          </span>
          <ChevronUpIcon className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`bg-[var(--vz-bg)] border-t border-[var(--vz-border-subtle)] ${className}`}
    >
      <div className="px-3 md:px-4 py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-medium text-[var(--text-tertiary)]">
            {activeIndex + 1} of {items.length}
          </span>
          <div className="flex items-center gap-3">
            {navigationHint && (
              <span className="hidden md:inline text-xs text-[var(--text-muted)]">
                {navigationHint}
              </span>
            )}
            {collapsible && onToggle && (
              <button
                type="button"
                onClick={onToggle}
                className="p-2 md:p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
                title="Collapse strip"
              >
                <ChevronDownIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Thumbnails */}
        <div
          ref={stripRef}
          className="flex gap-2 overflow-x-auto pb-2 md:pb-1 scrollbar-thin snap-x snap-mandatory md:snap-none"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {items.map(item => (
            <Thumbnail
              key={item.id}
              src={item.src}
              alt={item.alt}
              label={item.label}
              badge={item.badge}
              statusIcon={item.statusIcon}
              isActive={item.id === activeId}
              onClick={() => onSelect?.(item.id)}
              activeRef={activeRef}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
