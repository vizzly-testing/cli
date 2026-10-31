/**
 * Validate builds command options
 */
export function validateBuildsOptions(options = {}) {
  let errors = [];

  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > 250)
  ) {
    errors.push('--limit must be an integer between 1 and 250');
  }

  if (
    options.offset !== undefined &&
    (!Number.isInteger(options.offset) || options.offset < 0)
  ) {
    errors.push('--offset must be a non-negative integer');
  }

  return errors;
}

/**
 * Validate status options
 * @param {string} buildId - Build ID to check
 * @param {Object} options - Command options
 */
export function validateStatusOptions(buildId) {
  let errors = [];

  if (!buildId || buildId.trim() === '') {
    errors.push('Build ID is required');
  }

  return errors;
}

/**
 * Validate finalize options
 * @param {string} parallelId - Parallel ID to finalize
 * @param {Object} options - Command options
 */
export function validateFinalizeOptions(parallelId, _options) {
  let errors = [];

  if (!parallelId || parallelId.trim() === '') {
    errors.push('Parallel ID is required');
  }

  return errors;
}
