/** Return input guidance when a cloud build ID is not a UUID. */
export function getBuildIdValidationError(buildId) {
  if (
    typeof buildId === 'string' &&
    buildId.length === 36 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      buildId
    )
  ) {
    return null;
  }

  return (
    'Build ID must be a UUID. Get an ID from `vizzly builds --json` ' +
    'and check that a build was returned.'
  );
}

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
