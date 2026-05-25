/**
 * DataTable Component
 * BearDen Design System
 *
 * A responsive data table with mobile-first design, sorting, column visibility, and URL persistence.
 *
 * Features:
 * - Mobile card layout (switches from table to cards on small screens)
 * - Column sorting with URL persistence
 * - Column visibility management
 * - Custom cell rendering
 * - Empty state handling
 */

import {
  ChevronDownIcon,
  ChevronUpIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from './empty-state.jsx';

/**
 * Column Settings Popover
 * Allows users to show/hide table columns
 */
export function ColumnSettings({
  columnVisibility,
  onColumnVisibilityChange,
  columnGroups = {},
}) {
  let [open, setOpen] = useState(false);
  let ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  let toggleColumn = key => {
    onColumnVisibilityChange({
      ...columnVisibility,
      [key]: !columnVisibility[key],
    });
  };

  let toggleAll = (groupKey, show) => {
    let cols = columnGroups[groupKey];
    let next = { ...columnVisibility };
    cols.forEach(c => {
      next[c.key] = show;
    });
    onColumnVisibilityChange(next);
  };

  let visible = Object.values(columnVisibility).filter(Boolean).length;
  let total = Object.keys(columnVisibility).length;

  if (Object.keys(columnGroups).length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg transition-colors bg-[var(--vz-raised)] border-[var(--vz-border)] text-[var(--text-secondary)] hover:border-[var(--vz-border-strong)] hover:text-[var(--text-primary)]"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <Cog6ToothIcon className="w-4 h-4" />
        <span>
          Columns ({visible}/{total})
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-[var(--vz-raised)] border border-[var(--vz-border)] rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--vz-border-subtle)] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Table Columns
            </h3>
            <span className="text-xs text-[var(--text-tertiary)]">
              {visible} of {total} visible
            </span>
          </div>

          {Object.entries(columnGroups).map(([groupKey, cols]) => {
            let onCount = cols.filter(c => columnVisibility[c.key]).length;
            let groupTotal = cols.length;

            return (
              <div
                key={groupKey}
                className="border-b border-[var(--vz-border-subtle)] last:border-b-0"
              >
                <div className="px-4 py-2 flex items-center justify-between bg-[var(--vz-surface)]">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    {groupKey}{' '}
                    <span className="text-[var(--text-muted)]">
                      ({onCount}/{groupTotal})
                    </span>
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => toggleAll(groupKey, true)}
                      disabled={onCount === groupTotal}
                      className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      All
                    </button>
                    <span className="text-[var(--text-muted)]">|</span>
                    <button
                      type="button"
                      onClick={() => toggleAll(groupKey, false)}
                      disabled={onCount === 0}
                      className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      None
                    </button>
                  </div>
                </div>

                <div className="p-2 space-y-1">
                  {cols.map(col => {
                    let isOn = columnVisibility[col.key] || false;
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                          isOn
                            ? 'bg-white/8 text-[var(--text-primary)]'
                            : 'text-[var(--text-tertiary)] hover:bg-white/5'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={isOn}
                          onChange={() => toggleColumn(col.key)}
                        />
                        <span
                          className={`w-8 h-4 rounded-full transition-colors relative ${isOn ? 'bg-[var(--accent-brand)]' : 'bg-[var(--vz-border)]'}`}
                        >
                          <span
                            className={`absolute top-0.5 w-3 h-3 bg-[var(--text-primary)] rounded-full transition-transform ${isOn ? 'left-4' : 'left-0.5'}`}
                          />
                        </span>
                        <span className="text-sm">{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Default mobile card renderer
 */
function DefaultMobileCard({ row, columns, onRowClick, index }) {
  let cardColumns = columns.filter(col => col.key !== 'actions');
  let actionsColumn = columns.find(col => col.key === 'actions');
  let handleRowClick = onRowClick ? () => onRowClick(row, index) : undefined;
  let handleKeyDown = e => {
    if (!onRowClick || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    onRowClick(row, index);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mobile rows preserve table-card layout while forwarding keyboard activation.
    <div
      className={`bg-white/5 backdrop-blur-sm border border-[var(--vz-border)] rounded-lg p-4 space-y-3 hover:bg-white/10 transition-colors ${
        onRowClick ? 'cursor-pointer' : ''
      }`}
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
      role={onRowClick ? 'button' : undefined}
      tabIndex={onRowClick ? 0 : undefined}
    >
      {cardColumns.map((column, colIndex) => {
        let value = column.mobileRender
          ? column.mobileRender(row, index)
          : column.render
            ? column.render(row, index)
            : row[column.key];

        return (
          <div
            key={column.key}
            className={
              colIndex === 0
                ? 'pb-2 border-b border-[var(--vz-border-subtle)]'
                : ''
            }
          >
            {colIndex === 0 ? (
              <div className="flex items-center justify-between">
                <div className="flex-1">{value}</div>
                {actionsColumn && (
                  <div className="ml-4 shrink-0">
                    {actionsColumn.render(row, index)}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-tertiary)] font-medium">
                  {column.label}
                </span>
                <div className="text-[var(--text-secondary)]">{value}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * DataTable Component
 *
 * @param {Array} data - Array of data objects to display
 * @param {Array} columns - Column definitions: { key, label, sortable, width, minWidth, render, mobileRender, priority }
 * @param {Object} columnVisibility - Object mapping column keys to visibility boolean
 * @param {Function} onColumnVisibilityChange - Callback when column visibility changes
 * @param {String} sortBy - Current sort column key
 * @param {String} sortOrder - 'asc' or 'desc'
 * @param {Function} onSortChange - Callback: (columnKey, direction) => void
 * @param {Object} columnGroups - Groups for column settings: { 'Group Name': [{ key, label }] }
 * @param {Array} mobileColumns - Column keys to show on mobile (defaults to priority columns)
 * @param {Function} onRowClick - Optional row click handler
 * @param {Function} renderMobileCard - Custom mobile card renderer: (row, columns, index) => ReactNode
 * @param {ReactNode} emptyState - Custom empty state, or use emptyStateTitle/emptyStateMessage
 * @param {String} emptyStateTitle - Title for default empty state
 * @param {String} emptyStateMessage - Message for default empty state
 * @param {ReactNode} emptyStateIcon - Icon for default empty state
 * @param {ReactNode} toolbar - Content to render above the table
 * @param {ReactNode} footer - Content to render below the table
 * @param {Boolean} persistToUrl - Whether to persist sort/column state to URL (default: false)
 * @param {Function} onUrlChange - Callback to update URL: (params) => void
 */
export function DataTable({
  data = [],
  columns = [],
  columnVisibility = {},
  onColumnVisibilityChange,
  sortBy,
  sortOrder = 'desc',
  onSortChange,
  columnGroups = {},
  mobileColumns = [],
  onRowClick,
  renderMobileCard,
  emptyState,
  emptyStateTitle = 'No data',
  emptyStateMessage = 'No data to display.',
  emptyStateIcon,
  toolbar,
  footer,
  persistToUrl = false,
  onUrlChange,
  className = '',
}) {
  let [isMobile, setIsMobile] = useState(false);
  let [sortConfig, setSortConfig] = useState({
    key: sortBy,
    direction: sortOrder,
  });

  // Track screen size
  useEffect(() => {
    let checkScreenSize = () => setIsMobile(window.innerWidth < 768);
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Update URL when sort changes (if enabled)
  let updateUrl = useCallback(
    (newSortConfig, newVisibility) => {
      if (!persistToUrl || !onUrlChange) return;

      let params = {};
      if (newSortConfig?.key) params.sortBy = newSortConfig.key;
      if (newSortConfig?.direction) params.sortOrder = newSortConfig.direction;
      if (newVisibility) {
        let visibleCols = Object.entries(newVisibility)
          .filter(([, v]) => v)
          .map(([k]) => k);
        if (visibleCols.length > 0) params.cols = visibleCols.join(',');
      }
      onUrlChange(params);
    },
    [persistToUrl, onUrlChange]
  );

  // Sorting logic
  let sortedData = useMemo(() => {
    if (!sortConfig.key || !data.length) return data;

    return [...data].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Handle dates
      if (sortConfig.key.includes('_at') || aVal instanceof Date) {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      // Handle nulls (sort last)
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // String comparison
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortConfig]);

  // Filter visible columns
  let visibleColumns = useMemo(() => {
    if (isMobile) {
      let mobileKeys =
        mobileColumns.length > 0
          ? mobileColumns
          : columns
              .filter(col => col.priority === 'high' || col.key === 'actions')
              .slice(0, 3)
              .map(col => col.key);
      return columns.filter(col => mobileKeys.includes(col.key));
    }
    return columns.filter(col => columnVisibility[col.key] !== false);
  }, [columns, columnVisibility, isMobile, mobileColumns]);

  // Handle sort
  let handleSort = useCallback(
    columnKey => {
      let newConfig = {
        key: columnKey,
        direction:
          sortConfig.key === columnKey && sortConfig.direction === 'asc'
            ? 'desc'
            : 'asc',
      };
      setSortConfig(newConfig);
      updateUrl(newConfig, null);
      onSortChange?.(columnKey, newConfig.direction);
    },
    [sortConfig, updateUrl, onSortChange]
  );

  // Handle column visibility
  let handleColumnVisibilityChange = useCallback(
    newVisibility => {
      onColumnVisibilityChange?.(newVisibility);
      updateUrl(null, newVisibility);
    },
    [onColumnVisibilityChange, updateUrl]
  );

  // Empty state
  if (sortedData.length === 0) {
    if (emptyState) return emptyState;
    return (
      <div
        className={`bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-xl p-12 ${className}`}
      >
        <EmptyState
          icon={emptyStateIcon}
          title={emptyStateTitle}
          description={emptyStateMessage}
        />
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Toolbar */}
      {(toolbar || Object.keys(columnGroups).length > 0) && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex-1 min-w-0">{toolbar}</div>
          {!isMobile && Object.keys(columnGroups).length > 0 && (
            <ColumnSettings
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={handleColumnVisibilityChange}
              columnGroups={columnGroups}
            />
          )}
        </div>
      )}

      {/* Mobile Card Layout */}
      {isMobile ? (
        <div className="space-y-3">
          {sortedData.map((row, index) =>
            renderMobileCard ? (
              <div key={row.id || index}>
                {renderMobileCard(row, visibleColumns, index)}
              </div>
            ) : (
              <DefaultMobileCard
                key={row.id || index}
                row={row}
                columns={visibleColumns}
                onRowClick={onRowClick}
                index={index}
              />
            )
          )}
        </div>
      ) : (
        /* Desktop Table */
        <div className="bg-[var(--vz-surface)] border border-[var(--vz-border)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--vz-border-subtle)] bg-[var(--vz-raised)]">
                  {visibleColumns.map(column => (
                    <th
                      key={column.key}
                      className="px-6 py-4 text-left text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider"
                      style={{ width: column.width, minWidth: column.minWidth }}
                    >
                      {column.sortable ? (
                        <button
                          type="button"
                          onClick={() => handleSort(column.key)}
                          className="flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
                        >
                          {column.label}
                          {sortConfig.key === column.key &&
                            (sortConfig.direction === 'asc' ? (
                              <ChevronUpIcon className="w-3 h-3" />
                            ) : (
                              <ChevronDownIcon className="w-3 h-3" />
                            ))}
                        </button>
                      ) : (
                        column.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedData.map((row, index) => (
                  <tr
                    key={row.id || index}
                    className={`border-b border-[var(--vz-border-subtle)] hover:bg-[var(--vz-raised)] transition-colors ${
                      onRowClick ? 'cursor-pointer' : ''
                    }`}
                    onClick={
                      onRowClick ? () => onRowClick(row, index) : undefined
                    }
                  >
                    {visibleColumns.map(column => (
                      <td
                        key={column.key}
                        className="px-6 py-5 text-sm align-top"
                      >
                        {column.render
                          ? column.render(row, index)
                          : row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      {footer && (
        <div className="flex items-center gap-3 sm:gap-6 text-sm text-[var(--text-tertiary)] flex-wrap">
          {footer}
        </div>
      )}
    </div>
  );
}
