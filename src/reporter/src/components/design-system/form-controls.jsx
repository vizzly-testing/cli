/**
 * Form Controls
 * Observatory Design System
 *
 * Input, Textarea, Select, Checkbox, Toggle
 */

import { useId } from 'react';

export function Input({
  label,
  hint,
  error,
  icon: Icon,
  size = 'md',
  className = '',
  value,
  ...props
}) {
  let generatedId = useId();
  let controlId = props.id ?? generatedId;
  let hintId = hint ? `${controlId}-hint` : undefined;
  let errorId = error ? `${controlId}-error` : undefined;
  let describedBy = [props['aria-describedby'], error ? errorId : hintId]
    .filter(Boolean)
    .join(' ');

  let sizeClasses = {
    sm: 'h-8 text-sm px-3',
    md: 'h-10 text-sm px-4',
    lg: 'h-12 text-base px-4',
  };

  let inputClasses = [
    'w-full bg-white/[0.03] border rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-all duration-150',
    'focus:outline-none focus:border-[color-mix(in_srgb,var(--accent-brand)_50%,transparent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent-brand)_20%,transparent)]',
    'hover:border-[var(--vz-border-strong)]',
    error
      ? 'border-[color-mix(in_srgb,var(--accent-danger)_50%,transparent)] focus:border-[color-mix(in_srgb,var(--accent-danger)_50%,transparent)] focus:ring-[color-mix(in_srgb,var(--accent-danger)_20%,transparent)]'
      : 'border-[var(--vz-border)]',
    sizeClasses[size],
    Icon ? 'pl-10' : '',
    props.disabled ? 'opacity-50 cursor-not-allowed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={controlId}
          className="block text-sm font-medium text-[var(--text-secondary)]"
        >
          {label}
          {props.required && (
            <span className="text-[var(--accent-danger)] ml-1">*</span>
          )}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <input
          {...props}
          id={controlId}
          className={inputClasses}
          value={value ?? ''}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : props['aria-invalid']}
        />
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-[var(--text-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-[var(--accent-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

export function Textarea({
  label,
  hint,
  error,
  className = '',
  rows = 4,
  value,
  ...props
}) {
  let generatedId = useId();
  let controlId = props.id ?? generatedId;
  let hintId = hint ? `${controlId}-hint` : undefined;
  let errorId = error ? `${controlId}-error` : undefined;
  let describedBy = [props['aria-describedby'], error ? errorId : hintId]
    .filter(Boolean)
    .join(' ');

  let textareaClasses = [
    'w-full bg-white/[0.03] border rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-all duration-150 p-4 text-sm',
    'focus:outline-none focus:border-[color-mix(in_srgb,var(--accent-brand)_50%,transparent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent-brand)_20%,transparent)]',
    'hover:border-[var(--vz-border-strong)] resize-y min-h-[100px]',
    error
      ? 'border-[color-mix(in_srgb,var(--accent-danger)_50%,transparent)] focus:border-[color-mix(in_srgb,var(--accent-danger)_50%,transparent)] focus:ring-[color-mix(in_srgb,var(--accent-danger)_20%,transparent)]'
      : 'border-[var(--vz-border)]',
    props.disabled ? 'opacity-50 cursor-not-allowed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={controlId}
          className="block text-sm font-medium text-[var(--text-secondary)]"
        >
          {label}
          {props.required && (
            <span className="text-[var(--accent-danger)] ml-1">*</span>
          )}
        </label>
      )}
      <textarea
        {...props}
        id={controlId}
        className={textareaClasses}
        rows={rows}
        value={value ?? ''}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : props['aria-invalid']}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-[var(--text-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-[var(--accent-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

export function Select({
  label,
  hint,
  error,
  options,
  placeholder,
  size = 'md',
  className = '',
  children,
  ...props
}) {
  let generatedId = useId();
  let controlId = props.id ?? generatedId;
  let hintId = hint ? `${controlId}-hint` : undefined;
  let errorId = error ? `${controlId}-error` : undefined;
  let describedBy = [props['aria-describedby'], error ? errorId : hintId]
    .filter(Boolean)
    .join(' ');

  let sizeClasses = {
    sm: 'h-8 text-sm px-3',
    md: 'h-10 text-sm px-4',
    lg: 'h-12 text-base px-4',
  };

  let selectClasses = [
    'w-full bg-white/[0.03] border rounded-lg text-[var(--text-primary)] transition-all duration-150 appearance-none cursor-pointer',
    'focus:outline-none focus:border-[color-mix(in_srgb,var(--accent-brand)_50%,transparent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent-brand)_20%,transparent)]',
    'hover:border-[var(--vz-border-strong)]',
    error
      ? 'border-[color-mix(in_srgb,var(--accent-danger)_50%,transparent)]'
      : 'border-[var(--vz-border)]',
    sizeClasses[size],
    props.disabled ? 'opacity-50 cursor-not-allowed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Support both children (native options) and options prop
  let hasChildren = children != null;

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={controlId}
          className="block text-sm font-medium text-[var(--text-secondary)]"
        >
          {label}
          {props.required && (
            <span className="text-[var(--accent-danger)] ml-1">*</span>
          )}
        </label>
      )}
      <div className="relative">
        <select
          {...props}
          id={controlId}
          className={selectClasses}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : props['aria-invalid']}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {hasChildren
            ? children
            : options?.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-[var(--text-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-[var(--accent-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  className = '',
  ...props
}) {
  return (
    <label
      className={`flex items-start gap-3 cursor-pointer group ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      <div className="relative flex items-center justify-center mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only peer"
          {...props}
        />
        <div className="w-5 h-5 border border-[var(--vz-border)] rounded bg-white/[0.03] transition-all peer-checked:bg-[var(--accent-brand)] peer-checked:border-[var(--accent-brand)] peer-focus-visible:ring-2 peer-focus-visible:ring-[color-mix(in_srgb,var(--accent-brand)_50%,transparent)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--vz-bg)] group-hover:border-[var(--vz-border-strong)]"></div>
        {checked && (
          <svg
            className="absolute w-3 h-3 text-[var(--vz-bg)] pointer-events-none"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
      <div className="flex-1">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {label}
        </span>
        {description && (
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {description}
          </p>
        )}
      </div>
    </label>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  size = 'md',
  className = '',
  ...props
}) {
  let sizes = {
    sm: {
      track: 'w-8 h-5',
      thumb: 'w-3.5 h-3.5',
      translate: 'translate-x-3.5',
    },
    md: { track: 'w-11 h-6', thumb: 'w-4 h-4', translate: 'translate-x-5' },
    lg: { track: 'w-14 h-7', thumb: 'w-5 h-5', translate: 'translate-x-7' },
  };

  let { track, thumb, translate } = sizes[size];

  return (
    <label
      className={`flex items-center justify-between gap-3 cursor-pointer group ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {(label || description) && (
        <div className="flex-1">
          {label && (
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {label}
            </span>
          )}
          {description && (
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {description}
            </p>
          )}
        </div>
      )}
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only peer"
          {...props}
        />
        <div
          className={`${track} rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[color-mix(in_srgb,var(--accent-brand)_50%,transparent)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--vz-bg)] ${checked ? 'bg-[var(--accent-brand)]' : 'bg-[var(--vz-border)]'}`}
        />
        <div
          className={`absolute left-1 top-1 ${thumb} rounded-full bg-white shadow-sm transition-transform ${checked ? translate : ''}`}
        />
      </div>
    </label>
  );
}
