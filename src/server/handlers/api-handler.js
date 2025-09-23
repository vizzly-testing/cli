import { Buffer } from 'buffer';
import { createServiceLogger } from '../../utils/logger-factory.js';

const logger = createServiceLogger('API-HANDLER');

export const createApiHandler = apiService => {
  let vizzlyDisabled = false;
  let screenshotCount = 0;

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

    try {
      const imageBuffer = Buffer.from(image, 'base64');
      const result = await apiService.uploadScreenshot(
        buildId,
        name,
        imageBuffer,
        properties ?? {}
      );

      if (result.skipped) {
        logger.debug(`Screenshot already exists, skipped: ${name}`);
      } else {
        logger.debug(`Screenshot uploaded: ${name}`);
      }

      if (!result.skipped) {
        screenshotCount++;
      }

      return {
        statusCode: 200,
        body: {
          success: true,
          name,
          skipped: result.skipped,
          count: screenshotCount,
        },
      };
    } catch (uploadError) {
      logger.error(
        `❌ Failed to upload screenshot ${name}:`,
        uploadError.message
      );

      vizzlyDisabled = true;
      const disabledMessage =
        '⚠️  Vizzly disabled due to upload error - continuing tests without visual testing';
      logger.warn(disabledMessage);

      return {
        statusCode: 200,
        body: {
          success: true,
          name,
          disabled: true,
          message: disabledMessage,
        },
      };
    }
  };

  const getScreenshotCount = () => screenshotCount;

  const cleanup = () => {
    vizzlyDisabled = false;
    screenshotCount = 0;
    logger.debug('API handler cleanup completed');
  };

  return {
    handleScreenshot,
    getScreenshotCount,
    cleanup,
  };
};
