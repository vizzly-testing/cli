/**
 * Region Coverage Calculation
 *
 * Pure functions for calculating how much of a visual diff falls within
 * user-defined "region" areas - 2D bounding boxes that users have confirmed
 * as dynamic content areas (e.g., timestamps, animations, user avatars).
 *
 * Unlike hotspots (1D Y-bands from historical analysis), regions are explicit
 * 2D boxes that users have manually confirmed via the cloud UI.
 */

let REGION_CENTER_TOLERANCE = 10;

/**
 * Check if a diff cluster intersects with a region (2D box intersection)
 *
 * @param {Object} cluster - Diff cluster with boundingBox { x, y, width, height }
 * @param {Object} region - Region with { x1, y1, x2, y2 }
 * @returns {boolean} True if the cluster overlaps the region
 */
export function clusterIntersectsRegion(cluster, region) {
  if (!cluster?.boundingBox || !region) {
    return false;
  }

  let { x, y, width, height } = cluster.boundingBox;

  // Convert cluster to x1,y1,x2,y2 format
  let clusterX1 = x;
  let clusterY1 = y;
  let clusterX2 = x + width;
  let clusterY2 = y + height;

  // Box intersection: NOT (one is completely outside the other)
  // A is left of B: clusterX2 < region.x1
  // A is right of B: clusterX1 > region.x2
  // A is above B: clusterY2 < region.y1
  // A is below B: clusterY1 > region.y2
  let noOverlap =
    clusterX2 < region.x1 ||
    clusterX1 > region.x2 ||
    clusterY2 < region.y1 ||
    clusterY1 > region.y2;

  return !noOverlap;
}

function normalizeBoundingBox(cluster) {
  let box = cluster?.boundingBox || cluster;
  if (!box) {
    return null;
  }

  if (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height)
  ) {
    return {
      x1: box.x,
      y1: box.y,
      x2: box.x + box.width,
      y2: box.y + box.height,
      width: Math.abs(box.width),
      height: Math.abs(box.height),
    };
  }

  if (
    Number.isFinite(box.x1) &&
    Number.isFinite(box.y1) &&
    Number.isFinite(box.x2) &&
    Number.isFinite(box.y2)
  ) {
    let width = Math.abs(box.x2 - box.x1);
    let height = Math.abs(box.y2 - box.y1);
    return {
      x1: box.x1,
      y1: box.y1,
      x2: box.x2,
      y2: box.y2,
      width,
      height,
    };
  }

  return null;
}

function getBoundingBoxCenter(box) {
  return {
    x: (box.x1 + box.x2) / 2,
    y: (box.y1 + box.y2) / 2,
  };
}

function getRegionLabel(region) {
  return region.id || region.label || null;
}

function clusterMatchesRegion(cluster, region) {
  let clusterBox = normalizeBoundingBox(cluster);
  let regionBox = normalizeBoundingBox(region);

  if (!clusterBox || !regionBox) {
    return false;
  }

  let clusterCenter = getBoundingBoxCenter(clusterBox);
  let regionCenter = getBoundingBoxCenter(regionBox);
  let distance = Math.sqrt(
    (clusterCenter.x - regionCenter.x) ** 2 +
      (clusterCenter.y - regionCenter.y) ** 2
  );

  return distance <= REGION_CENTER_TOLERANCE;
}

function estimateClusterPixels(cluster) {
  if (Number.isFinite(cluster?.pixelCount)) {
    return cluster.pixelCount;
  }

  let box = normalizeBoundingBox(cluster);
  if (!box) {
    return 0;
  }

  return box.width * box.height * 0.5;
}

/**
 * Calculate what percentage of changed pixels match confirmed regions.
 *
 * This mirrors cloud dynamic-region approval: clusters match confirmed regions
 * by center proximity, then coverage is weighted by changed pixels. A huge
 * unmatched change should not be hidden just because several tiny clusters
 * match confirmed regions.
 *
 * @param {Array} diffClusters - Array of diff clusters from honeydiff
 * @param {Array} regions - Array of confirmed regions { x1, y1, x2, y2 }
 * @returns {{ coverage: number, clustersInRegions: number, totalClusters: number, matchedRegions: string[], pixelsInRegions: number, totalPixels: number }}
 */
export function calculateRegionCoverage(diffClusters, regions) {
  if (!diffClusters || diffClusters.length === 0) {
    return {
      coverage: 0,
      clustersInRegions: 0,
      totalClusters: 0,
      matchedRegions: [],
      pixelsInRegions: 0,
      totalPixels: 0,
    };
  }

  if (!regions || regions.length === 0) {
    return {
      coverage: 0,
      clustersInRegions: 0,
      totalClusters: diffClusters.length,
      matchedRegions: [],
      pixelsInRegions: 0,
      totalPixels: 0,
    };
  }

  let clustersInRegions = 0;
  let matchedRegionIds = new Set();
  let pixelsInRegions = 0;
  let totalPixels = 0;

  for (let cluster of diffClusters) {
    let pixelCount = estimateClusterPixels(cluster);
    totalPixels += pixelCount;

    let matchedAnyRegion = false;

    for (let region of regions) {
      if (clusterMatchesRegion(cluster, region)) {
        matchedAnyRegion = true;

        let regionLabel = getRegionLabel(region);
        if (regionLabel) {
          matchedRegionIds.add(regionLabel);
        }
      }
    }

    if (matchedAnyRegion) {
      clustersInRegions++;
      pixelsInRegions += pixelCount;
    }
  }

  let coverage = totalPixels > 0 ? pixelsInRegions / totalPixels : 0;

  return {
    coverage,
    clustersInRegions,
    totalClusters: diffClusters.length,
    matchedRegions: [...matchedRegionIds],
    pixelsInRegions,
    totalPixels,
  };
}

/**
 * Determine if a comparison should auto-pass based on region coverage
 *
 * Unlike hotspots which require confidence scoring, user-defined regions
 * are already confirmed by humans. Cloud still requires strong structural
 * similarity so a layout shift cannot hide inside a confirmed box.
 *
 * @param {Array} regions - Confirmed regions (already filtered to confirmed status)
 * @param {{ coverage: number }} coverageResult - Result from calculateRegionCoverage
 * @param {Object} options - Approval thresholds
 * @param {number|null} options.ssimScore - Honeydiff SSIM/perceptual score
 * @param {number} options.coverageThreshold - Required region coverage
 * @param {number} options.ssimThreshold - Required structural similarity
 * @returns {boolean} True if diff should auto-pass as region-filtered
 */
export function shouldAutoApproveFromRegions(
  regions,
  coverageResult,
  options = {}
) {
  if (!regions || regions.length === 0 || !coverageResult) {
    return false;
  }

  let {
    ssimScore = null,
    coverageThreshold = 0.9,
    ssimThreshold = 0.95,
  } = options;

  if (coverageResult.coverage < coverageThreshold) {
    return false;
  }

  if (ssimScore === null || ssimScore === undefined) {
    return false;
  }

  return ssimScore >= ssimThreshold;
}
