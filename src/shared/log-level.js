/**
 * Get log level from environment
 * @returns {string} Log level with default
 */
export function getLogLevel() {
  return process.env.VIZZLY_LOG_LEVEL || 'info';
}
