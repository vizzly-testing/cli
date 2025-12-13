/**
 * TDD Module Exports
 *
 * Re-exports all TDD functionality for clean imports.
 */

export {
  calculateHotspotCoverage,
  shouldFilterAsHotspot,
} from './core/hotspot-coverage.js';
// Core pure functions
export {
  generateBaselineFilename,
  generateComparisonId,
  generateScreenshotSignature,
} from './core/signature.js';

// Metadata I/O
export {
  createEmptyBaselineMetadata,
  findScreenshotBySignature,
  loadBaselineMetadata,
  saveBaselineMetadata,
  upsertScreenshotInMetadata,
} from './metadata/baseline-metadata.js';

export {
  createHotspotCache,
  getHotspotForScreenshot,
  loadHotspotMetadata,
  saveHotspotMetadata,
} from './metadata/hotspot-metadata.js';
export {
  baselineMatchesSha,
  buildBaselineMetadataEntry,
  downloadBaselineImage,
  downloadBaselinesInBatches,
} from './services/baseline-downloader.js';
// Services
export {
  baselineExists,
  clearBaselineData,
  getBaselinePath,
  getCurrentPath,
  getDiffPath,
  initializeDirectories,
  promoteCurrentToBaseline,
  readBaseline,
  readCurrent,
  saveBaseline,
  saveCurrent,
} from './services/baseline-manager.js';
export {
  buildErrorComparison,
  buildFailedComparison,
  buildNewComparison,
  buildPassedComparison,
  compareImages,
  isDimensionMismatchError,
} from './services/comparison-service.js';
export {
  downloadHotspots,
  extractScreenshotNames,
} from './services/hotspot-service.js';
export {
  buildResults,
  calculateSummary,
  findComparison,
  findComparisonById,
  getErrorComparisons,
  getFailedComparisons,
  getNewComparisons,
  isSuccessful,
} from './services/result-service.js';
