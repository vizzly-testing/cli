/**
 * Zoom Controls Component
 * Observatory Design System - Image Viewer
 *
 * Provides zoom level management for image viewing
 * Supports keyboard shortcuts and touch-friendly mobile variant
 */

import {
  ArrowsPointingInIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useEffect, useState } from 'react';

let ZOOM_PRESETS = [
  { value: 'fit', label: 'Fit', icon: ArrowsPointingInIcon },
  { value: 0.25, label: '25%' },
  { value: 0.5, label: '50%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
  { value: 1.5, label: '150%' },
  { value: 2, label: '200%' },
];

/**
 * Hook for managing zoom state
 */
export function useZoom(defaultZoom = 'fit') {
  let [zoom, setZoom] = useState(defaultZoom);

  let handleZoomChange = useCallback(newZoom => {
    setZoom(newZoom);
  }, []);

  return {
    zoom,
    setZoom: handleZoomChange,
    isActualSize: zoom === 1,
    isFitToScreen: zoom === 'fit',
    zoomPercent: zoom === 'fit' ? null : Math.round(zoom * 100),
  };
}

/**
 * Zoom Controls Component
 *
 * @param {number|'fit'} zoom - Current zoom level (decimal or 'fit')
 * @param {Function} onZoomChange - Callback when zoom changes
 * @param {number} minZoom - Minimum zoom level (default: 0.1)
 * @param {number} maxZoom - Maximum zoom level (default: 3)
 * @param {'default'|'mobile'} variant - Display variant
 * @param {boolean} enableKeyboardShortcuts - Enable keyboard shortcuts (default: true)
 */
export function ZoomControls({
  zoom,
  onZoomChange,
  minZoom = 0.1,
  maxZoom = 3,
  variant = 'default',
  enableKeyboardShortcuts = true,
  className = '',
}) {
  let [isOpen, setIsOpen] = useState(false);

  let zoomIn = useCallback(() => {
    if (zoom === 'fit') {
      onZoomChange(0.75);
    } else {
      let newZoom = Math.min(maxZoom, zoom + 0.25);
      onZoomChange(newZoom);
    }
  }, [zoom, maxZoom, onZoomChange]);

  let zoomOut = useCallback(() => {
    if (zoom === 'fit') {
      onZoomChange(0.5);
    } else {
      let newZoom = Math.max(minZoom, zoom - 0.25);
      onZoomChange(newZoom);
    }
  }, [zoom, minZoom, onZoomChange]);

  let fitToScreen = useCallback(() => {
    onZoomChange('fit');
    setIsOpen(false);
  }, [onZoomChange]);

  let actualSize = useCallback(() => {
    onZoomChange(1);
    setIsOpen(false);
  }, [onZoomChange]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!enableKeyboardShortcuts) return;

    let handleKeyDown = e => {
      // Ignore if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')
        return;

      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        actualSize();
      } else if (e.key === '9') {
        e.preventDefault();
        fitToScreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardShortcuts, zoomIn, zoomOut, actualSize, fitToScreen]);

  let displayValue = zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`;

  // Mobile variant - full-width touch-friendly layout
  if (variant === 'mobile') {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        {/* Quick preset buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {ZOOM_PRESETS.map(preset => (
            <button
              type="button"
              key={preset.value}
              onClick={() => onZoomChange(preset.value)}
              className={`shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                zoom === preset.value
                  ? 'bg-[var(--accent-brand)] text-[var(--vz-bg)] border border-[var(--accent-brand)]'
                  : 'bg-[var(--vz-raised)] text-[var(--text-tertiary)] border border-[var(--vz-border-subtle)]'
              }`}
            >
              {preset.icon && <preset.icon className="w-3.5 h-3.5" />}
              <span>{preset.label}</span>
            </button>
          ))}
        </div>

        {/* Zoom in/out buttons */}
        <div className="flex items-center gap-2 bg-[var(--vz-raised)] rounded-lg p-1 border border-[var(--vz-border-subtle)]">
          <button
            type="button"
            onClick={zoomOut}
            className="flex-1 flex items-center justify-center gap-2 p-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-surface)] rounded-lg transition-colors"
          >
            <MagnifyingGlassMinusIcon className="w-5 h-5" />
            <span className="text-xs">Zoom Out</span>
          </button>

          <div className="px-3 py-2 min-w-[60px] text-center text-sm font-medium text-[var(--text-secondary)] bg-[var(--vz-surface)] rounded-lg">
            {displayValue}
          </div>

          <button
            type="button"
            onClick={zoomIn}
            className="flex-1 flex items-center justify-center gap-2 p-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-surface)] rounded-lg transition-colors"
          >
            <MagnifyingGlassPlusIcon className="w-5 h-5" />
            <span className="text-xs">Zoom In</span>
          </button>
        </div>
      </div>
    );
  }

  // Default desktop variant - matches cloud product styling
  return (
    <div className={`relative flex items-center gap-1.5 ${className}`}>
      {/* Zoom controls */}
      <div className="flex items-center bg-[var(--vz-raised)] rounded-lg p-0.5 border border-[var(--vz-border-subtle)]">
        <button
          type="button"
          onClick={zoomOut}
          className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-surface)] rounded-md transition-all"
          title="Zoom out (−)"
        >
          <MagnifyingGlassMinusIcon className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="px-2 py-2 min-w-[44px] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-surface)] rounded-md transition-all tabular-nums"
          title="Click for zoom presets"
        >
          {displayValue}
        </button>

        <button
          type="button"
          onClick={zoomIn}
          className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-surface)] rounded-md transition-all"
          title="Zoom in (+)"
        >
          <MagnifyingGlassPlusIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Quick actions */}
      <div className="flex items-center bg-[var(--vz-raised)] rounded-lg p-0.5 border border-[var(--vz-border-subtle)]">
        <button
          type="button"
          onClick={fitToScreen}
          className={`p-2 rounded-md transition-all ${
            zoom === 'fit'
              ? 'bg-[var(--accent-brand)] text-[var(--vz-bg)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-surface)]'
          }`}
          title="Fit to screen (9)"
        >
          <ArrowsPointingInIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={actualSize}
          className={`px-2 py-2 rounded-md transition-all text-xs font-medium ${
            zoom === 1
              ? 'bg-[var(--accent-brand)] text-[var(--vz-bg)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--vz-surface)]'
          }`}
          title="Actual size (0)"
        >
          1:1
        </button>
      </div>

      {/* Dropdown presets */}
      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-label="Close zoom presets"
          />
          <div className="absolute top-full left-0 mt-1.5 z-50 bg-[var(--vz-raised)] border border-[var(--vz-border-subtle)] rounded-lg shadow-xl overflow-hidden min-w-[100px]">
            {ZOOM_PRESETS.map(preset => (
              <button
                type="button"
                key={preset.value}
                onClick={() => {
                  onZoomChange(preset.value);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-all ${
                  zoom === preset.value
                    ? 'bg-[var(--accent-brand)] text-[var(--vz-bg)] font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--vz-surface)] hover:text-[var(--text-primary)]'
                }`}
              >
                {preset.icon && <preset.icon className="w-4 h-4" />}
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
