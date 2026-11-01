/**
 * Get TDD baselines for a build
 * @param {Object} client - API client
 * @param {string} buildId - Build ID
 * @returns {Promise<Object>} { build, screenshots, signatureProperties }
 */
export async function getTddBaselines(client, buildId) {
  return client.request(`/api/sdk/builds/${buildId}/tdd-baselines`);
}
