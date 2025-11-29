/**
 * Card Component
 * Observatory Design System
 *
 * Container component with optional accent borders
 * Variants: default, success, warning, danger, info, purple
 */

export function Card({
  children,
  variant,
  hover = true,
  className = '',
  ...props
}) {
  let variantClasses = {
    default: '',
    success: 'border-l-2 border-l-emerald-500',
    warning: 'border-l-2 border-l-amber-500',
    danger: 'border-l-2 border-l-red-500',
    info: 'border-l-2 border-l-blue-500',
    purple: 'border-l-2 border-l-purple-500',
  };

  let classes = [
    'bg-white/[0.03] backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden',
    variant ? variantClasses[variant] : '',
    hover
      ? 'transition-all duration-200 hover:border-slate-600 hover:bg-white/[0.05]'
      : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  icon: Icon,
  title,
  description,
  iconColor = 'bg-amber-500/10 text-amber-400',
  actions,
  className = '',
}) {
  return (
    <div className={`px-6 py-5 border-b border-slate-700/50 ${className}`}>
      <div className={`flex items-center ${actions ? 'justify-between' : ''}`}>
        <div className="flex items-center gap-3">
          {Icon && (
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColor}`}
            >
              <Icon className="w-5 h-5" />
            </div>
          )}
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {description && (
              <p className="text-sm text-slate-400 mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function CardBody({ children, className = '', padding = 'p-6' }) {
  return <div className={`${padding} ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = '' }) {
  return (
    <div
      className={`px-6 py-4 bg-slate-900/30 border-t border-slate-700/50 ${className}`}
    >
      {children}
    </div>
  );
}
