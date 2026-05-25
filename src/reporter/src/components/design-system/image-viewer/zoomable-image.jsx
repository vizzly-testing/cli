/**
 * Zoomable Image Component
 * BearDen Design System - Image Viewer
 *
 * Provides pan and zoom functionality for image viewing
 * Supports overlays, loading states, and device detection
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Zoomable Image Container
 *
 * @param {string} src - Image source URL
 * @param {string} alt - Alt text
 * @param {number|'fit'} zoom - Zoom level (decimal or 'fit')
 * @param {Object} metadata - Optional metadata for device detection { width, height, platform, device }
 * @param {Function} onLoad - Callback when image loads
 * @param {Function} onError - Callback on error
 * @param {ReactNode} overlay - Content to overlay on the image (scales with zoom)
 * @param {ReactNode} children - Additional overlays (fixed position)
 * @param {boolean} showPanHint - Show "drag to pan" hint
 * @param {boolean} showDeviceInfo - Show device badge from metadata
 * @param {boolean} showLoadingIndicator - Show loading spinner
 * @param {string} checkerboardColor - Background color for transparency
 */
export function ZoomableImage({
  src,
  alt,
  zoom = 'fit',
  metadata,
  onLoad,
  onError,
  overlay,
  children,
  showPanHint = true,
  showDeviceInfo = false,
  showLoadingIndicator = true,
  checkerboardColor = '#1a1a1a',
  className = '',
}) {
  let containerRef = useRef(null);
  let imageRef = useRef(null);
  let [imageDimensions, setImageDimensions] = useState({
    width: 0,
    height: 0,
  });
  let [containerDimensions, setContainerDimensions] = useState({
    width: 0,
    height: 0,
  });
  let [pan, setPan] = useState({ x: 0, y: 0 });
  let [isDragging, setIsDragging] = useState(false);
  let [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  let [imageLoaded, setImageLoaded] = useState(false);

  // Detect device type from metadata
  let deviceInfo = useMemo(() => {
    if (!metadata) return null;

    let platform = metadata.platform?.toLowerCase() || '';
    let device = metadata.device?.toLowerCase() || '';
    let width = metadata.width || metadata.viewport_width || 0;
    let height = metadata.height || metadata.viewport_height || 0;

    let isIOS =
      platform === 'ios' ||
      device.includes('iphone') ||
      device.includes('ipad');
    let isAndroid = platform === 'android';
    let isMobile = isIOS || isAndroid || width < 768;
    let isPortrait = height > width;

    return {
      platform: isIOS ? 'ios' : isAndroid ? 'android' : 'desktop',
      isMobile,
      isPortrait,
    };
  }, [metadata]);

  // Handle image load
  let handleImageLoad = useCallback(
    e => {
      let img = e.target;
      setImageDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      setImageLoaded(true);
      onLoad?.();
    },
    [onLoad]
  );

  // Update container dimensions on resize
  useEffect(() => {
    let updateContainerSize = () => {
      if (containerRef.current) {
        let rect = containerRef.current.getBoundingClientRect();
        setContainerDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateContainerSize();
    window.addEventListener('resize', updateContainerSize);
    return () => window.removeEventListener('resize', updateContainerSize);
  }, []);

  // Calculate actual zoom scale
  let scale = useMemo(() => {
    if (!imageDimensions.width || !containerDimensions.width) return 1;

    let scaleX = containerDimensions.width / imageDimensions.width;
    let scaleY = containerDimensions.height / imageDimensions.height;
    let fitScale = Math.min(scaleX, scaleY, 1); // Never scale up for fit

    return zoom === 'fit' ? fitScale : zoom;
  }, [zoom, imageDimensions, containerDimensions]);

  // Calculate scaled dimensions
  let scaledDimensions = useMemo(
    () => ({
      width: imageDimensions.width * scale,
      height: imageDimensions.height * scale,
    }),
    [imageDimensions, scale]
  );

  // Check if panning is needed
  let canPan = useMemo(
    () =>
      scaledDimensions.width > containerDimensions.width ||
      scaledDimensions.height > containerDimensions.height,
    [scaledDimensions, containerDimensions]
  );

  // Reset pan when zoom changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally trigger on zoom change
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [zoom]);

  // Pan handlers
  let handleMouseDown = useCallback(
    e => {
      if (!canPan) return;
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    },
    [canPan, pan]
  );

  let handleMouseMove = useCallback(
    e => {
      if (!isDragging) return;

      let newX = e.clientX - dragStart.x;
      let newY = e.clientY - dragStart.y;

      // Constrain pan to keep image visible
      let maxPanX = Math.max(
        0,
        (scaledDimensions.width - containerDimensions.width) / 2
      );
      let maxPanY = Math.max(
        0,
        (scaledDimensions.height - containerDimensions.height) / 2
      );

      newX = Math.max(-maxPanX, Math.min(maxPanX, newX));
      newY = Math.max(-maxPanY, Math.min(maxPanY, newY));

      setPan({ x: newX, y: newY });
    },
    [isDragging, dragStart, scaledDimensions, containerDimensions]
  );

  let handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Image transform style
  let imageStyle = useMemo(
    () => ({
      transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
      transformOrigin: 'center center',
      transition: isDragging ? 'none' : 'transform 0.2s ease-out',
      cursor: canPan ? (isDragging ? 'grabbing' : 'grab') : 'default',
    }),
    [pan, scale, isDragging, canPan]
  );

  // Checkerboard background style
  let checkerboardStyle = useMemo(
    () => ({
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='10' height='10' fill='${encodeURIComponent(checkerboardColor)}'/%3E%3Crect x='10' y='10' width='10' height='10' fill='${encodeURIComponent(checkerboardColor)}'/%3E%3C/svg%3E")`,
      backgroundSize: '20px 20px',
      backgroundColor: '#111',
    }),
    [checkerboardColor]
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag and pan gestures are pointer-only viewer interactions.
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Checkerboard background */}
      <div className="absolute inset-0" style={checkerboardStyle} />

      {/* Centered image */}
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          style={imageStyle}
          onLoad={handleImageLoad}
          onError={onError}
          className="max-w-none select-none"
          draggable={false}
        />
      </div>

      {/* Scaled overlay content */}
      {overlay && imageLoaded && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
        >
          <div
            style={{
              width: scaledDimensions.width,
              height: scaledDimensions.height,
              position: 'relative',
            }}
            className="pointer-events-auto"
          >
            {overlay}
          </div>
        </div>
      )}

      {/* Fixed position children */}
      {children}

      {/* Loading indicator */}
      {showLoadingIndicator && !imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--vz-raised)]">
          <div className="flex items-center gap-3 text-[var(--text-tertiary)]">
            <div className="w-5 h-5 border-2 border-[var(--vz-border-strong)] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        </div>
      )}

      {/* Pan indicator */}
      {showPanHint && canPan && !isDragging && imageLoaded && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-[var(--vz-surface)] backdrop-blur-sm rounded-full text-xs text-[var(--text-tertiary)] pointer-events-none">
          Drag to pan
        </div>
      )}

      {/* Device info badge */}
      {showDeviceInfo && deviceInfo?.isMobile && imageLoaded && (
        <div className="absolute top-4 left-4 px-2 py-1 bg-[var(--vz-surface)] backdrop-blur-sm rounded text-xs text-[var(--text-tertiary)] pointer-events-none">
          {deviceInfo.platform === 'ios' ? '📱 iOS' : '🤖 Android'}
          {deviceInfo.isPortrait ? ' Portrait' : ' Landscape'}
        </div>
      )}
    </div>
  );
}

/**
 * Side-by-side comparison component
 */
export function SideBySideView({
  leftSrc,
  rightSrc,
  leftLabel = 'Left',
  rightLabel = 'Right',
  zoom = 'fit',
  metadata,
  onLeftLoad,
  onRightLoad,
  className = '',
}) {
  return (
    <div className={`flex gap-4 h-full ${className}`}>
      {/* Left */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-3 py-2 bg-[var(--vz-raised)] border-b border-[var(--vz-border-subtle)]">
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            {leftLabel}
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <ZoomableImage
            src={leftSrc}
            alt={leftLabel}
            zoom={zoom}
            metadata={metadata}
            onLoad={onLeftLoad}
            className="w-full h-full"
          />
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-[var(--vz-border-subtle)] self-stretch" />

      {/* Right */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-3 py-2 bg-[var(--vz-raised)] border-b border-[var(--vz-border-subtle)]">
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            {rightLabel}
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <ZoomableImage
            src={rightSrc}
            alt={rightLabel}
            zoom={zoom}
            metadata={metadata}
            onLoad={onRightLoad}
            className="w-full h-full"
          />
        </div>
      </div>
    </div>
  );
}
