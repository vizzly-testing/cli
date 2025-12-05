export function BaseComparisonMode({
  children,
  containerClassName = '',
  onClick,
  style = {},
  ...props
}) {
  // Simple inline container that sizes to fit its content (the images)
  const defaultClassName = 'relative inline-block';
  const finalClassName = `${defaultClassName} ${containerClassName}`;

  // Use semantic button element when interactive
  if (onClick) {
    return (
      <button
        type="button"
        className={`${finalClassName} border-none bg-transparent p-0 text-left`}
        style={style}
        onClick={onClick}
        {...props}
      >
        {children}
      </button>
    );
  }

  return (
    <div className={finalClassName} style={style} {...props}>
      {children}
    </div>
  );
}

export function ComparisonContainer({
  children,
  containerClassName = '',
  interactive = false,
  onClick,
  style = {},
}) {
  const interactiveClass = interactive ? 'cursor-pointer' : '';

  return (
    <BaseComparisonMode
      containerClassName={`${containerClassName} ${interactiveClass}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </BaseComparisonMode>
  );
}
