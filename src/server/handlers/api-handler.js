import { Buffer } from 'buffer';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createServiceLogger } from '../../utils/logger-factory.js';
import { detectImageInputType } from '../../utils/image-input-detector.js';

const logger = createServiceLogger('API-HANDLER');

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

export const createApiHandler = apiService => {
  let vizzlyDisabled = false;
  let screenshotCount = 0;
  let uploadPromises = [];

  const handleScreenshot = async (buildId, name, image, properties = {}) => {
    if (vizzlyDisabled) {
      logger.debug(`Screenshot captured (Vizzly disabled): ${name}`);
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

    // buildId is optional - API service will handle it appropriately

    if (!apiService) {
      return {
        statusCode: 500,
        body: {
          error: 'API service not available',
        },
      };
    }

    // Support both base64 encoded images and file paths
    let imageBuffer;
    const inputType = detectImageInputType(image);

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
        logger.debug(`Loaded screenshot from file: ${filePath}`);
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

    // Fire upload in background - DON'T AWAIT!
    const uploadPromise = apiService
      .uploadScreenshot(buildId, name, imageBuffer, properties ?? {})
      .then(result => {
        if (result.skipped) {
          logger.debug(`Screenshot already exists, skipped: ${name}`);
        } else {
          logger.debug(`Screenshot uploaded: ${name}`);
        }
        return { success: true, name, result };
      })
      .catch(uploadError => {
        logger.error(
          `❌ Failed to upload screenshot ${name}:`,
          uploadError.message
        );
        vizzlyDisabled = true;
        const disabledMessage =
          '⚠️  Vizzly disabled due to upload error - continuing tests without visual testing';
        logger.warn(disabledMessage);
        return { success: false, name, error: uploadError };
      });

    // Collect promise for later flushing
    uploadPromises.push(uploadPromise);

    // Return immediately - test continues without waiting!
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
      logger.debug('No uploads to flush');
      return { uploaded: 0, failed: 0, total: 0 };
    }

    logger.debug(`Flushing ${uploadPromises.length} background uploads...`);
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

    logger.debug(
      `Upload flush complete: ${uploaded} uploaded, ${failed} failed`
    );

    // Clear promises array
    uploadPromises = [];

    return { uploaded, failed, total: results.length };
  };

  const cleanup = () => {
    vizzlyDisabled = false;
    screenshotCount = 0;
    uploadPromises = [];
    logger.debug('API handler cleanup completed');
  };

  return {
    handleScreenshot,
    getScreenshotCount,
    flush,
    cleanup,
  };
};
