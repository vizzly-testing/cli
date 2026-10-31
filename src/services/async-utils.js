/**
 * Race an operation against a timeout and always clear the timer when either
 * side settles.
 *
 * @param {Promise<unknown>} operation - Operation promise to wait for.
 * @param {number} ms - Timeout in milliseconds.
 * @param {string} message - Error message when the timeout wins.
 * @param {Object} [timers] - Timer implementation for deterministic tests.
 * @returns {Promise<unknown>} The operation result.
 */
export async function withTimeout(
  operation,
  ms,
  message,
  timers = { setTimeout, clearTimeout }
) {
  let timeoutId;
  let timeoutPromise = new Promise((_, reject) => {
    timeoutId = timers.setTimeout(() => reject(new Error(message)), ms);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      timers.clearTimeout(timeoutId);
    }
  }
}
