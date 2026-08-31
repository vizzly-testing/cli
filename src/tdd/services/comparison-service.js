/**
 * Comparison Service
 *
 * Wraps honeydiff for image comparison and builds comparison result objects.
 */

import { analyze } from '@vizzly-testing/honeydiff';
import { generateComparisonId } from '../core/signature.js';

/**
 * Compare two images using honeydiff
 *
 * @param {string} baselinePath - Path to baseline image
 * @param {string} currentPath - Path to current image
 * @param {string} diffPath - Path to save diff image
 * @param {Object} options - Comparison options
 * @param {number} options.threshold - CIEDE2000 Delta E threshold (default: 2.0)
 * @param {number} options.minClusterSize - Minimum cluster size (default: 2)
 * @returns {Promise<Object>} Honeydiff result
 * @throws {Error} When honeydiff binary fails (e.g., corrupt images, dimension mismatch)
 */
export async function compareImages(
  baselinePath,
  currentPath,
  diffPath,
  options = {}
) {
  let { threshold = 2.0, minClusterSize = 2 } = options;

  let analysis = await analyze(
    baselinePath,
    currentPath,
    {
      threshold,
      antialiasing: true,
      minimumRegionPixels: minClusterSize,
    },
    { diffPath, overwrite: true }
  );
  let comparison = analysis.comparison;
  let perception = analysis.perception;
  let changedPixels = comparison.pixels.changed.total;
  let totalPixels = comparison.pixels.total;
  let heightChange = comparison.heightChange;

  return {
    isDifferent: comparison.different,
    diffPercentage: totalPixels > 0 ? (changedPixels / totalPixels) * 100 : 0,
    diffPixels: changedPixels,
    totalPixels,
    aaPixelsIgnored: comparison.pixels.suppressed.antialiasing.count,
    aaPercentage:
      totalPixels > 0
        ? (comparison.pixels.suppressed.antialiasing.count / totalPixels) * 100
        : 0,
    boundingBox: comparison.difference.spatial?.bounds || null,
    heightDiff: heightChange
      ? heightChange.direction === 'added'
        ? heightChange.rowCount
        : -heightChange.rowCount
      : 0,
    intensityStats: comparison.difference.appearance,
    diffClusters: comparison.difference.regions.map(region => ({
      boundingBox: region.spatial.bounds,
      pixelCount: region.spatial.pixelCount,
      visualPixels: region.visualPixels,
      addedPixels: region.addedPixels,
      removedPixels: region.removedPixels,
      appearance: region.appearance,
    })),
    perceptualScore: perception?.ssim,
    ssimScore: perception?.ssim,
    gmsdScore: perception?.gmsd,
  };
}

/**
 * Build a comparison result object for a passing comparison (no diff)
 *
 * @param {Object} params
 * @param {string} params.name - Screenshot name
 * @param {string} params.signature - Screenshot signature
 * @param {string} params.baselinePath - Path to baseline image
 * @param {string} params.currentPath - Path to current image
 * @param {Object} params.properties - Screenshot properties
 * @param {number} params.threshold - Effective threshold used
 * @param {number} params.minClusterSize - Effective minClusterSize used
 * @param {Object} params.honeydiffResult - Result from honeydiff (optional, for metrics)
 * @returns {Object} Comparison result
 */
export function buildPassedComparison(params) {
  let {
    name,
    signature,
    baselinePath,
    currentPath,
    properties,
    threshold,
    minClusterSize,
    honeydiffResult,
  } = params;

  return {
    id: generateComparisonId(signature),
    name,
    status: 'passed',
    baseline: baselinePath,
    current: currentPath,
    diff: null,
    properties,
    signature,
    threshold,
    minClusterSize,
    totalPixels: honeydiffResult?.totalPixels,
    aaPixelsIgnored: honeydiffResult?.aaPixelsIgnored,
    aaPercentage: honeydiffResult?.aaPercentage,
  };
}

/**
 * Build a comparison result object for a new baseline
 *
 * @param {Object} params
 * @param {string} params.name - Screenshot name
 * @param {string} params.signature - Screenshot signature
 * @param {string} params.baselinePath - Path to baseline image
 * @param {string} params.currentPath - Path to current image
 * @param {Object} params.properties - Screenshot properties
 * @returns {Object} Comparison result
 */
export function buildNewComparison(params) {
  let { name, signature, baselinePath, currentPath, properties } = params;

  return {
    id: generateComparisonId(signature),
    name,
    status: 'new',
    baseline: baselinePath,
    current: currentPath,
    diff: null,
    properties,
    signature,
  };
}

/**
 * Build a comparison result object for a failed comparison (with diff)
 *
 * @param {Object} params
 * @param {string} params.name - Screenshot name
 * @param {string} params.signature - Screenshot signature
 * @param {string} params.baselinePath - Path to baseline image
 * @param {string} params.currentPath - Path to current image
 * @param {string} params.diffPath - Path to diff image
 * @param {Object} params.properties - Screenshot properties
 * @param {number} params.threshold - Effective threshold used
 * @param {number} params.minClusterSize - Effective minClusterSize used
 * @param {Object} params.honeydiffResult - Result from honeydiff
 * @returns {Object} Comparison result
 */
export function buildFailedComparison(params) {
  let {
    name,
    signature,
    baselinePath,
    currentPath,
    diffPath,
    properties,
    threshold,
    minClusterSize,
    honeydiffResult,
  } = params;

  let diffClusters = honeydiffResult.diffClusters || [];

  return {
    id: generateComparisonId(signature),
    name,
    status: 'failed',
    baseline: baselinePath,
    current: currentPath,
    diff: diffPath,
    properties,
    signature,
    threshold,
    minClusterSize,
    diffPercentage: honeydiffResult.diffPercentage,
    diffCount: honeydiffResult.diffPixels,
    reason: 'pixel-diff',
    totalPixels: honeydiffResult.totalPixels,
    aaPixelsIgnored: honeydiffResult.aaPixelsIgnored,
    aaPercentage: honeydiffResult.aaPercentage,
    boundingBox: honeydiffResult.boundingBox,
    heightDiff: honeydiffResult.heightDiff,
    intensityStats: honeydiffResult.intensityStats,
    diffClusters,
  };
}

/**
 * Build a comparison result object for an error
 *
 * @param {Object} params
 * @param {string} params.name - Screenshot name
 * @param {string} params.signature - Screenshot signature
 * @param {string} params.baselinePath - Path to baseline image
 * @param {string} params.currentPath - Path to current image
 * @param {Object} params.properties - Screenshot properties
 * @param {string} params.errorMessage - Error message
 * @returns {Object} Comparison result
 */
export function buildErrorComparison(params) {
  let { name, signature, baselinePath, currentPath, properties, errorMessage } =
    params;

  return {
    id: generateComparisonId(signature),
    name,
    status: 'error',
    baseline: baselinePath,
    current: currentPath,
    diff: null,
    properties,
    signature,
    error: errorMessage,
  };
}

/**
 * Check if an error is a dimension mismatch from honeydiff
 *
 * @param {Error} error
 * @returns {boolean}
 */
export function isDimensionMismatchError(error) {
  return error.message?.includes("Image dimensions don't match") ?? false;
}
