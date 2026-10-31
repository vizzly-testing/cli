import * as output from '../../services/output.js';
import {
  buildScreenshotPayload,
  buildScreenshotResolvePayload,
  buildShaCheckPayload,
} from './screenshot.serializers.js';
import { computeSha256 } from './screenshot-hash.js';

/**
 * Check if SHAs already exist on the server
 * @param {Object} client - API client
 * @param {Array} screenshots - Screenshots to check (objects with sha256, or string SHAs)
 * @param {string} buildId - Build ID for screenshot record creation
 * @returns {Promise<Object>} { existing, missing, screenshots }
 */
export async function checkShas(client, screenshots, buildId) {
  try {
    let payload = buildShaCheckPayload(screenshots, buildId);
    return await client.request('/api/sdk/check-shas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Continue without deduplication on error
    output.debug('sha-check', 'failed, continuing without deduplication', {
      error: error.message,
    });

    // Extract SHAs for fallback response
    let shaList =
      Array.isArray(screenshots) &&
      screenshots.length > 0 &&
      typeof screenshots[0] === 'object'
        ? screenshots.map(s => s.sha256)
        : screenshots;

    return { existing: [], missing: shaList, screenshots: [] };
  }
}

function canUploadBytesAfterShaResolveError(error) {
  let status = error?.context?.status;

  // Network failures, older servers, and server errors should degrade to the
  // slower byte upload path. Auth and ownership errors must still surface.
  if (!status) return true;
  if (status >= 500) return true;
  if (status === 400 && error.message?.includes('image_data')) return true;

  return false;
}

/**
 * Upload a screenshot with SHA deduplication
 * @param {Object} client - API client
 * @param {string} buildId - Build ID
 * @param {string} name - Screenshot name
 * @param {Buffer} buffer - Screenshot data
 * @param {Object} metadata - Additional metadata
 * @param {boolean} skipDedup - Skip SHA deduplication (uploadAll mode)
 * @returns {Promise<Object>} Upload result
 */
export async function uploadScreenshot(
  client,
  buildId,
  name,
  buffer,
  metadata = {},
  skipDedup = false,
  screenshotOptions = {}
) {
  // Skip SHA deduplication if requested
  if (skipDedup) {
    let payload = buildScreenshotPayload(
      name,
      buffer,
      metadata,
      null,
      screenshotOptions
    );
    return client.request(`/api/sdk/builds/${buildId}/screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  // Normal flow with server-side SHA resolution.
  let sha256 = computeSha256(buffer);
  let resolvePayload = buildScreenshotResolvePayload(
    name,
    metadata,
    sha256,
    screenshotOptions
  );
  try {
    let resolveResult = await client.request(
      `/api/sdk/builds/${buildId}/screenshots`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resolvePayload),
      }
    );

    if (resolveResult?.upload_required === false) {
      return {
        message: 'Screenshot already exists, skipped upload',
        sha256,
        skipped: true,
        screenshot: resolveResult,
        fromExisting: true,
      };
    }
  } catch (error) {
    if (!canUploadBytesAfterShaResolveError(error)) {
      throw error;
    }

    output.debug('sha-resolve', 'failed, uploading screenshot bytes', {
      error: error.message,
    });
  }

  // File doesn't exist, or resolve failed; proceed with upload.
  let payload = buildScreenshotPayload(
    name,
    buffer,
    metadata,
    sha256,
    screenshotOptions
  );
  return client.request(`/api/sdk/builds/${buildId}/screenshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
