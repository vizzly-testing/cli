import { useState } from 'react';
import { ComparisonContainer } from './shared/base-comparison-mode.jsx';
import { ImageWithErrorBoundary } from './shared/image-renderer.jsx';

/**
 * ToggleView - Simple toggle with internal state
 * For simpler use cases where you don't need controlled state
 */
export function ToggleView({
  baselineImageUrl,
  currentImageUrl,
  screenshot,
  onImageError,
  onImageLoad,
  imageErrors = new Set(),
}) {
  let [showBaseline, setShowBaseline] = useState(true);

  let handleImageClick = () => {
    setShowBaseline(prev => !prev);
  };

  return (
    <ComparisonContainer interactive={true} onClick={handleImageClick}>
      {/* State Indicator */}
      <div className="absolute top-2 left-2 bg-black/70 text-[var(--text-primary)] px-2 py-1 rounded text-xs z-10">
        {showBaseline ? 'Showing Baseline' : 'Showing Current'}
      </div>
      <div className="absolute top-2 right-2 bg-black/70 text-[var(--text-primary)] px-2 py-1 rounded text-xs z-10">
        Click to toggle
      </div>

      <div className="relative inline-block">
        {/* Baseline image - relative when showing, sizes the container */}
        <ImageWithErrorBoundary
          imageKey={`baseline-${screenshot?.id || 'unknown'}`}
          url={baselineImageUrl}
          alt="Baseline"
          position={showBaseline ? 'relative' : 'absolute'}
          className={`${showBaseline ? '' : 'top-0 left-0'} ${showBaseline ? '' : 'hidden'}`}
          loading="eager"
          onError={onImageError}
          onLoad={onImageLoad}
          imageErrors={imageErrors}
          showErrorPlaceholder={false}
          screenshot={screenshot}
        />

        {/* Current image - relative when showing, sizes the container */}
        <ImageWithErrorBoundary
          imageKey={`current-${screenshot?.id || 'unknown'}`}
          url={currentImageUrl}
          alt="Current"
          position={showBaseline ? 'absolute' : 'relative'}
          className={`${showBaseline ? 'top-0 left-0' : ''} ${showBaseline ? 'hidden' : ''}`}
          loading="eager"
          onError={onImageError}
          onLoad={onImageLoad}
          imageErrors={imageErrors}
          showErrorPlaceholder={false}
          screenshot={screenshot}
        />
      </div>
    </ComparisonContainer>
  );
}

/**
 * ToggleMode - Controlled toggle with external state
 * For advanced use cases where you need to control the toggle state
 */
export function ToggleMode({
  baselineImageUrl,
  currentImageUrl,
  baselineImageLoaded,
  setBaselineImageLoaded,
  currentImageLoaded,
  setCurrentImageLoaded,
  baselineImageError,
  setBaselineImageError,
  currentImageError,
  setCurrentImageError,
  screenshot,
  onImageError,
  onImageLoad,
  showBaseline = true,
  onToggle,
}) {
  let handleImageClick = () => {
    onToggle?.();
  };

  // Create error set for compatibility with new components
  let errorSet = new Set();
  if (baselineImageError)
    errorSet.add(`baseline-${screenshot?.id || 'unknown'}`);
  if (currentImageError) errorSet.add(`current-${screenshot?.id || 'unknown'}`);

  let handleImageLoadWrapper = imageKey => {
    if (imageKey.includes('baseline')) {
      setBaselineImageLoaded(true);
    } else if (imageKey.includes('current')) {
      setCurrentImageLoaded(true);
    }
    if (onImageLoad) onImageLoad(imageKey);
  };

  let handleImageErrorWrapper = imageKey => {
    if (imageKey.includes('baseline')) {
      setBaselineImageError(true);
    } else if (imageKey.includes('current')) {
      setCurrentImageError(true);
    }
    if (onImageError) onImageError(imageKey);
  };

  return (
    <ComparisonContainer interactive={true} onClick={handleImageClick}>
      {/* State Indicator */}
      <div className="absolute top-2 left-2 bg-black/70 text-[var(--text-primary)] px-2 py-1 rounded text-xs z-10">
        {showBaseline ? 'Showing Baseline' : 'Showing Current'}
      </div>
      <div className="absolute top-2 right-2 bg-black/70 text-[var(--text-primary)] px-2 py-1 rounded text-xs z-10">
        Click to toggle
      </div>

      <div className="relative inline-block">
        {/* Baseline image - relative when showing, sizes the container */}
        <ImageWithErrorBoundary
          imageKey={`baseline-${screenshot?.id || 'unknown'}`}
          url={baselineImageUrl}
          alt="Baseline"
          position={showBaseline ? 'relative' : 'absolute'}
          className={`transition-opacity duration-300 ${
            showBaseline ? '' : 'top-0 left-0'
          } ${baselineImageLoaded ? (showBaseline ? 'opacity-100' : 'opacity-0') : 'opacity-0'}`}
          loading="eager"
          onError={handleImageErrorWrapper}
          onLoad={handleImageLoadWrapper}
          imageErrors={errorSet}
          showErrorPlaceholder={false}
          screenshot={screenshot}
        />

        {/* Current image - relative when showing, sizes the container */}
        <ImageWithErrorBoundary
          imageKey={`current-${screenshot?.id || 'unknown'}`}
          url={currentImageUrl}
          alt="Current"
          position={showBaseline ? 'absolute' : 'relative'}
          className={`transition-opacity duration-300 ${
            showBaseline ? 'top-0 left-0' : ''
          } ${currentImageLoaded ? (showBaseline ? 'opacity-0' : 'opacity-100') : 'opacity-0'}`}
          loading="eager"
          onError={handleImageErrorWrapper}
          onLoad={handleImageLoadWrapper}
          imageErrors={errorSet}
          showErrorPlaceholder={false}
          screenshot={screenshot}
        />
      </div>

      {/* Loading states */}
      {(!currentImageLoaded || !baselineImageLoaded) &&
        !currentImageError &&
        !baselineImageError && (
          <div className="absolute inset-0 bg-[var(--vz-raised)] animate-pulse flex items-center justify-center min-h-48">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 border-2 border-[var(--vz-border-strong)] border-t-[var(--text-secondary)] rounded-full animate-spin mb-2"></div>
              <div className="text-sm text-[var(--text-tertiary)]">
                Loading images...
              </div>
            </div>
          </div>
        )}
    </ComparisonContainer>
  );
}
