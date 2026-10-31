import { DEFAULT_BATCH_SIZE, DEFAULT_TIMEOUT } from './upload-defaults.js';

/**
 * Resolve batch size from options and config
 * @param {Object} options - Runtime options
 * @param {Object} uploadConfig - Upload configuration
 * @returns {number} Resolved batch size
 */
export function resolveBatchSize(options, uploadConfig) {
  return Number(
    options?.batchSize ?? uploadConfig?.batchSize ?? DEFAULT_BATCH_SIZE
  );
}

/**
 * Resolve timeout from options and config
 * @param {Object} options - Runtime options
 * @param {Object} uploadConfig - Upload configuration
 * @returns {number} Resolved timeout in ms
 */
export function resolveTimeout(options, uploadConfig) {
  return Number(options?.timeout ?? uploadConfig?.timeout ?? DEFAULT_TIMEOUT);
}
