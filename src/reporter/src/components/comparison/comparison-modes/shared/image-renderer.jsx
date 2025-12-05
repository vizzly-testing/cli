import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

/**
 * Simple, reliable image renderer for screenshot comparisons
 * Zoom is handled at the container level, not here
 */
export function ImageRenderer({
  imageKey,
  url,
  alt,
  position = 'absolute',
  className = '',
  onError,
  onLoad,
  imageErrors,
  style = {},
  loading = 'lazy',
  ...props
}) {
  // Position types:
  // - 'absolute': positioned absolutely within container
  // - 'relative': natural size, used for spacer images to establish container dimensions
  const baseClasses = {
    absolute: 'absolute block',
    relative: 'block', // No constraints - render at natural size
  };

  const positionClasses =
    position === 'absolute' &&
    !className.includes('top-') &&
    !className.includes('left-')
      ? 'top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2'
      : '';

  const imageClass =
    `${baseClasses[position]} ${positionClasses} ${className}`.trim();

  // Handle error state
  if (imageErrors?.has(imageKey)) {
    return (
      <div className="absolute inset-0 bg-gray-700 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <ExclamationTriangleIcon className="w-8 h-8 mx-auto mb-2" />
          <div className="text-sm">Failed to load image</div>
        </div>
      </div>
    );
  }

  // Filter out non-HTML props that shouldn't go to img element
  const { screenshot: _screenshot, zoom: _zoom, ...htmlProps } = props;

  return (
    <img
      src={url}
      alt={alt}
      className={imageClass}
      style={style}
      loading={loading}
      decoding="async"
      onError={() => onError?.(imageKey)}
      onLoad={() => onLoad?.(imageKey)}
      {...htmlProps}
    />
  );
}

export function ImageWithErrorBoundary({
  imageKey,
  url,
  alt,
  position = 'absolute',
  className = '',
  onError,
  onLoad,
  imageErrors,
  showErrorPlaceholder = true,
  loading = 'lazy',
  ...props
}) {
  const hasError = imageErrors?.has(imageKey);

  if (hasError && !showErrorPlaceholder) {
    return null;
  }

  return (
    <ImageRenderer
      imageKey={imageKey}
      url={url}
      alt={alt}
      position={position}
      className={className}
      onError={onError}
      onLoad={onLoad}
      imageErrors={imageErrors}
      loading={loading}
      {...props}
    />
  );
}
