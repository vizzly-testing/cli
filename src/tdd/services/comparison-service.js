/**
 * Comparison Service
 *
 * Wraps honeydiff for image comparison and builds comparison result objects.
 */

import { compare } from '@vizzly-testing/honeydiff';
import { generateComparisonId } from '../core/signature.js';
import { calculateHotspotCoverage } from '../core/hotspot-coverage.js';

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
 */
export async function compareImages(
  baselinePath,
  currentPath,
  diffPath,
  options = {}
) {
  let { threshold = 2.0, minClusterSize = 2 } = options;

  return compare(baselinePath, currentPath, {
    threshold,
    antialiasing: true,
    diffPath,
    overwrite: true,
    includeClusters: true,
    minClusterSize,
  });
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
 * @param {Object} params.hotspotAnalysis - Hotspot data for this screenshot (optional)
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
    hotspotAnalysis,
  } = params;

  // Calculate hotspot coverage if we have hotspot data
  let hotspotCoverage = null;
  let isHotspotFiltered = false;

  if (hotspotAnalysis && honeydiffResult.diffClusters?.length > 0) {
    hotspotCoverage = calculateHotspotCoverage(
      honeydiffResult.diffClusters,
      hotspotAnalysis
    );

    // Check if diff should be filtered as hotspot noise
    // Using shouldFilterAsHotspot helper but also checking confidence_score
    // (cloud uses confidence_score >= 70 which is >0.7 when normalized)
    let isHighConfidence =
      hotspotAnalysis.confidence === 'high' ||
      (hotspotAnalysis.confidence_score !== undefined &&
        hotspotAnalysis.confidence_score >= 70);

    if (isHighConfidence && hotspotCoverage.coverage >= 0.8) {
      isHotspotFiltered = true;
    }
  }

  return {
    id: generateComparisonId(signature),
    name,
    status: isHotspotFiltered ? 'passed' : 'failed',
    baseline: baselinePath,
    current: currentPath,
    diff: diffPath,
    properties,
    signature,
    threshold,
    minClusterSize,
    diffPercentage: honeydiffResult.diffPercentage,
    diffCount: honeydiffResult.diffPixels,
    reason: isHotspotFiltered ? 'hotspot-filtered' : 'pixel-diff',
    totalPixels: honeydiffResult.totalPixels,
    aaPixelsIgnored: honeydiffResult.aaPixelsIgnored,
    aaPercentage: honeydiffResult.aaPercentage,
    boundingBox: honeydiffResult.boundingBox,
    heightDiff: honeydiffResult.heightDiff,
    intensityStats: honeydiffResult.intensityStats,
    diffClusters: honeydiffResult.diffClusters,
    hotspotAnalysis: hotspotCoverage
      ? {
          coverage: hotspotCoverage.coverage,
          linesInHotspots: hotspotCoverage.linesInHotspots,
          totalLines: hotspotCoverage.totalLines,
          confidence: hotspotAnalysis?.confidence,
          confidenceScore: hotspotAnalysis?.confidence_score,
          regionCount: hotspotAnalysis?.regions?.length || 0,
          isFiltered: isHotspotFiltered,
        }
      : null,
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
