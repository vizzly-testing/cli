/**
 * MobileDrawer Component
 * BearDen Design System
 *
 * A responsive drawer/sidebar component that:
 * - On mobile: Slides up from bottom as a sheet (or from side)
 * - On desktop: Fixed sidebar or toggleable panel
 *
 * Features:
 * - Expandable bottom sheets (tap drag handle to expand)
 * - Backdrop overlay on mobile
 * - Keyboard accessible (Escape to close)
 * - Multiple positions (left, right, bottom)
 *
 * Child components (like DrawerHeader) automatically receive:
 * - isExpanded: boolean - Current expand state
 * - onToggleExpand: function - Toggle expand/collapse
 */

import { XMarkIcon } from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useRef, useState } from 'react';

// Global escape key handler - single listener for all drawers
let escapeCallbacks = new Set();

function registerEscapeHandler(callback) {
  if (escapeCallbacks.size === 0) {
    document.addEventListener('keydown', globalEscapeHandler);
  }
  escapeCallbacks.add(callback);
  return () => {
    escapeCallbacks.delete(callback);
    if (escapeCallbacks.size === 0) {
      document.removeEventListener('keydown', globalEscapeHandler);
    }
  };
}

function globalEscapeHandler(e) {
  if (e.key === 'Escape') {
    // Call the most recently registered callback (top-most drawer)
    let callbacks = Array.from(escapeCallbacks);
    let lastCallback = callbacks[callbacks.length - 1];
    lastCallback?.();
  }
}

/*
 * Tailwind Safelist - these classes are used dynamically and must be scanned.
 * DO NOT REMOVE - Tailwind's scanner reads this comment block.
 *
 * Display: flex hidden sm:flex sm:hidden
 * Position: fixed relative sm:relative z-50 sm:z-auto
 * Inset: inset-x-0 inset-y-0 bottom-0 left-0 right-0 sm:inset-auto
 * Width: w-64 w-72 w-80 w-96 sm:w-64 sm:w-72 sm:w-80 sm:w-96 w-[85vw] max-w-xs
 * Border: border-t border-l border-r sm:border-t-0 sm:border-b-0 sm:border-l sm:border-r
 * Border color: tokenized through --vz-border-subtle
 * Radius: rounded-t-xl sm:rounded-none
 * Shadow: shadow-2xl shadow-black/50 sm:shadow-none
 * Animation: animate-in fade-in slide-in-from-bottom slide-in-from-left slide-in-from-right sm:animate-none duration-150 duration-200
 */

// Width classes - complete strings for Tailwind scanning
let widthClasses = {
  'w-64': { mobile: 'w-64', desktop: 'sm:w-64' },
  'w-72': { mobile: 'w-72', desktop: 'sm:w-72' },
  'w-80': { mobile: 'w-80', desktop: 'sm:w-80' },
  'w-96': { mobile: 'w-96', desktop: 'sm:w-96' },
};

// Position classes for mobile
let mobilePositionClasses = {
  bottom: 'inset-x-0 bottom-0 rounded-t-xl',
  left: 'inset-y-0 left-0 w-[85vw] max-w-xs',
  right: 'inset-y-0 right-0 w-[85vw] max-w-xs',
};

// Border classes by position
let borderClasses = {
  bottom: 'border-t',
  left: 'border-r',
  right: 'border-l',
};

// Animation classes by position
let animationClasses = {
  bottom: 'animate-in slide-in-from-bottom duration-200',
  left: 'animate-in slide-in-from-left duration-200',
  right: 'animate-in slide-in-from-right duration-200',
};

/**
 * MobileDrawer - Responsive drawer component
 *
 * @param {boolean} isOpen - Whether the drawer is open
 * @param {function} onClose - Callback when drawer should close
 * @param {string} position - 'left' | 'right' | 'bottom' (mobile behavior)
 * @param {string} desktopPosition - 'left' | 'right' | 'none' (desktop behavior)
 * @param {string} width - Width on desktop (e.g., 'w-72', 'w-80')
 * @param {string} mobileHeight - Initial height on mobile for bottom sheets (e.g., '30vh')
 * @param {string} expandedHeight - Expanded height on mobile for bottom sheets (e.g., '80vh')
 * @param {boolean} showBackdrop - Show backdrop overlay on mobile
 * @param {boolean} alwaysVisibleOnDesktop - If true, always shows on desktop; if false, respects isOpen
 * @param {ReactNode} children - Drawer content (receives isExpanded, onToggleExpand props)
 */

export function MobileDrawer({
  isOpen,
  onClose,
  position = 'left',
  desktopPosition = 'left',
  width = 'w-72',
  mobileHeight = '70vh',
  expandedHeight = '90vh',
  showBackdrop = true,
  alwaysVisibleOnDesktop = true, // If false, respects isOpen on desktop too
  children,
  className = '',
  testId,
}) {
  let drawerRef = useRef(null);
  let widthConfig = widthClasses[width] || widthClasses['w-72'];
  let [isExpanded, setIsExpanded] = useState(false);

  // Reset expanded state when drawer closes
  useEffect(() => {
    if (!isOpen) setIsExpanded(false);
  }, [isOpen]);

  let handleToggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Current height based on expand state (as raw value for inline style)
  let currentHeight = isExpanded ? expandedHeight : mobileHeight;

  // Close on escape - uses global handler to avoid multiple listeners
  useEffect(() => {
    if (!isOpen || !onClose) return;
    return registerEscapeHandler(onClose);
  }, [isOpen, onClose]);

  // Handle click outside on mobile
  let handleBackdropClick = useCallback(
    e => {
      if (e.target === e.currentTarget) {
        onClose?.();
      }
    },
    [onClose]
  );

  // Desktop border direction
  let desktopBorderClass =
    desktopPosition === 'left' ? 'sm:border-r' : 'sm:border-l';

  // If desktopPosition is 'none', only render on mobile when open
  if (desktopPosition === 'none') {
    if (!isOpen) return null;

    return (
      <>
        {showBackdrop && (
          <div
            className="fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-150"
            onClick={handleBackdropClick}
            aria-hidden="true"
          />
        )}
        <aside
          ref={drawerRef}
          data-testid={testId}
          data-expanded={isExpanded}
          className={`
            fixed z-50
            ${mobilePositionClasses[position]}
            ${position === 'bottom' ? 'mobile-drawer-height' : 'h-full'}
            bg-[var(--vz-surface)] ${borderClasses[position]} border-[var(--vz-border-subtle)]
            flex flex-col overflow-hidden
            shadow-2xl shadow-black/50
            ${animationClasses[position]}
            transition-[height] duration-200 ease-out
            ${className}
          `}
          style={
            position === 'bottom'
              ? { '--mobile-height': currentHeight }
              : undefined
          }
          role="dialog"
          aria-modal="true"
        >
          {React.Children.map(children, child =>
            React.isValidElement(child)
              ? React.cloneElement(child, {
                  isExpanded,
                  onToggleExpand: handleToggleExpand,
                })
              : child
          )}
        </aside>
      </>
    );
  }

  // Desktop + Mobile: Single element with responsive classes
  return (
    <>
      {/* Mobile backdrop - only when open on mobile */}
      {showBackdrop && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 sm:hidden animate-in fade-in duration-150"
          onClick={handleBackdropClick}
          aria-hidden="true"
        />
      )}

      {/* Single drawer element - responsive behavior */}
      <div
        ref={drawerRef}
        data-testid={testId}
        data-expanded={isExpanded}
        data-open={isOpen}
        className={`
          ${isOpen ? 'flex' : 'hidden'} ${alwaysVisibleOnDesktop ? 'sm:flex' : ''}

          fixed z-50 sm:relative sm:z-auto
          ${mobilePositionClasses[position]} sm:inset-auto
          ${position === 'bottom' ? 'mobile-drawer-height' : 'h-full'}
          ${position === 'bottom' ? widthConfig.desktop : width}

          bg-[var(--vz-surface)]
          ${borderClasses[position]} sm:border-t-0 sm:border-b-0 ${desktopBorderClass}
          border-[var(--vz-border-subtle)]
          sm:rounded-none

          flex-col overflow-hidden
          shadow-2xl shadow-black/50 sm:shadow-none
          transition-[height] duration-200 ease-out

          ${isOpen ? animationClasses[position] : ''} sm:animate-none
          ${className}
        `}
        style={
          position === 'bottom'
            ? { '--mobile-height': currentHeight }
            : undefined
        }
        role="dialog"
        aria-modal={isOpen ? 'true' : undefined}
      >
        {React.Children.map(children, child =>
          React.isValidElement(child)
            ? React.cloneElement(child, {
                isExpanded,
                onToggleExpand: handleToggleExpand,
              })
            : child
        )}
      </div>
    </>
  );
}

/**
 * DrawerHeader - Header with title and close button
 * Includes expandable drag handle for mobile bottom sheets
 */
export function DrawerHeader({
  title,
  subtitle,
  onClose,
  children,
  className = '',
  isExpanded,
  onToggleExpand,
}) {
  return (
    <div
      className={`flex-shrink-0 px-4 py-3 border-b border-[var(--vz-border-subtle)] ${className}`}
    >
      {/* Drag handle - tap to expand/collapse on mobile */}
      {onToggleExpand && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="sm:hidden w-full flex justify-center py-1 mb-1 -mt-1 active:scale-95 transition-transform"
          aria-label={isExpanded ? 'Collapse drawer' : 'Expand drawer'}
        >
          <div className="w-10 h-1 rounded-full bg-[var(--vz-border-strong)] hover:bg-[var(--text-muted)] transition-colors" />
        </button>
      )}

      <div className="flex items-center justify-between">
        <div>
          {title && (
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--vz-raised)] transition-colors"
            title="Close"
            aria-label="Close"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {children}
    </div>
  );
}

/**
 * DrawerContent - Scrollable content area
 */
export function DrawerContent({ children, className = '' }) {
  return (
    <div
      className={`
        flex-1 overflow-y-auto
        scrollbar-thin scrollbar-thumb-[var(--vz-border-strong)] scrollbar-track-transparent
        ${className}
      `}
    >
      {children}
    </div>
  );
}

/**
 * DrawerFooter - Fixed footer area
 */
export function DrawerFooter({ children, className = '' }) {
  return (
    <div
      className={`
        flex-shrink-0
        px-4 py-2
        border-t border-[var(--vz-border-subtle)]
        safe-area-pb
        ${className}
      `}
    >
      {children}
    </div>
  );
}

/**
 * DrawerFilterBar - Filter/tab bar for drawers
 */
export function DrawerFilterBar({ children, className = '' }) {
  return (
    <div
      className={`
        flex-shrink-0
        px-3 py-2
        border-b border-[var(--vz-border-subtle)]
        flex items-center gap-1
        ${className}
      `}
    >
      {children}
    </div>
  );
}

/**
 * DrawerFilterButton - Individual filter button
 */
export function DrawerFilterButton({
  isActive,
  onClick,
  children,
  className = '',
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap
        transition-all active:scale-[0.98]
        ${
          isActive
            ? 'bg-[var(--accent-brand-muted)] text-[var(--accent-brand)] ring-1 ring-[color-mix(in_srgb,var(--accent-brand)_30%,transparent)]'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--vz-raised)] active:bg-[var(--vz-elevated)]'
        }
        ${className}
      `}
    >
      {children}
    </button>
  );
}

/**
 * CloseButton - Standalone close button for headers
 */
export function CloseButton({ onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]
        hover:bg-[var(--vz-raised)] rounded-lg
        transition-colors
        ${className}
      `}
      title="Close (Esc)"
      aria-label="Close"
    >
      <XMarkIcon className="w-5 h-5" />
    </button>
  );
}

export default MobileDrawer;
