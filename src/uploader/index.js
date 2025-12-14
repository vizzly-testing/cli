/**
 * Uploader Module
 *
 * Exports pure functions (core) and I/O operations for screenshot uploading.
 */

// Core - pure functions
export {
  buildBuildInfo,
  buildCompletedProgress,
  buildDeduplicationProgress,
  buildFileMetadata,
  buildProcessingProgress,
  buildScanningProgress,
  buildScreenshotPattern,
  buildUploadingProgress,
  buildUploadResult,
  buildWaitResult,
  computeSha256,
  DEFAULT_BATCH_SIZE,
  DEFAULT_SHA_CHECK_BATCH_SIZE,
  DEFAULT_TIMEOUT,
  extractBrowserFromFilename,
  extractStatusCodeFromError,
  fileToScreenshotFormat,
  getElapsedTime,
  isTimedOut,
  partitionFilesByExistence,
  resolveBatchSize,
  resolveTimeout,
  validateApiKey,
  validateDirectoryStats,
  validateFilesFound,
  validateScreenshotsDir,
} from './core.js';

// Operations - I/O with dependency injection
export {
  checkExistingFiles,
  findScreenshots,
  processFiles,
  upload,
  uploadFiles,
  waitForBuild,
} from './operations.js';
