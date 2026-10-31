/**
 * Build device poll request payload
 * @param {string} deviceCode - Device code from initiate
 * @returns {Object} Request payload
 */
export function buildDevicePollPayload(deviceCode) {
  return { device_code: deviceCode };
}

/**
 * Build refresh token request payload
 * @param {string} refreshToken - Refresh token
 * @returns {Object} Request payload
 */
export function buildRefreshPayload(refreshToken) {
  return { refreshToken };
}

/**
 * Build logout request payload
 * @param {string} refreshToken - Refresh token to revoke
 * @returns {Object} Request payload
 */
export function buildLogoutPayload(refreshToken) {
  return { refreshToken };
}
