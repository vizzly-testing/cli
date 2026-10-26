// Group changed rows using their content height, and keep inserted or removed
// rows as separate changes. All coordinates refer to the current screenshot.

function toFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readRegionBounds(cluster) {
  let bounds = cluster?.boundingBox;
  if (
    !bounds ||
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    return null;
  return bounds;
}

function toRegionBand(region, index) {
  let bounds = readRegionBounds(region);
  if (!bounds) return null;

  return {
    kind: 'changed',
    x1: bounds.x,
    x2: bounds.x + bounds.width,
    y1: bounds.y,
    y2: bounds.y + bounds.height,
    rowCount: null,
    regionIndexes: [index],
    deltaE: toFiniteNumber(region.appearance?.mean),
  };
}

function toHeightChangeBand(heightChange) {
  let startRow = toFiniteNumber(heightChange?.startRow);
  let rowCount = toFiniteNumber(heightChange?.rowCount);
  if (startRow === null || rowCount === null || rowCount <= 0) return null;

  let added = heightChange.direction === 'added';
  return {
    kind: added ? 'added' : 'removed',
    y1: startRow,
    // Removed rows no longer exist in the current screenshot, so the band
    // marks the seam where they used to be.
    y2: added ? startRow + rowCount : startRow,
    rowCount,
  };
}

function isNear(band, next) {
  return next.y1 - band.y2 <= Math.min(next.y2 - next.y1, band.y2 - band.y1);
}

function maxDeltaE(first, second) {
  if (first === null) return second;
  if (second === null) return first;
  return Math.max(first, second);
}

// Bands here are built by this module, so merging updates them in place.
function mergeNearbyBands(bands) {
  return bands.reduce((merged, band) => {
    let previous = merged.at(-1);
    if (previous && isNear(previous, band)) {
      previous.x1 = Math.min(previous.x1, band.x1);
      previous.x2 = Math.max(previous.x2, band.x2);
      previous.y2 = Math.max(previous.y2, band.y2);
      previous.regionIndexes.push(...band.regionIndexes);
      previous.deltaE = maxDeltaE(previous.deltaE, band.deltaE);
    } else {
      merged.push(band);
    }
    return merged;
  }, []);
}

/**
 * @param {Object} input
 * @param {Array} input.clusters - CLI difference clusters
 * @param {Object|null} input.heightChange - Honeydiff `heightChange`
 * @returns {Array<Object>} Bands ordered top to bottom
 */
export function buildDiffBands({ clusters = [], heightChange = null } = {}) {
  let heightBand = toHeightChangeBand(heightChange);
  let insideInsertion = band =>
    heightBand?.kind === 'added' &&
    band.y1 >= heightBand.y1 &&
    band.y2 <= heightBand.y2;

  let regionBands = (clusters || [])
    .map(toRegionBand)
    .filter(band => band && !insideInsertion(band))
    .sort((first, second) => first.y1 - second.y1 || first.y2 - second.y2);

  let bands = mergeNearbyBands(mergeNearbyBands(regionBands));
  if (heightBand) bands.push(heightBand);

  return bands
    .sort((first, second) => first.y1 - second.y1)
    .map(band => ({ ...band, id: `${band.kind}-${band.y1}-${band.y2}` }));
}
