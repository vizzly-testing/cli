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

/**
 * Calculate what percentage of diff clusters fall within region boxes
 *
 * @param {Array} diffClusters - Array of diff clusters from honeydiff
 * @param {Array} regions - Array of confirmed regions { x1, y1, x2, y2 }
 * @returns {{ coverage: number, clustersInRegions: number, totalClusters: number, matchedRegions: string[] }}
 */
export function calculateRegionCoverage(diffClusters, regions) {
  if (!diffClusters || diffClusters.length === 0) {
    return {
      coverage: 0,
      clustersInRegions: 0,
      totalClusters: 0,
      matchedRegions: [],
    };
  }

  if (!regions || regions.length === 0) {
    return {
      coverage: 0,
      clustersInRegions: 0,
      totalClusters: diffClusters.length,
      matchedRegions: [],
    };
  }

  let clustersInRegions = 0;
  let matchedRegionIds = new Set();

  for (let cluster of diffClusters) {
    // Check if this cluster intersects any region
    let intersectsAnyRegion = false;

    for (let region of regions) {
      if (clusterIntersectsRegion(cluster, region)) {
        intersectsAnyRegion = true;
        // Track which regions were matched (for debugging/display)
        if (region.id) {
          matchedRegionIds.add(region.id);
        } else if (region.label) {
          matchedRegionIds.add(region.label);
        }
      }
    }

    if (intersectsAnyRegion) {
      clustersInRegions++;
    }
  }

  let coverage = clustersInRegions / diffClusters.length;

  return {
    coverage,
    clustersInRegions,
    totalClusters: diffClusters.length,
    matchedRegions: [...matchedRegionIds],
  };
}

/**
 * Determine if a comparison should auto-pass based on region coverage
 *
 * Unlike hotspots which require confidence scoring, user-defined regions
 * are already confirmed by humans, so we only need the 80% threshold.
 *
 * @param {Array} regions - Confirmed regions (already filtered to confirmed status)
 * @param {{ coverage: number }} coverageResult - Result from calculateRegionCoverage
 * @returns {boolean} True if diff should auto-pass as region-filtered
 */
export function shouldAutoApproveFromRegions(regions, coverageResult) {
  if (!regions || regions.length === 0 || !coverageResult) {
    return false;
  }

  // Need at least 80% of diff clusters in confirmed regions
  return coverageResult.coverage >= 0.8;
}
