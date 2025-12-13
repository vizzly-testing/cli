/**
 * TDD Module Exports
 *
 * Re-exports all TDD functionality for clean imports.
 */

// Core pure functions
export {
  generateScreenshotSignature,
  generateBaselineFilename,
  generateComparisonId,
} from './core/signature.js';

export {
  calculateHotspotCoverage,
  shouldFilterAsHotspot,
} from './core/hotspot-coverage.js';

// Metadata I/O
export {
  loadBaselineMetadata,
  saveBaselineMetadata,
  createEmptyBaselineMetadata,
  upsertScreenshotInMetadata,
  findScreenshotBySignature,
} from './metadata/baseline-metadata.js';

export {
  loadHotspotMetadata,
  saveHotspotMetadata,
  getHotspotForScreenshot,
  createHotspotCache,
} from './metadata/hotspot-metadata.js';

// Services
export {
  initializeDirectories,
  clearBaselineData,
  saveBaseline,
  saveCurrent,
  baselineExists,
  getBaselinePath,
  getCurrentPath,
  getDiffPath,
  promoteCurrentToBaseline,
  readBaseline,
  readCurrent,
} from './services/baseline-manager.js';

export {
  compareImages,
  buildPassedComparison,
  buildNewComparison,
  buildFailedComparison,
  buildErrorComparison,
  isDimensionMismatchError,
} from './services/comparison-service.js';

export {
  calculateSummary,
  buildResults,
  getFailedComparisons,
  getNewComparisons,
  getErrorComparisons,
  isSuccessful,
  findComparisonById,
  findComparison,
} from './services/result-service.js';

export {
  downloadBaselineImage,
  baselineMatchesSha,
  downloadBaselinesInBatches,
  buildBaselineMetadataEntry,
} from './services/baseline-downloader.js';

export {
  downloadHotspots,
  extractScreenshotNames,
} from './services/hotspot-service.js';
