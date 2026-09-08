import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { uploadScreenshot as defaultUploadScreenshot } from '../../api/index.js';
import { detectImageInputType } from '../../utils/image-input-detector.js';
import * as output from '../../utils/output.js';
import { normalizeScreenshotOptions } from '../../utils/screenshot-options.js';

/**
 * Create a cloud screenshot handler for one run.
 *
 * Captures queue uploads without waiting for the API. Each capture keeps its
 * outcome so a rejection cannot disable later uploads or disappear after flush.
 * Flush pending uploads before cleanup, which clears the run's records.
 *
 * @param {Object} client - API client used to upload screenshots.
 * @param {Object} [options] - Upload dependencies.
 * @param {typeof defaultUploadScreenshot} [options.uploadScreenshot] - Uploader.
 * @returns {Object} Capture, count, flush, and cleanup methods for this run.
 */
export let createApiHandler = (
  client,
  { uploadScreenshot = defaultUploadScreenshot } = {}
) => {
  let captures = [];
  let uploadPromises = [];

  function recordFailure(capture, error) {
    capture.status = 'failed';
    capture.error = error.message;
    output.warn(
      `Screenshot "${capture.name}" failed to upload: ${error.message}`
    );
  }

  /**
   * Upload one capture and record its outcome, including SHA reuse.
   * API failures are recorded and logged rather than rejecting the background
   * promise, so flush can collect every outcome and later uploads can continue.
   */
  async function upload(
    capture,
    buildId,
    imageBuffer,
    properties,
    screenshotOptions
  ) {
    try {
      let result = await uploadScreenshot(
        client,
        buildId,
        capture.name,
        imageBuffer,
        properties ?? {},
        false,
        screenshotOptions
      );
      capture.status = result.skipped ? 'reused' : 'uploaded';
    } catch (error) {
      recordFailure(capture, error);
    }
  }

  /**
   * Read a capture and queue its cloud upload. Local input failures are included
   * in the run's failed count; HTTP 200 means queued, not uploaded successfully.
   *
   * @param {string} buildId - Cloud build receiving the screenshot.
   * @param {string} name - Stable screenshot name used for baseline matching.
   * @param {string} image - Base64 image data or a file path.
   * @param {Object} [properties={}] - Screenshot metadata.
   * @param {string} [type] - Base64 or file-path hint; otherwise detected.
   * @param {Object[]} [warnings=[]] - Warnings already collected by the router.
   * @param {Object} [screenshotOptions={}] - Capture and comparison options.
   * @returns {Promise<{statusCode: number, body: Object}>} Local HTTP response.
   */
  async function handleScreenshot(
    buildId,
    name,
    image,
    properties = {},
    type,
    warnings = [],
    screenshotOptions = {}
  ) {
    let normalizedOptions = normalizeScreenshotOptions({
      ...screenshotOptions,
      properties,
    });
    properties = normalizedOptions.properties;
    screenshotOptions = {
      ...screenshotOptions,
      threshold: normalizedOptions.threshold,
      minClusterSize: normalizedOptions.minClusterSize,
      fullPage: normalizedOptions.fullPage,
      captureMode: normalizedOptions.captureMode,
      deviceScaleFactor: normalizedOptions.deviceScaleFactor,
      selector: normalizedOptions.selector,
    };
    warnings = [...(warnings || []), ...normalizedOptions.warnings];
    let capture = { name, status: 'pending' };
    captures.push(capture);
    let inputType = ['base64', 'file-path'].includes(type)
      ? type
      : detectImageInputType(image);
    let imageBuffer;
    try {
      if (!client) throw new Error('API client not available');
      if (inputType === 'file-path') {
        let filePath = resolve(image.replace('file://', ''));
        try {
          imageBuffer = readFileSync(filePath);
        } catch (error) {
          throw new Error(
            error.code === 'ENOENT'
              ? `Screenshot file not found: ${filePath}`
              : `Failed to read screenshot file: ${error.message}`
          );
        }
      } else if (inputType === 'base64') {
        imageBuffer = Buffer.from(image, 'base64');
      } else {
        throw new Error(
          'Invalid image input: must be a file path or base64 encoded image data'
        );
      }
    } catch (error) {
      recordFailure(capture, error);
      return {
        statusCode: client ? 400 : 500,
        body: { success: false, name, error: error.message },
      };
    }

    uploadPromises.push(
      upload(capture, buildId, imageBuffer, properties, screenshotOptions)
    );
    return {
      statusCode: 200,
      body: {
        success: true,
        queued: true,
        name,
        count: captures.length,
        warnings,
      },
    };
  }

  /**
   * Wait for pending uploads, including captures queued while waiting.
   * Results cover the whole run and remain available across repeated flushes.
   * Uploaded and reused counts are separate; failed includes local input errors.
   *
   * @returns {Promise<Object>} Uploaded, reused, failed, and total counts, plus
   * failed captures as `failures: [{ name, error }]`.
   */
  async function flush() {
    let count;
    do {
      count = uploadPromises.length;
      await Promise.all(uploadPromises);
    } while (count !== uploadPromises.length);

    let uploaded = captures.filter(
      capture => capture.status === 'uploaded'
    ).length;
    let reused = captures.filter(capture => capture.status === 'reused').length;
    let failures = captures
      .filter(capture => capture.status === 'failed')
      .map(({ name, error }) => ({ name, error }));
    return {
      uploaded,
      reused,
      failed: failures.length,
      total: captures.length,
      failures,
    };
  }

  function cleanup() {
    captures = [];
    uploadPromises = [];
  }

  return {
    handleScreenshot,
    getScreenshotCount: () => captures.length,
    flush,
    cleanup,
  };
};
