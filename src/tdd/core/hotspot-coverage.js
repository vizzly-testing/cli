/**
 * Hotspot Coverage Calculation
 *
 * Pure functions for calculating how much of a visual diff falls within
 * "hotspot" regions - areas of the UI that frequently change due to dynamic
 * content (timestamps, animations, etc.).
 *
 * Uses 1D Y-coordinate matching (same algorithm as cloud).
 */

/**
 * Calculate what percentage of diff falls within hotspot regions
 *
 * @param {Array} diffClusters - Array of diff clusters from honeydiff
 * @param {Object} hotspotAnalysis - Hotspot data with regions array
 * @returns {{ coverage: number, linesInHotspots: number, totalLines: number }}
 */
export function calculateHotspotCoverage(diffClusters, hotspotAnalysis) {
  if (!diffClusters || diffClusters.length === 0) {
    return { coverage: 0, linesInHotspots: 0, totalLines: 0 };
  }

  if (
    !hotspotAnalysis ||
    !hotspotAnalysis.regions ||
    hotspotAnalysis.regions.length === 0
  ) {
    return { coverage: 0, linesInHotspots: 0, totalLines: 0 };
  }

  // Extract Y-coordinates (diff lines) from clusters
  // Each cluster has a boundingBox with y and height
  let diffLines = [];
  for (let cluster of diffClusters) {
    if (cluster.boundingBox) {
      let { y, height } = cluster.boundingBox;
      // Add all Y lines covered by this cluster
      for (let line = y; line < y + height; line++) {
        diffLines.push(line);
      }
    }
  }

  if (diffLines.length === 0) {
    return { coverage: 0, linesInHotspots: 0, totalLines: 0 };
  }

  // Remove duplicates and sort
  diffLines = [...new Set(diffLines)].sort((a, b) => a - b);

  // Check how many diff lines fall within hotspot regions
  let linesInHotspots = 0;
  for (let line of diffLines) {
    let inHotspot = hotspotAnalysis.regions.some(
      region => line >= region.y1 && line <= region.y2
    );
    if (inHotspot) {
      linesInHotspots++;
    }
  }

  let coverage = linesInHotspots / diffLines.length;

  return {
    coverage,
    linesInHotspots,
    totalLines: diffLines.length,
  };
}

/**
 * Determine if a comparison should be filtered as "passed" based on hotspot coverage
 *
 * A diff is filtered when:
 * 1. Coverage is >= 80% (most diff in hotspot regions)
 * 2. Confidence is "high" or confidence score > 0.7
 *
 * @param {Object} hotspotAnalysis - Hotspot data with confidence info
 * @param {{ coverage: number }} coverageResult - Result from calculateHotspotCoverage
 * @returns {boolean} True if diff should be filtered as hotspot noise
 */
export function shouldFilterAsHotspot(hotspotAnalysis, coverageResult) {
  if (!hotspotAnalysis || !coverageResult) {
    return false;
  }

  let { coverage } = coverageResult;

  // Need at least 80% of diff in hotspot regions
  if (coverage < 0.8) {
    return false;
  }

  // Need high confidence in the hotspot analysis
  let { confidence, confidenceScore } = hotspotAnalysis;

  if (confidence === 'high') {
    return true;
  }

  if (confidenceScore !== undefined && confidenceScore > 0.7) {
    return true;
  }

  return false;
}
