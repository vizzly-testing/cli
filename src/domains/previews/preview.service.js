/**
 * Upload preview ZIP file for a build
 * @param {Object} client - API client
 * @param {string} buildId - Build ID
 * @param {Buffer} zipBuffer - ZIP file contents
 * @returns {Promise<Object>} Upload result with preview URL
 */
export async function uploadPreviewZip(client, buildId, zipBuffer) {
  // Use native FormData (Node 18+) with Blob for proper fetch compatibility
  let formData = new FormData();
  let blob = new Blob([zipBuffer], { type: 'application/zip' });
  formData.append('file', blob, 'preview.zip');

  return client.request(`/api/sdk/builds/${buildId}/preview/upload-zip`, {
    method: 'POST',
    body: formData,
    // Let fetch set the Content-Type with boundary automatically
  });
}

/**
 * Get preview info for a build
 * @param {Object} client - API client
 * @param {string} buildId - Build ID
 * @returns {Promise<Object>} Preview info or null if not found
 */
export async function getPreviewInfo(client, buildId) {
  try {
    return await client.request(`/api/sdk/builds/${buildId}/preview`);
  } catch (error) {
    if (error.context?.status === 404) {
      return null;
    }
    throw error;
  }
}
