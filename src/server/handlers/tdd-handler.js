import { Buffer } from 'buffer';
import { createServiceLogger } from '../../utils/logger-factory.js';
import { TddService } from '../../services/tdd-service.js';
import { colors } from '../../utils/colors.js';
import {
  sanitizeScreenshotName,
  validateScreenshotProperties,
} from '../../utils/security.js';

const logger = createServiceLogger('TDD-HANDLER');

export const createTddHandler = (
  config,
  workingDir,
  baselineBuild,
  baselineComparison,
  setBaseline = false
) => {
  const tddService = new TddService(config, workingDir, setBaseline);
  const builds = new Map();

  const initialize = async () => {
    logger.info('🔄 TDD mode enabled - setting up local comparison...');

    // In baseline update mode, skip all baseline loading/downloading
    if (setBaseline) {
      logger.info(
        '📁 Ready for new baseline creation - all screenshots will be treated as new baselines'
      );
      return;
    }

    // Check if we have baseline override flags that should force a fresh download
    const shouldForceDownload =
      (baselineBuild || baselineComparison) && config.apiKey;

    if (shouldForceDownload) {
      logger.info(
        '📥 Baseline override specified, downloading fresh baselines from Vizzly...'
      );
      await tddService.downloadBaselines(
        config.build?.environment || 'test',
        config.build?.branch || null,
        baselineBuild,
        baselineComparison
      );
      return;
    }

    const baseline = await tddService.loadBaseline();

    if (!baseline) {
      if (config.apiKey) {
        logger.info('📥 No local baseline found, downloading from Vizzly...');
        await tddService.downloadBaselines(
          config.build?.environment || 'test',
          config.build?.branch || null,
          baselineBuild,
          baselineComparison
        );
      } else {
        logger.info(
          '📝 No local baseline found and no API token - all screenshots will be marked as new'
        );
      }
    } else {
      logger.info(
        `✅ Using existing baseline: ${colors.cyan(baseline.buildName)}`
      );
    }
  };

  const registerBuild = buildId => {
    builds.set(buildId, {
      id: buildId,
      name: `TDD Build ${buildId}`,
      branch: 'current',
      environment: 'test',
      screenshots: [],
      createdAt: Date.now(),
    });
    logger.debug(`Registered TDD build: ${buildId}`);
  };

  const handleScreenshot = async (buildId, name, image, properties = {}) => {
    const build = builds.get(buildId);
    if (!build) {
      throw new Error(`Build ${buildId} not found`);
    }

    // Validate and sanitize screenshot name
    let sanitizedName;
    try {
      sanitizedName = sanitizeScreenshotName(name);
    } catch (error) {
      return {
        statusCode: 400,
        body: {
          error: 'Invalid screenshot name',
          details: error.message,
          tddMode: true,
        },
      };
    }

    // Validate and sanitize properties
    let validatedProperties;
    try {
      validatedProperties = validateScreenshotProperties(properties);
    } catch (error) {
      return {
        statusCode: 400,
        body: {
          error: 'Invalid screenshot properties',
          details: error.message,
          tddMode: true,
        },
      };
    }

    // Create unique screenshot name based on properties
    let uniqueName = sanitizedName;
    const relevantProps = [];

    // Add browser to name if provided (already validated)
    if (validatedProperties.browser) {
      relevantProps.push(validatedProperties.browser);
    }

    // Add viewport info if provided (already validated)
    if (
      validatedProperties.viewport &&
      validatedProperties.viewport.width &&
      validatedProperties.viewport.height
    ) {
      relevantProps.push(
        `${validatedProperties.viewport.width}x${validatedProperties.viewport.height}`
      );
    }

    // Combine base name with relevant properties and sanitize the result
    if (relevantProps.length > 0) {
      let proposedUniqueName = `${sanitizedName}-${relevantProps.join('-')}`;
      try {
        uniqueName = sanitizeScreenshotName(proposedUniqueName);
      } catch (error) {
        // If the combined name is invalid, fall back to the base sanitized name
        uniqueName = sanitizedName;
        logger.warn(
          `Combined screenshot name invalid (${error.message}), using base name: ${uniqueName}`
        );
      }
    }

    const screenshot = {
      name: uniqueName,
      originalName: name,
      imageData: image,
      properties: validatedProperties,
      timestamp: Date.now(),
    };

    build.screenshots.push(screenshot);

    const imageBuffer = Buffer.from(image, 'base64');
    const comparison = await tddService.compareScreenshot(
      uniqueName,
      imageBuffer,
      validatedProperties
    );

    if (comparison.status === 'failed') {
      return {
        statusCode: 422,
        body: {
          error: 'Visual difference detected',
          details: `Screenshot '${name}' differs from baseline`,
          comparison: {
            name: comparison.name,
            status: comparison.status,
            baseline: comparison.baseline,
            current: comparison.current,
            diff: comparison.diff,
            diffPercentage: comparison.diffPercentage,
            threshold: comparison.threshold,
          },
          tddMode: true,
        },
      };
    }

    if (comparison.status === 'baseline-updated') {
      return {
        statusCode: 200,
        body: {
          status: 'success',
          message: `Baseline updated for ${name}`,
          comparison: {
            name: comparison.name,
            status: comparison.status,
            baseline: comparison.baseline,
            current: comparison.current,
          },
          tddMode: true,
        },
      };
    }

    if (comparison.status === 'error') {
      return {
        statusCode: 500,
        body: {
          error: `Comparison failed: ${comparison.error}`,
          tddMode: true,
        },
      };
    }

    logger.debug(`✅ TDD: ${comparison.status.toUpperCase()} ${name}`);
    return {
      statusCode: 200,
      body: {
        success: true,
        comparison: {
          name: comparison.name,
          status: comparison.status,
        },
        tddMode: true,
      },
    };
  };

  const getScreenshotCount = buildId => {
    const build = builds.get(buildId);
    return build ? build.screenshots.length : 0;
  };

  const finishBuild = async buildId => {
    const build = builds.get(buildId);
    if (!build) {
      throw new Error(`Build ${buildId} not found`);
    }

    if (build.screenshots.length === 0) {
      throw new Error(
        'No screenshots to process. Make sure your tests are calling the Vizzly screenshot function.'
      );
    }

    const results = await tddService.printResults();
    builds.delete(buildId);

    return {
      id: buildId,
      name: build.name,
      tddMode: true,
      results,
      url: null,
      passed: results.failed === 0 && results.errors === 0,
    };
  };

  const cleanup = () => {
    builds.clear();
    logger.debug('TDD handler cleanup completed');
  };

  return {
    initialize,
    registerBuild,
    handleScreenshot,
    getScreenshotCount,
    finishBuild,
    cleanup,
  };
};
