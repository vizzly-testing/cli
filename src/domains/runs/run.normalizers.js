/**
 * Normalize setBaseline option (handles both camelCase and kebab-case)
 * @param {Object} options - Options object
 * @returns {boolean} Whether to set baseline
 */
export function normalizeSetBaseline(options) {
  return Boolean(options?.setBaseline || options?.['set-baseline']);
}
