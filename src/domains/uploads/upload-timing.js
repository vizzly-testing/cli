/**
 * Check if timeout has been exceeded
 * @param {number} startTime - Start timestamp
 * @param {number} timeout - Timeout in ms
 * @returns {boolean} True if timed out
 */
export function isTimedOut(startTime, timeout, now = Date.now()) {
  return now - startTime >= timeout;
}

/**
 * Get elapsed time since start
 * @param {number} startTime - Start timestamp
 * @returns {number} Elapsed time in ms
 */
export function getElapsedTime(startTime, now = Date.now()) {
  return now - startTime;
}
