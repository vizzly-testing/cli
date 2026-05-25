/**
 * Card Component
 * BearDen Design System
 *
 * Container component with semantic variants that do not add outer rails
 * Variants: default, success, warning, danger, info, media
 */

export function Card({
  children,
  variant,
  hover = false,
  className = '',
  ...props
}) {
  let variantClasses = {
    default: '',
    success: '',
    warning: '',
    danger: '',
    info: '',
    media: '',
  };

  let classes = [
    'bg-white/[0.03] backdrop-blur-sm border border-[var(--vz-border)] rounded-xl overflow-hidden',
    variant ? variantClasses[variant] : '',
    hover
      ? 'transition-all duration-200 hover:border-[var(--vz-border-strong)] hover:bg-white/[0.05]'
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
  iconColor = 'bg-[var(--accent-brand-muted)] text-[var(--accent-brand)]',
  actions,
  className = '',
}) {
  return (
    <div
      className={`px-6 py-5 border-b border-[var(--vz-border-subtle)] ${className}`}
    >
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
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              {title}
            </h3>
            {description && (
              <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
                {description}
              </p>
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
      className={`px-6 py-4 bg-black/20 border-t border-[var(--vz-border-subtle)] ${className}`}
    >
      {children}
    </div>
  );
}
