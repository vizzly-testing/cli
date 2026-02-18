import {
  OnionSkinMode,
  OverlayMode,
  ToggleView,
} from '@vizzly-testing/observatory';
import { useCallback, useMemo, useState } from 'react';
import { VIEW_MODES } from '../../utils/constants.js';
import { withImageVersion } from '../../utils/image-url.js';

/**
 * Comparison Viewer for inline card display
 * Simpler than ScreenshotDisplay - no zoom, just renders comparison modes
 */
export default function ComparisonViewer({ comparison, viewMode }) {
  const [showDiffOverlay, setShowDiffOverlay] = useState(true);
  const [onionSkinPosition, setOnionSkinPosition] = useState(50);
  const [imageErrors, setImageErrors] = useState(new Set());

  const handleImageError = useCallback(imageKey => {
    setImageErrors(prev => new Set([...prev, imageKey]));
  }, []);

  const handleImageLoad = useCallback(() => {
    // No-op for now, could track load states if needed
  }, []);

  const handleDiffToggle = useCallback(() => {
    setShowDiffOverlay(prev => !prev);
  }, []);

  // Create a screenshot-like object for the comparison modes
  const screenshot = useMemo(
    () => ({
      id: comparison.id || comparison.signature || 'unknown',
      name: comparison.name || comparison.originalName || 'Screenshot',
    }),
    [comparison]
  );

  // Build image URLs once per comparison update.
  const imageUrls = useMemo(
    () => ({
      current: withImageVersion(comparison.current, comparison.timestamp),
      baseline: withImageVersion(comparison.baseline, comparison.timestamp),
      diff: withImageVersion(comparison.diff, comparison.timestamp),
    }),
    [
      comparison.current,
      comparison.baseline,
      comparison.diff,
      comparison.timestamp,
    ]
  );

  // For new screenshots, just show the current image (no baseline exists yet)
  if (comparison.status === 'new' || comparison.status === 'baseline-created') {
    return (
      <div className="comparison-viewer new-baseline">
        <div className="text-center py-8">
          <p className="text-slate-400 text-sm mb-4">
            First screenshot - creating new baseline
          </p>
          <img
            src={imageUrls.current}
            alt="New baseline screenshot"
            className="mx-auto max-w-full block"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="comparison-viewer" data-mode={viewMode}>
      <div className="flex justify-center items-center p-4">
        {viewMode === VIEW_MODES.OVERLAY && (
          <OverlayMode
            baselineImageUrl={imageUrls.baseline}
            currentImageUrl={imageUrls.current}
            diffImageUrl={imageUrls.diff}
            showDiffOverlay={showDiffOverlay}
            screenshot={screenshot}
            onImageError={handleImageError}
            onImageLoad={handleImageLoad}
            imageErrors={imageErrors}
            onDiffToggle={handleDiffToggle}
          />
        )}

        {viewMode === VIEW_MODES.TOGGLE && (
          <ToggleView
            baselineImageUrl={imageUrls.baseline}
            currentImageUrl={imageUrls.current}
            screenshot={screenshot}
            onImageError={handleImageError}
            onImageLoad={handleImageLoad}
            imageErrors={imageErrors}
          />
        )}

        {viewMode === VIEW_MODES.ONION && (
          <OnionSkinMode
            baselineImageUrl={imageUrls.baseline}
            currentImageUrl={imageUrls.current}
            sliderPosition={onionSkinPosition}
            onSliderChange={setOnionSkinPosition}
            screenshot={screenshot}
            onImageError={handleImageError}
            onImageLoad={handleImageLoad}
            imageErrors={imageErrors}
          />
        )}

        {viewMode === VIEW_MODES.SIDE_BY_SIDE && (
          <div className="flex gap-4 max-w-full overflow-auto">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-400 mb-2 text-center">
                Baseline
              </div>
              <img
                src={imageUrls.baseline}
                alt="Baseline"
                className="block max-w-full"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-400 mb-2 text-center">
                Current
              </div>
              <img
                src={imageUrls.current}
                alt="Current"
                className="block max-w-full"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
