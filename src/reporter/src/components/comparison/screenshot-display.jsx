import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import {
  HotSpotOverlay,
  OnionSkinMode,
  OverlayMode,
  ToggleView,
} from '@vizzly-testing/observatory';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Unified Screenshot Display Component - matches Observatory architecture
 * Handles zoom calculations and renders the appropriate comparison mode
 * inside a zoom wrapper so all modes scale together
 */
export function ScreenshotDisplay({
  comparison,
  viewMode = 'overlay',
  showDiffOverlay = true,
  onionSkinPosition = 50,
  onOnionSkinChange,
  onDiffToggle,
  // Loading behavior
  disableLoadingOverlay = false,
  // Zoom support
  zoom = 'fit',
  className = '',
  // Region overlay
  showRegions = false,
}) {
  const [imageErrors, setImageErrors] = useState(new Set());
  const [imageLoadStates, setImageLoadStates] = useState(new Map());
  const [fitScale, setFitScale] = useState(1);
  const [naturalImageSize, setNaturalImageSize] = useState({
    width: 0,
    height: 0,
  });
  const screenshotContainerRef = useRef(null);
  const zoomWrapperRef = useRef(null);

  // Calculate fit scale and track natural image size for zoom overflow
  useEffect(() => {
    const calculateScales = () => {
      const container = screenshotContainerRef.current;
      const image = container?.querySelector('img');

      if (!container || !image || !image.naturalWidth) return;

      // Always track natural size for overflow calculations
      setNaturalImageSize({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });

      const containerRect = container.getBoundingClientRect();
      const padding = 40; // Padding around the image

      const availableWidth = containerRect.width - padding;
      const availableHeight = containerRect.height - padding;

      const scaleX = availableWidth / image.naturalWidth;
      const scaleY = availableHeight / image.naturalHeight;

      // Use the smaller scale to fit both dimensions
      const newScale = Math.min(scaleX, scaleY, 1); // Cap at 1 to not enlarge small images

      setFitScale(newScale);
    };

    // Calculate on mount and when container resizes
    calculateScales();

    const resizeObserver = new window.ResizeObserver(calculateScales);
    if (screenshotContainerRef.current) {
      resizeObserver.observe(screenshotContainerRef.current);
    }

    // Also recalculate when images load
    const images =
      screenshotContainerRef.current?.querySelectorAll('img') || [];
    for (let img of images) {
      img.addEventListener('load', calculateScales);
    }

    return () => {
      resizeObserver.disconnect();
      for (let img of images) {
        img.removeEventListener('load', calculateScales);
      }
    };
  }, []);

  // Calculate zoom settings
  // Fit mode: calculates scale to fit image in viewport
  // Zoom mode: uses specified scale, with scroll panning for oversized images
  const zoomSettings = useMemo(() => {
    const isFit = zoom === 'fit';
    const scale = isFit ? fitScale : typeof zoom === 'number' ? zoom : 1;
    // When zoomed beyond fit scale, allow the image to overflow and be scrollable
    const allowsOverflow = !isFit && scale > fitScale;

    return {
      isFit,
      scale,
      allowsOverflow,
      // Container allows scrolling when zoomed beyond fit (content overflows)
      containerClass: allowsOverflow ? 'overflow-auto' : 'overflow-hidden',
    };
  }, [zoom, fitScale]);

  // Handle image loading errors
  const handleImageError = useCallback(imageKey => {
    setImageErrors(prev => new Set([...prev, imageKey]));
  }, []);

  // Handle image load success
  const handleImageLoad = useCallback(imageKey => {
    setImageLoadStates(prev => new Map(prev).set(imageKey, 'loaded'));
  }, []);

  // Build image URLs from comparison object - no memoization needed, object creation is cheap
  const imageUrls = comparison
    ? {
        current: comparison.current,
        baseline: comparison.baseline,
        diff: comparison.diff,
      }
    : {};

  // Create a screenshot-like object for the comparison modes
  const screenshot = useMemo(() => {
    if (!comparison) return null;
    return {
      id: comparison.id || comparison.signature || 'unknown',
      name: comparison.name || comparison.originalName || 'Screenshot',
    };
  }, [comparison]);

  // Render new screenshot - just show current image
  if (
    !comparison ||
    comparison.status === 'new' ||
    comparison.status === 'baseline-created'
  ) {
    return (
      <div className={`h-full ${className}`}>
        <div
          ref={screenshotContainerRef}
          className={`bg-gray-800 relative h-full ${zoomSettings.containerClass}`}
          style={{
            // Checkerboard background for transparency
            backgroundImage: `
              linear-gradient(45deg, #1f2937 25%, transparent 25%),
              linear-gradient(-45deg, #1f2937 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #1f2937 75%),
              linear-gradient(-45deg, transparent 75%, #1f2937 75%)
            `,
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
            backgroundColor: '#111827',
          }}
        >
          {/* Zoom wrapper - uses transform:scale for overflow scrolling at high zoom */}
          <div
            className={`relative ${zoomSettings.allowsOverflow ? 'flex justify-center items-start' : 'min-w-full min-h-full flex justify-center items-center'}`}
            style={{
              ...(zoomSettings.allowsOverflow
                ? {
                    minWidth: naturalImageSize.width * zoomSettings.scale + 40,
                    minHeight:
                      naturalImageSize.height * zoomSettings.scale + 40,
                    padding: '20px',
                  }
                : {
                    zoom: zoomSettings.scale,
                    padding: '20px',
                  }),
            }}
          >
            {/* Image wrapper - inline-block shrinks to fit image */}
            <div
              ref={zoomWrapperRef}
              className="relative inline-block"
              style={
                zoomSettings.allowsOverflow
                  ? {
                      transform: `scale(${zoomSettings.scale})`,
                      transformOrigin: 'top center',
                    }
                  : {}
              }
            >
              {comparison && (
                <img
                  src={comparison.current}
                  alt={comparison.name || 'New screenshot'}
                  className="block"
                  onLoad={() => handleImageLoad(`current-${screenshot?.id}`)}
                  onError={() => handleImageError(`current-${screenshot?.id}`)}
                />
              )}
            </div>
          </div>

          {/* Loading/Error States */}
          {!disableLoadingOverlay &&
            comparison &&
            !imageLoadStates.has(`current-${screenshot?.id}`) && (
              <div className="absolute inset-0 bg-gray-700 animate-pulse flex items-center justify-center">
                <div className="text-gray-400">Loading...</div>
              </div>
            )}

          {comparison && imageErrors.has(`current-${screenshot?.id}`) && (
            <div className="absolute inset-0 bg-gray-700 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <ExclamationTriangleIcon className="w-8 h-8 mx-auto mb-2" />
                <div className="text-sm">Failed to load image</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render comparison view
  return (
    <div className={`h-full ${className}`}>
      <div
        ref={screenshotContainerRef}
        className={`bg-gray-800 relative unified-screenshot-container h-full ${zoomSettings.containerClass}`}
        style={{
          // Checkerboard background for transparency
          backgroundImage: `
            linear-gradient(45deg, #1f2937 25%, transparent 25%),
            linear-gradient(-45deg, #1f2937 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #1f2937 75%),
            linear-gradient(-45deg, transparent 75%, #1f2937 75%)
          `,
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          backgroundColor: '#111827',
        }}
      >
        {/* Zoom wrapper - contains images so they scale together */}
        {/* When zoomed beyond fit, use transform:scale with explicit wrapper sizing for overflow */}
        <div
          className={`relative ${zoomSettings.allowsOverflow ? 'flex justify-center items-start' : 'min-w-full min-h-full flex justify-center items-center'}`}
          style={{
            ...(zoomSettings.allowsOverflow
              ? {
                  // When overflowing, provide minimum dimensions so scrolling works
                  minWidth: naturalImageSize.width * zoomSettings.scale + 40,
                  minHeight: naturalImageSize.height * zoomSettings.scale + 40,
                  padding: '20px',
                }
              : {
                  // When fitting, use CSS zoom for simple scaling
                  zoom: zoomSettings.scale,
                  padding: '20px',
                }),
          }}
        >
          {/* Image wrapper - keeps content positioned relative to image */}
          <div
            ref={zoomWrapperRef}
            className="relative inline-block"
            style={
              zoomSettings.allowsOverflow
                ? {
                    transform: `scale(${zoomSettings.scale})`,
                    transformOrigin: 'top center',
                  }
                : {}
            }
          >
            {/* Render appropriate comparison mode */}
            {viewMode === 'toggle' && imageUrls.baseline ? (
              <ToggleView
                baselineImageUrl={imageUrls.baseline}
                currentImageUrl={imageUrls.current}
                screenshot={screenshot}
                onImageError={handleImageError}
                onImageLoad={handleImageLoad}
                imageErrors={imageErrors}
              />
            ) : viewMode === 'onion-skin' && imageUrls.baseline ? (
              <OnionSkinMode
                baselineImageUrl={imageUrls.baseline}
                currentImageUrl={imageUrls.current}
                sliderPosition={onionSkinPosition}
                onSliderChange={onOnionSkinChange}
                screenshot={screenshot}
                onImageError={handleImageError}
                onImageLoad={handleImageLoad}
                imageErrors={imageErrors}
              />
            ) : (
              <OverlayMode
                baselineImageUrl={imageUrls.baseline}
                currentImageUrl={imageUrls.current}
                diffImageUrl={imageUrls.diff}
                showDiffOverlay={showDiffOverlay}
                screenshot={screenshot}
                onImageError={handleImageError}
                onImageLoad={handleImageLoad}
                imageErrors={imageErrors}
                onDiffToggle={onDiffToggle}
              />
            )}

            {/* Region overlay - shows confirmed regions as green boxes */}
            {showRegions && comparison?.confirmedRegions?.length > 0 && (
              <HotSpotOverlay
                confirmed={comparison.confirmedRegions}
                candidates={[]}
                imageWidth={naturalImageSize.width}
                imageHeight={naturalImageSize.height}
                showConfirmed={true}
                showCandidates={false}
                disabled={true}
              />
            )}
          </div>
        </div>

        {/* Global Loading/Error States */}
        {!disableLoadingOverlay &&
          !imageLoadStates.has(`current-${screenshot?.id}`) && (
            <div className="absolute inset-0 bg-gray-700 animate-pulse flex items-center justify-center">
              <div className="text-gray-400">Loading...</div>
            </div>
          )}

        {imageErrors.has(`current-${screenshot?.id}`) && (
          <div className="absolute inset-0 bg-gray-700 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <ExclamationTriangleIcon className="w-8 h-8 mx-auto mb-2" />
              <div className="text-sm">Failed to load image</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
