/**
 * Form Controls
 * Observatory Design System
 *
 * Input, Select, Checkbox, Toggle
 */

export function Input({
  label,
  hint,
  error,
  icon: Icon,
  size = 'md',
  className = '',
  ...props
}) {
  let sizeClasses = {
    sm: 'h-8 text-sm px-3',
    md: 'h-10 text-sm px-4',
    lg: 'h-12 text-base px-4',
  };

  let inputClasses = [
    'w-full bg-white/[0.03] border rounded-lg text-white placeholder-slate-500 transition-all duration-150',
    'focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20',
    'hover:border-slate-600',
    error
      ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20'
      : 'border-slate-700',
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
        <label className="block text-sm font-medium text-slate-300">
          {label}
          {props.required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <input className={inputClasses} {...props} />
      </div>
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function Select({
  label,
  hint,
  error,
  options = [],
  placeholder = 'Select an option',
  size = 'md',
  className = '',
  ...props
}) {
  let sizeClasses = {
    sm: 'h-8 text-sm px-3',
    md: 'h-10 text-sm px-4',
    lg: 'h-12 text-base px-4',
  };

  let selectClasses = [
    'w-full bg-white/[0.03] border rounded-lg text-white transition-all duration-150 appearance-none cursor-pointer',
    'focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20',
    'hover:border-slate-600',
    error ? 'border-red-500/50' : 'border-slate-700',
    sizeClasses[size],
    props.disabled ? 'opacity-50 cursor-not-allowed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-slate-300">
          {label}
          {props.required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <select className={selectClasses} {...props}>
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
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
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
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
        <div className="w-5 h-5 border border-slate-600 rounded bg-white/[0.03] transition-all peer-checked:bg-amber-500 peer-checked:border-amber-500 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-500/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-900 group-hover:border-slate-500">
          {checked && (
            <svg
              className="w-5 h-5 text-slate-900"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
      </div>
      <div className="flex-1">
        <span className="text-sm font-medium text-white">{label}</span>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
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
      translate: 'peer-checked:translate-x-3.5',
    },
    md: {
      track: 'w-11 h-6',
      thumb: 'w-4 h-4',
      translate: 'peer-checked:translate-x-5',
    },
    lg: {
      track: 'w-14 h-7',
      thumb: 'w-5 h-5',
      translate: 'peer-checked:translate-x-7',
    },
  };

  let { track, thumb, translate } = sizes[size];

  return (
    <label
      className={`flex items-center justify-between gap-3 cursor-pointer group ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      <div className="flex-1">
        {label && (
          <span className="text-sm font-medium text-white">{label}</span>
        )}
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
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
          className={`${track} rounded-full bg-slate-700 transition-colors peer-checked:bg-amber-500 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-500/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-900`}
        />
        <div
          className={`absolute left-1 top-1 ${thumb} rounded-full bg-white shadow-sm transition-transform ${translate}`}
        />
      </div>
    </label>
  );
}
