// Overlay mode for screenshot comparison
// Shows current image with optional diff overlay on click

import { ComparisonContainer } from './shared/base-comparison-mode.jsx';
import { ImageWithErrorBoundary } from './shared/image-renderer.jsx';

export function OverlayMode({
  baselineImageUrl,
  currentImageUrl,
  diffImageUrl,
  showDiffOverlay = false,
  screenshot,
  onImageError,
  onImageLoad,
  imageErrors,
  onDiffToggle,
}) {
  let handleToggleDiff = () => {
    if (diffImageUrl && onDiffToggle) {
      onDiffToggle();
    }
  };

  // If no baseline, just show current image
  if (!baselineImageUrl) {
    return (
      <ComparisonContainer
        interactive={!!diffImageUrl}
        onClick={handleToggleDiff}
      >
        <ImageWithErrorBoundary
          imageKey={`current-${screenshot?.id || 'unknown'}`}
          url={currentImageUrl}
          alt={screenshot?.name || 'Current'}
          position="relative"
          loading="eager"
          onError={onImageError}
          onLoad={onImageLoad}
          imageErrors={imageErrors}
          screenshot={screenshot}
        />
      </ComparisonContainer>
    );
  }

  return (
    <ComparisonContainer
      interactive={!!diffImageUrl}
      onClick={handleToggleDiff}
    >
      {/* Current image - relative position sizes the container */}
      <ImageWithErrorBoundary
        imageKey={`current-${screenshot?.id || 'unknown'}`}
        url={currentImageUrl}
        alt={screenshot?.name || 'Current'}
        position="relative"
        loading="eager"
        onError={onImageError}
        onLoad={onImageLoad}
        imageErrors={imageErrors}
        screenshot={screenshot}
      />

      {/* Diff overlay (on top when enabled) */}
      {showDiffOverlay && diffImageUrl && (
        <ImageWithErrorBoundary
          imageKey={`diff-${screenshot?.id || 'unknown'}`}
          url={diffImageUrl}
          alt="Diff"
          position="absolute"
          className="top-0 left-0"
          loading="eager"
          onError={onImageError}
          onLoad={onImageLoad}
          imageErrors={imageErrors}
          showErrorPlaceholder={false}
          screenshot={screenshot}
        />
      )}

      {/* Diff overlay error message */}
      {showDiffOverlay &&
        diffImageUrl &&
        imageErrors?.has(`diff-${screenshot?.id || 'unknown'}`) && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-amber-900/90 border border-amber-600/50 rounded-lg px-3 py-2 text-amber-200 text-sm backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.232 14.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <span>Diff image not available</span>
            </div>
          </div>
        )}

      {/* Diff toggle indicator */}
      {diffImageUrl && (
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded text-xs z-10">
          {showDiffOverlay ? 'Diff On' : 'Diff Off'} (click to toggle)
        </div>
      )}
    </ComparisonContainer>
  );
}
