export function BaseComparisonMode({
  children,
  containerClassName = '',
  onClick,
  style = {},
  ...props
}) {
  // Simple inline container that sizes to fit its content (the images)
  let defaultClassName = 'relative inline-block';
  let finalClassName = `${defaultClassName} ${containerClassName}`;

  return (
    <div className={finalClassName} style={style} onClick={onClick} {...props}>
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
  let interactiveClass = interactive ? 'cursor-pointer' : '';

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
