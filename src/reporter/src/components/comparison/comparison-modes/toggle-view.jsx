import { useState } from 'react';
import { ComparisonContainer } from './shared/base-comparison-mode.jsx';
import { ImageWithErrorBoundary } from './shared/image-renderer.jsx';

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
      <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs z-10">
        {showBaseline ? 'Showing Baseline' : 'Showing Current'}
      </div>
      <div className="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs z-10">
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
          } ${showBaseline ? 'opacity-100' : 'opacity-0'}`}
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
          className={`transition-opacity duration-300 ${
            showBaseline ? 'top-0 left-0' : ''
          } ${showBaseline ? 'opacity-0' : 'opacity-100'}`}
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
