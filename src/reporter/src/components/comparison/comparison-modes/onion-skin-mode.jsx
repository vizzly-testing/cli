import { ComparisonContainer } from './shared/base-comparison-mode.jsx';
import { ImageWithErrorBoundary } from './shared/image-renderer.jsx';

export function OnionSkinMode({
  baselineImageUrl,
  currentImageUrl,
  sliderPosition = 50,
  onSliderChange,
  screenshot,
  onImageError,
  onImageLoad,
  imageErrors = new Set(),
}) {
  return (
    <ComparisonContainer containerClassName="cursor-col-resize">
      <div className="relative inline-block">
        {/* Baseline image - relative position sizes the container */}
        <ImageWithErrorBoundary
          imageKey={`baseline-${screenshot?.id || 'unknown'}`}
          url={baselineImageUrl}
          alt="Baseline"
          position="relative"
          loading="eager"
          onError={onImageError}
          onLoad={onImageLoad}
          imageErrors={imageErrors}
          screenshot={screenshot}
        />

        {/* Current image (slides over baseline) - clipped overlay */}
        <div
          className="absolute top-0 left-0 overflow-hidden"
          style={{
            width: `${sliderPosition}%`,
            height: '100%',
          }}
        >
          <ImageWithErrorBoundary
            imageKey={`current-${screenshot?.id || 'unknown'}`}
            url={currentImageUrl}
            alt="Current"
            position="absolute"
            className="top-0 left-0"
            loading="eager"
            style={{
              width:
                sliderPosition > 0 ? `${10000 / sliderPosition}%` : '10000%',
              maxWidth: 'none',
            }}
            onError={onImageError}
            onLoad={onImageLoad}
            imageErrors={imageErrors}
            screenshot={screenshot}
          />
        </div>

        {/* Slider line indicator */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none z-10"
          style={{
            left: `${sliderPosition}%`,
            transform: 'translateX(-50%)',
          }}
        />

        {/* Interactive slider overlay - only spans the image */}
        <div className="absolute inset-0 z-20">
          <input
            type="range"
            min="0"
            max="100"
            value={sliderPosition}
            onChange={e => onSliderChange(parseInt(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-col-resize"
            title={`Slide to compare: ${Math.round(sliderPosition)}% current visible`}
          />
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs z-10">
        Baseline
      </div>
      <div className="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs z-10">
        Current
      </div>

      {/* Progress indicator */}
      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded text-xs z-10">
        {Math.round(sliderPosition)}% current
      </div>
    </ComparisonContainer>
  );
}
