/**
 * Dropdown Component
 * BearDen Design System
 *
 * A simple dropdown menu with trigger button
 */

import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';

export function Dropdown({
  trigger,
  children,
  align = 'left',
  className = '',
  menuClassName = '',
  disabled = false,
}) {
  let [isOpen, setIsOpen] = useState(false);
  let containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    let handleClickOutside = event => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    let handleEscape = event => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  let alignmentClasses = {
    left: 'left-0',
    right: 'right-0',
    center: 'left-1/2 -translate-x-1/2',
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2 bg-[var(--vz-raised)] hover:bg-[var(--vz-elevated)] text-[var(--text-primary)] border border-[var(--vz-border)] rounded-lg transition-colors disabled:opacity-85 disabled:cursor-not-allowed"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {trigger}
        <ChevronDownIcon
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute top-full mt-2 min-w-[12rem] bg-[var(--vz-raised)] border border-[var(--vz-border)] rounded-xl shadow-xl z-50 overflow-hidden ${alignmentClasses[align]} ${menuClassName}`}
          role="menu"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  onClick,
  children,
  variant = 'default',
  disabled = false,
  icon: Icon,
  className = '',
}) {
  let variantClasses = {
    default:
      'text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]',
    primary: 'text-[var(--accent-brand)] hover:bg-[var(--accent-brand-muted)]',
    danger: 'text-[var(--accent-danger)] hover:bg-[var(--accent-danger-muted)]',
    success:
      'text-[var(--accent-success)] hover:bg-[var(--accent-success-muted)]',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      role="menuitem"
    >
      {Icon && <Icon className="w-4 h-4 shrink-0" />}
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <hr className="h-px bg-[var(--vz-border-subtle)] my-1 border-0" />;
}

export function DropdownHeader({ children, className = '' }) {
  return (
    <div
      className={`px-4 py-2 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider ${className}`}
    >
      {children}
    </div>
  );
}
