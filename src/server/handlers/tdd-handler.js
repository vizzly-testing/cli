import { Buffer } from 'buffer';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createServiceLogger } from '../../utils/logger-factory.js';
import { TddService } from '../../services/tdd-service.js';
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
  const reportPath = join(workingDir, '.vizzly', 'report-data.json');

  const readReportData = () => {
    try {
      if (!existsSync(reportPath)) {
        return {
          timestamp: Date.now(),
          comparisons: [],
          summary: { total: 0, passed: 0, failed: 0, errors: 0 },
        };
      }
      const data = readFileSync(reportPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to read report data:', error);
      return {
        timestamp: Date.now(),
        comparisons: [],
        summary: { total: 0, passed: 0, failed: 0, errors: 0 },
      };
    }
  };

  const updateComparison = newComparison => {
    try {
      const reportData = readReportData();

      // Find existing comparison with same name and replace it, or add new one
      const existingIndex = reportData.comparisons.findIndex(
        c => c.name === newComparison.name
      );
      if (existingIndex >= 0) {
        reportData.comparisons[existingIndex] = newComparison;
        logger.debug(`Updated comparison for ${newComparison.name}`);
      } else {
        reportData.comparisons.push(newComparison);
        logger.debug(`Added new comparison for ${newComparison.name}`);
      }

      // Update summary
      reportData.timestamp = Date.now();
      reportData.summary = {
        total: reportData.comparisons.length,
        passed: reportData.comparisons.filter(
          c => c.status === 'passed' || c.status === 'baseline-created'
        ).length,
        failed: reportData.comparisons.filter(c => c.status === 'failed')
          .length,
        errors: reportData.comparisons.filter(c => c.status === 'error').length,
      };

      writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
      logger.debug('Report data saved to report-data.json');
    } catch (error) {
      logger.error('Failed to update comparison:', error);
    }
  };

  const initialize = async () => {
    logger.debug('TDD mode enabled - setting up local comparison');

    // In baseline update mode, skip all baseline loading/downloading
    if (setBaseline) {
      logger.debug(
        'Ready for new baseline creation - all screenshots will be treated as new baselines'
      );
      return;
    }

    // Check if we have baseline override flags that should force a fresh download
    const shouldForceDownload =
      (baselineBuild || baselineComparison) && config.apiKey;

    if (shouldForceDownload) {
      logger.debug(
        'Baseline override specified, downloading fresh baselines from Vizzly'
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
      // Only download baselines if explicitly requested via baseline flags
      if ((baselineBuild || baselineComparison) && config.apiKey) {
        logger.debug('No local baseline found, downloading from Vizzly');
        await tddService.downloadBaselines(
          config.build?.environment || 'test',
          config.build?.branch || null,
          baselineBuild,
          baselineComparison
        );
      } else {
        logger.debug(
          'No local baseline found - will create new baselines from first screenshots'
        );
      }
    } else {
      logger.debug(`Using existing baseline: ${baseline.buildName}`);
    }
  };

  const handleScreenshot = async (buildId, name, image, properties = {}) => {
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

    const imageBuffer = Buffer.from(image, 'base64');
    logger.debug(`Received screenshot: ${name} → unique: ${uniqueName}`);
    logger.debug(`Image size: ${imageBuffer.length} bytes`);
    logger.debug(`Properties: ${JSON.stringify(validatedProperties)}`);

    const comparison = await tddService.compareScreenshot(
      uniqueName,
      imageBuffer,
      validatedProperties
    );

    logger.debug(`Comparison result: ${comparison.status}`);

    // Convert absolute file paths to web-accessible URLs
    const convertPathToUrl = filePath => {
      if (!filePath) return null;
      // Convert absolute path to relative path from .vizzly directory
      const vizzlyDir = join(workingDir, '.vizzly');
      if (filePath.startsWith(vizzlyDir)) {
        const relativePath = filePath.substring(vizzlyDir.length + 1);
        return `/images/${relativePath}`;
      }
      return filePath;
    };

    // Record the comparison for the dashboard
    const newComparison = {
      name: comparison.name,
      originalName: name,
      status: comparison.status,
      baseline: convertPathToUrl(comparison.baseline),
      current: convertPathToUrl(comparison.current),
      diff: convertPathToUrl(comparison.diff),
      diffPercentage: comparison.diffPercentage,
      threshold: comparison.threshold,
      properties: validatedProperties,
      timestamp: Date.now(),
    };

    // Update comparison in report data file
    updateComparison(newComparison);

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

  const getResults = async () => {
    return await tddService.printResults();
  };

  const acceptBaseline = async screenshotName => {
    try {
      logger.debug(`Accepting baseline for screenshot: ${screenshotName}`);

      // Use TDD service to accept the baseline
      const result = await tddService.acceptBaseline(screenshotName);

      // Read current report data and update the comparison status
      const reportData = readReportData();
      const comparison = reportData.comparisons.find(
        c => c.name === screenshotName
      );

      if (comparison) {
        // Update the comparison to passed status
        const updatedComparison = {
          ...comparison,
          status: 'passed',
          diffPercentage: 0,
          diff: null,
        };

        updateComparison(updatedComparison);
        logger.debug('Comparison updated in report-data.json');
      } else {
        logger.error(
          `Comparison not found in report data for: ${screenshotName}`
        );
      }

      logger.info(`Baseline accepted for ${screenshotName}`);
      return result;
    } catch (error) {
      logger.error(`Failed to accept baseline for ${screenshotName}:`, error);
      throw error;
    }
  };

  const acceptAllBaselines = async () => {
    try {
      logger.debug('Accepting all baselines');

      const reportData = readReportData();
      let acceptedCount = 0;

      // Accept all failed or new comparisons
      for (const comparison of reportData.comparisons) {
        if (comparison.status === 'failed' || comparison.status === 'new') {
          await tddService.acceptBaseline(comparison.name);

          // Update the comparison to passed status
          updateComparison({
            ...comparison,
            status: 'passed',
            diffPercentage: 0,
            diff: null,
          });

          acceptedCount++;
        }
      }

      logger.info(`Accepted ${acceptedCount} baselines`);
      return { count: acceptedCount };
    } catch (error) {
      logger.error('Failed to accept all baselines:', error);
      throw error;
    }
  };

  const resetBaselines = async () => {
    try {
      logger.debug('Resetting baselines');

      // Reset by clearing current screenshots and reverting report data
      const reportData = readReportData();

      // Reset all comparisons to their original state
      for (const comparison of reportData.comparisons) {
        if (comparison.status === 'passed') {
          // Keep passed comparisons
          continue;
        }

        // For failed/new comparisons, we need to restore from baseline
        updateComparison({
          ...comparison,
          status: 'new', // Mark as new to re-run comparison
        });
      }

      logger.info('Baselines reset');
      return { success: true };
    } catch (error) {
      logger.error('Failed to reset baselines:', error);
      throw error;
    }
  };

  const cleanup = () => {
    // Report data is persisted to file, no in-memory cleanup needed
    logger.debug('TDD handler cleanup completed');
  };

  return {
    initialize,
    handleScreenshot,
    getResults,
    acceptBaseline,
    acceptAllBaselines,
    resetBaselines,
    cleanup,
  };
};
