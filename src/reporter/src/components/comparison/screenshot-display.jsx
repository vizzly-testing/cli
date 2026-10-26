import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Alert } from '@vizzly-testing/bear-den';
import {
  OnionSkinMode,
  OverlayMode,
  RegionOverlay,
  ToggleMode,
} from '@vizzly-testing/bear-den/review';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDiffBands } from '../../utils/diff-bands.js';
import { withImageVersion } from '../../utils/image-url.js';
import { DiffGutter, DiffOverview } from './diff-gutter.jsx';

/** All comparison modes share one measured canvas and one zoom calculation. */
export function ScreenshotDisplay({
  comparison,
  viewMode = 'overlay',
  showDiffOverlay = true,
  showBaseline = true,
  onToggleBaseline,
  onionSkinPosition = 50,
  onOnionSkinChange,
  onDiffToggle,
  disableLoadingOverlay = false,
  zoom = 'fit-width',
  showRegions = false,
  className = '',
}) {
  let containerRef = useRef(null);
  let imageRef = useRef(null);
  let [selectedBandId, setSelectedBandId] = useState(null);
  let [hoveredBandId, setHoveredBandId] = useState(null);
  let [imageStates, setImageStates] = useState(new Map());
  let [dimensions, setDimensions] = useState({
    width: 0,
    height: 0,
    imageWidth: 0,
    imageHeight: 0,
  });

  useEffect(() => {
    let container = containerRef.current;
    let measure = () => {
      let images = [...container.querySelectorAll('img')];
      let image =
        images.find(image => getComputedStyle(image).position !== 'absolute') ||
        images[0];
      if (!image?.naturalWidth) return;
      let next = {
        width: container.clientWidth,
        height: container.clientHeight,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
      };
      setDimensions(previous =>
        Object.keys(next).every(key => previous[key] === next[key])
          ? previous
          : next
      );
    };
    let observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(imageRef.current);
    // Capture loads from images mounted when switching comparison modes.
    container.addEventListener('load', measure, true);
    measure();
    return () => {
      observer.disconnect();
      container.removeEventListener('load', measure, true);
    };
  }, []);

  let markImage = useCallback((key, state) => {
    setImageStates(previous => {
      if (previous.get(key) === state) return previous;
      return new Map(previous).set(key, state);
    });
  }, []);
  let onImageLoad = useCallback(key => markImage(key, 'loaded'), [markImage]);
  let onImageError = useCallback(key => markImage(key, 'error'), [markImage]);
  let imageErrors = new Set(
    [...imageStates]
      .filter(([, state]) => state === 'error')
      .map(([key]) => key)
  );
  let screenshot = {
    id: comparison.id || comparison.signature || comparison.name,
    name: comparison.originalName || comparison.name,
  };
  let currentKey = `current-${screenshot.id}`;
  let baselineKey = `baseline-${screenshot.id}`;
  let imageUrls = {
    currentImageUrl: withImageVersion(comparison.current, comparison.timestamp),
    baselineImageUrl: withImageVersion(
      comparison.baseline,
      comparison.timestamp
    ),
    diffImageUrl: withImageVersion(comparison.diff, comparison.timestamp),
  };
  let fitWidth = Math.max(
    0.01,
    Math.min((dimensions.width - 40) / (dimensions.imageWidth || 1), 1)
  );
  let fitScreen = Math.max(
    0.01,
    Math.min(fitWidth, (dimensions.height - 40) / (dimensions.imageHeight || 1))
  );
  let scale = { fit: fitScreen, 'fit-width': fitWidth }[zoom] ?? zoom;
  let modeProps = {
    ...imageUrls,
    screenshot,
    onImageLoad,
    onImageError,
    imageErrors,
  };
  let bands = useMemo(
    () => (comparison.diff ? buildDiffBands(comparison.diffClusters) : []),
    [comparison.diff, comparison.diffClusters]
  );
  let activeId = hoveredBandId || selectedBandId;
  let activeBand = bands.find(band => band.id === activeId);
  let regions = (comparison.diffClusters || []).flatMap((cluster, index) => {
    if (!showRegions && !activeBand?.regionIndexes.includes(index)) return [];
    let box = cluster.boundingBox;
    if (!box) return [];
    return [
      {
        id: String(index),
        kind: 'diff',
        x1: box.x,
        y1: box.y,
        x2: box.x + box.width,
        y2: box.y + box.height,
      },
    ];
  });
  let selectBand = band => {
    setSelectedBandId(band.id);
    let container = containerRef.current;
    let image = imageRef.current;
    let imageTop =
      image.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;
    container.scrollTo({
      top:
        imageTop +
        ((band.y1 + band.y2) / 2) * scale -
        container.clientHeight / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  };

  let viewer;
  if (viewMode === 'toggle' && comparison.baseline) {
    viewer = (
      <ToggleMode
        {...modeProps}
        showBaseline={showBaseline}
        onToggle={onToggleBaseline}
        baselineImageLoaded={imageStates.get(baselineKey) === 'loaded'}
        currentImageLoaded={imageStates.get(currentKey) === 'loaded'}
        baselineImageError={imageErrors.has(baselineKey)}
        currentImageError={imageErrors.has(currentKey)}
        setBaselineImageLoaded={() => onImageLoad(baselineKey)}
        setCurrentImageLoaded={() => onImageLoad(currentKey)}
        setBaselineImageError={() => onImageError(baselineKey)}
        setCurrentImageError={() => onImageError(currentKey)}
      />
    );
  } else if (viewMode === 'onion-skin' && comparison.baseline) {
    viewer = (
      <OnionSkinMode
        {...modeProps}
        sliderPosition={onionSkinPosition}
        onSliderChange={onOnionSkinChange}
      />
    );
  } else {
    viewer = (
      <OverlayMode
        {...modeProps}
        showDiffOverlay={showDiffOverlay}
        onDiffToggle={onDiffToggle}
      />
    );
  }

  return (
    <div className={`relative h-full ${className}`}>
      <div
        ref={containerRef}
        className="relative h-full overflow-auto bg-[var(--bd-surface)]"
        data-testid="screenshot-canvas"
      >
        <div
          className="relative flex items-start justify-center p-5"
          style={{
            minWidth: Math.max(
              dimensions.width,
              dimensions.imageWidth * scale + 40
            ),
            minHeight: Math.max(
              dimensions.height,
              dimensions.imageHeight * scale + 40
            ),
          }}
        >
          <div
            ref={imageRef}
            className="relative inline-block shrink-0"
            style={{ zoom: scale }}
          >
            {viewer}
            <RegionOverlay
              imageWidth={dimensions.imageWidth}
              imageHeight={dimensions.imageHeight}
              regions={regions}
              labelMode={showRegions ? 'subtle' : 'none'}
            />
            <DiffGutter
              bands={bands}
              imageHeight={dimensions.imageHeight}
              scale={scale}
              activeId={activeId}
              onHover={setHoveredBandId}
              onSelect={selectBand}
            />
          </div>
        </div>
        {!disableLoadingOverlay && !imageStates.has(currentKey) && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-[var(--bd-raised)] text-sm text-[var(--bd-text-tertiary)]"
            role="status"
          >
            Loading screenshot…
          </div>
        )}
        {imageErrors.has(currentKey) && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-[var(--bd-raised)] text-center text-[var(--bd-text-tertiary)]"
            role="alert"
          >
            <div>
              <ExclamationTriangleIcon className="mx-auto mb-2 h-8 w-8" />
              <p className="text-sm">Failed to load image</p>
            </div>
          </div>
        )}
      </div>
      {viewMode !== 'overlay' && imageErrors.has(baselineKey) && (
        <Alert
          variant="warning"
          role="alert"
          className="absolute top-4 left-4 right-4 z-40"
        >
          Baseline image unavailable. Use Overlay to inspect the current
          screenshot.
        </Alert>
      )}
      <DiffOverview
        bands={bands}
        imageHeight={dimensions.imageHeight}
        containerRef={containerRef}
        imageRef={imageRef}
        activeId={activeId}
        onHover={setHoveredBandId}
        onSelect={selectBand}
      />
    </div>
  );
}
