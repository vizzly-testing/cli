/**
 * ReviewMode Component
 * Observatory Design System
 *
 * Provides a "review mode" for keyboard-driven screenshot review workflows.
 * When active, enables keyboard shortcuts for approval, rejection, and view manipulation.
 *
 * Features:
 * - Space to enter review mode
 * - Esc to exit review mode
 * - Visual indicator when active
 * - Configurable shortcuts
 * - Accessible announcements
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

let ReviewModeContext = createContext(null);

/**
 * ReviewModeProvider - Wrap your review UI with this to enable review mode
 */
export function ReviewModeProvider({ children, defaultActive = false }) {
  let [isActive, setIsActive] = useState(defaultActive);

  let enter = useCallback(() => setIsActive(true), []);
  let exit = useCallback(() => setIsActive(false), []);
  let toggle = useCallback(() => setIsActive(prev => !prev), []);

  // Handle Space to toggle review mode
  useEffect(() => {
    let handleKeyDown = e => {
      // Don't trigger in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')
        return;

      if (e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  let value = {
    isActive,
    enter,
    exit,
    toggle,
  };

  return (
    <ReviewModeContext.Provider value={value}>
      {children}
    </ReviewModeContext.Provider>
  );
}

/**
 * useReviewMode - Access review mode state and actions
 */
export function useReviewMode() {
  let context = useContext(ReviewModeContext);
  if (!context) {
    throw new Error('useReviewMode must be used within a ReviewModeProvider');
  }
  return context;
}

/**
 * useReviewModeShortcuts - Register keyboard shortcuts that only work in review mode
 *
 * @param {Object} shortcuts - Map of key to handler function
 * @param {Object} options - Additional options
 *
 * Example:
 * useReviewModeShortcuts({
 *   'a': () => handleApprove(),
 *   'r': () => handleReject(),
 *   'd': () => toggleDiff(),
 *   't': () => cycleViewMode(),
 * });
 */
export function useReviewModeShortcuts(shortcuts, options = {}) {
  let { isActive } = useReviewMode();
  let { enabled = true } = options;

  useEffect(() => {
    if (!isActive || !enabled) return;

    let handleKeyDown = e => {
      // Don't trigger in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')
        return;
      // Don't trigger with modifiers (except shift for uppercase)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      let key = e.key.toLowerCase();
      let handler = shortcuts[key];

      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, enabled, shortcuts]);
}

/**
 * ReviewModeHint - Shows how to enter/exit review mode
 */
export function ReviewModeHint({ className = '' }) {
  let { isActive } = useReviewMode();

  return (
    <span className={`text-xs text-[var(--text-muted)] ${className}`}>
      <span className="text-[var(--text-tertiary)]">Space</span>{' '}
      {isActive ? 'exit review' : 'review mode'}
    </span>
  );
}

/**
 * ReviewModeShortcutsHint - Shows available shortcuts when in review mode
 */
export function ReviewModeShortcutsHint({
  showApprove = true,
  showReject = true,
  showDiff = true,
  showViewMode = true,
  className = '',
}) {
  let { isActive } = useReviewMode();

  if (!isActive) {
    return (
      <p className={`text-xs text-[var(--text-muted)] ${className}`}>
        <span className="text-[var(--text-tertiary)]">Space</span> to enter
        review mode
      </p>
    );
  }

  return (
    <p
      className={`text-xs text-[var(--text-muted)] whitespace-nowrap ${className}`}
    >
      {showApprove && (
        <>
          <span className="text-[var(--accent-success)] font-medium">A</span>{' '}
          approve
        </>
      )}
      {showReject && (
        <>
          {' · '}
          <span className="text-[var(--accent-danger)] font-medium">R</span>{' '}
          reject
        </>
      )}
      {showDiff && (
        <>
          {' · '}
          <span className="text-[var(--text-tertiary)] font-medium">D</span>{' '}
          diff
        </>
      )}
      {showViewMode && (
        <>
          {' · '}
          <span className="text-[var(--text-tertiary)] font-medium">T</span>{' '}
          view
        </>
      )}
      {' · '}
      <span className="text-[var(--text-tertiary)]">Space</span> exit
    </p>
  );
}

export default ReviewModeProvider;
