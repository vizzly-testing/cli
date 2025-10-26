export function FormField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  error,
  help,
  disabled,
  required,
  placeholder,
  options,
}) {
  let id = `field-${name}`;

  if (type === 'select') {
    return (
      <div className="mb-6">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-300 mb-2"
        >
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
        <select
          id={id}
          name={name}
          value={value}
          onChange={e => onChange(name, e.target.value)}
          disabled={disabled}
          className={`
            w-full px-4 py-2 bg-slate-800 border rounded-lg text-gray-100
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500' : 'border-slate-700'}
          `}
        >
          {options?.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {help && <p className="mt-1 text-sm text-gray-400">{help}</p>}
        {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  if (type === 'number') {
    return (
      <div className="mb-6">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-300 mb-2"
        >
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
        <input
          id={id}
          type="number"
          name={name}
          value={value}
          onChange={e => onChange(name, parseFloat(e.target.value))}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            w-full px-4 py-2 bg-slate-800 border rounded-lg text-gray-100
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500' : 'border-slate-700'}
          `}
        />
        {help && <p className="mt-1 text-sm text-gray-400">{help}</p>}
        {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  if (type === 'checkbox') {
    return (
      <div className="mb-6 flex items-start">
        <input
          id={id}
          type="checkbox"
          name={name}
          checked={value}
          onChange={e => onChange(name, e.target.checked)}
          disabled={disabled}
          className="mt-1 h-4 w-4 bg-slate-800 border-slate-700 rounded text-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <div className="ml-3">
          <label
            htmlFor={id}
            className="block text-sm font-medium text-gray-300"
          >
            {label}
            {required && <span className="text-red-400 ml-1">*</span>}
          </label>
          {help && <p className="mt-1 text-sm text-gray-400">{help}</p>}
          {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  // Default: text input
  return (
    <div className="mb-6">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-300 mb-2"
      >
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        id={id}
        type={type}
        name={name}
        value={value}
        onChange={e => onChange(name, e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`
          w-full px-4 py-2 bg-slate-800 border rounded-lg text-gray-100
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-red-500' : 'border-slate-700'}
        `}
      />
      {help && <p className="mt-1 text-sm text-gray-400">{help}</p>}
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}

export function ConfigSourceBadge({ source }) {
  let colors = {
    default: 'bg-gray-600 text-gray-200',
    project: 'bg-blue-600 text-blue-100',
    global: 'bg-purple-600 text-purple-100',
    env: 'bg-green-600 text-green-100',
    cli: 'bg-yellow-600 text-yellow-100',
  };

  let labels = {
    default: 'Default',
    project: 'Project',
    global: 'Global',
    env: 'Environment',
    cli: 'CLI Flag',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[source] || colors.default}`}
    >
      {labels[source] || source}
    </span>
  );
}
