/**
 * Tooltip Component
 * Observatory Design System
 *
 * Hover tooltip for additional context
 */

import { useState } from 'react';

export function Tooltip({
  content,
  children,
  position = 'top',
  className = '',
}) {
  let [isVisible, setIsVisible] = useState(false);
  let [frameId, setFrameId] = useState(null);

  let showTooltip = () => {
    let id = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });
    setFrameId(id);
  };

  let hideTooltip = () => {
    if (frameId) {
      window.cancelAnimationFrame(frameId);
    }
    setIsVisible(false);
  };

  let positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  let arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-[var(--vz-elevated)]',
    bottom:
      'bottom-full left-1/2 -translate-x-1/2 border-b-[var(--vz-elevated)]',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-[var(--vz-elevated)]',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-[var(--vz-elevated)]',
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: tooltip visibility mirrors the hovered child element.
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      {children}
      <div
        className={`absolute z-50 pointer-events-none transition-all duration-150 ${positionClasses[position]} ${
          isVisible ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
      >
        <div className="bg-[var(--vz-elevated)] border border-[var(--vz-border)] rounded-lg px-3 py-2 shadow-xl text-xs text-[var(--text-primary)] whitespace-nowrap">
          {content}
        </div>
        <div
          className={`absolute border-4 border-transparent ${arrowClasses[position]}`}
        />
      </div>
    </div>
  );
}
