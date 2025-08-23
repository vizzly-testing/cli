import { Buffer } from 'buffer';
import { createServiceLogger } from '../../utils/logger-factory.js';
import { TddService } from '../../services/tdd-service.js';
import { colors } from '../../utils/colors.js';

const logger = createServiceLogger('TDD-HANDLER');

export const createTddHandler = (
  config,
  workingDir,
  baselineBuild,
  baselineComparison
) => {
  const tddService = new TddService(config, workingDir);
  const builds = new Map();

  const initialize = async () => {
    logger.info('🔄 TDD mode enabled - setting up local comparison...');

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

    // Create unique screenshot name based on properties
    let uniqueName = name;
    const relevantProps = [];

    // Add browser to name if provided
    if (properties.browser) {
      relevantProps.push(properties.browser);
    }

    // Add viewport info if provided
    if (
      properties.viewport &&
      properties.viewport.width &&
      properties.viewport.height
    ) {
      relevantProps.push(
        `${properties.viewport.width}x${properties.viewport.height}`
      );
    }

    // Combine base name with relevant properties
    if (relevantProps.length > 0) {
      uniqueName = `${name}-${relevantProps.join('-')}`;
    }

    const screenshot = {
      name: uniqueName,
      originalName: name,
      imageData: image,
      properties,
      timestamp: Date.now(),
    };

    build.screenshots.push(screenshot);

    const imageBuffer = Buffer.from(image, 'base64');
    const comparison = await tddService.compareScreenshot(
      uniqueName,
      imageBuffer,
      properties
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
