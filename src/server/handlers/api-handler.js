import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { uploadScreenshot as defaultUploadScreenshot } from '../../api/index.js';
import { detectImageInputType } from '../../utils/image-input-detector.js';
import * as output from '../../utils/output.js';

/**
 * API Handler - Non-blocking screenshot upload
 *
 * Flow:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Test Suite                                                  │
 * │   ↓ vizzlyScreenshot()                                      │
 * │   ↓ HTTP POST to localhost                                 │
 * │   ↓                                                         │
 * │ Screenshot Server                                           │
 * │   ↓ handleScreenshot()                                      │
 * │   ├─→ Convert base64 to Buffer                             │
 * │   ├─→ Fire upload promise (NO AWAIT) ─────┐                │
 * │   └─→ Return 200 immediately              │                │
 * │                                             │                │
 * │ Test continues (NO BLOCKING) ✓             │                │
 * │                                             ↓                │
 * │                                   Background Upload         │
 * │                                   (to Vizzly API)           │
 * │                                             ↓                │
 * │                                   Promise resolves/rejects  │
 * │                                                             │
 * │ Build Finalization                                          │
 * │   ↓ flush()                                                 │
 * │   └─→ await Promise.allSettled(uploadPromises)             │
 * │        ↓                                                    │
 * │      All uploads complete ✓                                │
 * └─────────────────────────────────────────────────────────────┘
 */

/**
 * Create an API handler for screenshot uploads.
 * @param {Object} client - API client with request method
 * @param {Object} options - Optional dependencies for testing
 * @param {Function} options.uploadScreenshot - Upload function (defaults to API uploadScreenshot)
 */
export const createApiHandler = (
  client,
  { uploadScreenshot = defaultUploadScreenshot } = {}
) => {
  let vizzlyDisabled = false;
  let screenshotCount = 0;
  let uploadPromises = [];

  const handleScreenshot = async (
    buildId,
    name,
    image,
    properties = {},
    type
  ) => {
    let handlerStart = Date.now();
    output.debug('upload', `${name} received`, { buildId: buildId?.slice(0, 8) });

    if (vizzlyDisabled) {
      output.debug('upload', `${name} (disabled)`);
      return {
        statusCode: 200,
        body: {
          success: true,
          disabled: true,
          count: ++screenshotCount,
          message: `Vizzly disabled - ${screenshotCount} screenshots captured but not uploaded`,
        },
      };
    }

    // buildId is optional - API will handle it appropriately

    if (!client) {
      return {
        statusCode: 500,
        body: {
          error: 'API client not available',
        },
      };
    }

    // Support both base64 encoded images and file paths
    // Use explicit type from client if provided (fast path), otherwise detect (slow path)
    // Only accept valid type values to prevent invalid types from bypassing detection
    let imageBuffer;
    let validTypes = ['base64', 'file-path'];
    const inputType =
      type && validTypes.includes(type) ? type : detectImageInputType(image);

    if (inputType === 'file-path') {
      // It's a file path - resolve and read the file
      const filePath = resolve(image.replace('file://', ''));

      if (!existsSync(filePath)) {
        return {
          statusCode: 400,
          body: {
            error: `Screenshot file not found: ${filePath}`,
            originalPath: image,
          },
        };
      }

      try {
        imageBuffer = readFileSync(filePath);
      } catch (error) {
        return {
          statusCode: 500,
          body: {
            error: `Failed to read screenshot file: ${error.message}`,
            filePath,
          },
        };
      }
    } else if (inputType === 'base64') {
      // It's base64 encoded
      try {
        imageBuffer = Buffer.from(image, 'base64');
      } catch (error) {
        return {
          statusCode: 400,
          body: {
            error: `Invalid base64 image data: ${error.message}`,
          },
        };
      }
    } else {
      // Unknown input type
      return {
        statusCode: 400,
        body: {
          error:
            'Invalid image input: must be a file path or base64 encoded image data',
          receivedType: typeof image,
        },
      };
    }
    screenshotCount++;
    let uploadStart = Date.now();

    // Fire upload in background - DON'T AWAIT!
    let uploadPromise = uploadScreenshot(
      client,
      buildId,
      name,
      imageBuffer,
      properties ?? {}
    )
      .then(result => {
        let duration = Date.now() - uploadStart;
        if (!result.skipped) {
          output.debug('upload', `${name} completed`, { ms: duration });
        } else {
          output.debug('upload', `${name} skipped (dedup)`, { ms: duration });
        }
        return { success: true, name, result, duration };
      })
      .catch(uploadError => {
        let duration = Date.now() - uploadStart;
        output.debug('upload', `${name} failed`, {
          error: uploadError.message,
          ms: duration,
        });
        vizzlyDisabled = true;
        output.warn(
          'Vizzly disabled due to upload error - continuing tests without visual testing'
        );
        return { success: false, name, error: uploadError, duration };
      });

    // Collect promise for later flushing
    uploadPromises.push(uploadPromise);

    // Return immediately - test continues without waiting!
    let handlerMs = Date.now() - handlerStart;
    output.debug('upload', `${name} handler returning`, { ms: handlerMs });

    return {
      statusCode: 200,
      body: {
        success: true,
        name,
        count: screenshotCount,
      },
    };
  };

  const getScreenshotCount = () => screenshotCount;

  /**
   * Wait for all background uploads to complete
   * Call this before build finalization to ensure all uploads finish
   */
  const flush = async () => {
    if (uploadPromises.length === 0) {
      return { uploaded: 0, failed: 0, total: 0 };
    }

    output.debug('upload', `flushing ${uploadPromises.length} uploads`);
    const results = await Promise.allSettled(uploadPromises);

    let uploaded = 0;
    let failed = 0;

    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.success) {
        uploaded++;
      } else {
        failed++;
      }
    });

    output.debug('upload', 'flush complete', { uploaded, failed });

    // Clear promises array
    uploadPromises = [];

    return { uploaded, failed, total: results.length };
  };

  const cleanup = () => {
    vizzlyDisabled = false;
    screenshotCount = 0;
    uploadPromises = [];
    // Silent cleanup
  };

  return {
    handleScreenshot,
    getScreenshotCount,
    flush,
    cleanup,
  };
};
