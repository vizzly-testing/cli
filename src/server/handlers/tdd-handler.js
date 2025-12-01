import { Buffer } from 'buffer';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import honeydiff from '@vizzly-testing/honeydiff';
import * as output from '../../utils/output.js';
import { TddService } from '../../services/tdd-service.js';
import {
  sanitizeScreenshotName,
  validateScreenshotProperties,
} from '../../utils/security.js';
import { detectImageInputType } from '../../utils/image-input-detector.js';

let { getDimensionsSync } = honeydiff;

/**
 * Group comparisons by screenshot name with variant structure
 * Matches cloud product's grouping logic from comparison.js
 */
const groupComparisons = comparisons => {
  const groups = new Map();

  // Group by screenshot name
  for (const comp of comparisons) {
    if (!groups.has(comp.name)) {
      groups.set(comp.name, {
        name: comp.name,
        comparisons: [],
        browsers: new Set(),
        viewports: new Set(),
        devices: new Set(),
        totalVariants: 0,
      });
    }

    const group = groups.get(comp.name);
    group.comparisons.push(comp);
    group.totalVariants++;

    // Track unique browsers, viewports, devices
    if (comp.properties?.browser) {
      group.browsers.add(comp.properties.browser);
    }
    if (comp.properties?.viewport_width && comp.properties?.viewport_height) {
      group.viewports.add(
        `${comp.properties.viewport_width}x${comp.properties.viewport_height}`
      );
    }
    if (comp.properties?.device) {
      group.devices.add(comp.properties.device);
    }
  }

  // Convert to final structure
  return Array.from(groups.values())
    .map(group => {
      const browsers = Array.from(group.browsers);
      const viewports = Array.from(group.viewports);
      const devices = Array.from(group.devices);

      // Build variants structure (browser -> viewport -> comparisons)
      const variants = {};
      group.comparisons.forEach(comp => {
        const browser = comp.properties?.browser || null;
        const viewport =
          comp.properties?.viewport_width && comp.properties?.viewport_height
            ? `${comp.properties.viewport_width}x${comp.properties.viewport_height}`
            : null;

        if (!variants[browser]) variants[browser] = {};
        if (!variants[browser][viewport]) variants[browser][viewport] = [];
        variants[browser][viewport].push(comp);
      });

      // Determine grouping strategy
      let groupingStrategy = 'flat';
      if (browsers.length > 1) groupingStrategy = 'browser';
      else if (viewports.length > 1) groupingStrategy = 'viewport';

      // Sort comparisons by viewport area (largest first)
      group.comparisons.sort((a, b) => {
        const aArea =
          (a.properties?.viewport_width || 0) *
          (a.properties?.viewport_height || 0);
        const bArea =
          (b.properties?.viewport_width || 0) *
          (b.properties?.viewport_height || 0);
        if (bArea !== aArea) return bArea - aArea;
        return (
          (b.properties?.viewport_width || 0) -
          (a.properties?.viewport_width || 0)
        );
      });

      return {
        ...group,
        browsers,
        viewports,
        devices: Array.from(devices),
        variants,
        groupingStrategy,
      };
    })
    .sort((a, b) => {
      // Sort groups: multi-variant first (by variant count), then singles alphabetically
      if (a.totalVariants > 1 && b.totalVariants === 1) return -1;
      if (a.totalVariants === 1 && b.totalVariants > 1) return 1;
      if (a.totalVariants > 1 && b.totalVariants > 1) {
        return b.totalVariants - a.totalVariants;
      }
      return a.name.localeCompare(b.name);
    });
};

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
          comparisons: [], // Internal flat list for easy updates
          groups: [], // Grouped structure for UI
          summary: { total: 0, groups: 0, passed: 0, failed: 0, errors: 0 },
        };
      }
      const data = readFileSync(reportPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      output.error('Failed to read report data:', error);
      return {
        timestamp: Date.now(),
        comparisons: [],
        groups: [],
        summary: { total: 0, groups: 0, passed: 0, failed: 0, errors: 0 },
      };
    }
  };

  const updateComparison = newComparison => {
    try {
      const reportData = readReportData();

      // Ensure comparisons array exists (backward compatibility)
      if (!reportData.comparisons) {
        reportData.comparisons = [];
      }

      // Find existing comparison by unique ID
      // This ensures we update the correct variant even with same name
      const existingIndex = reportData.comparisons.findIndex(
        c => c.id === newComparison.id
      );

      if (existingIndex >= 0) {
        // Preserve initialStatus from the original comparison
        // This keeps sort order stable when status changes (e.g., after approval)
        let initialStatus = reportData.comparisons[existingIndex].initialStatus;
        reportData.comparisons[existingIndex] = {
          ...newComparison,
          initialStatus: initialStatus || newComparison.status,
        };
      } else {
        // New comparison - set initialStatus to current status
        reportData.comparisons.push({
          ...newComparison,
          initialStatus: newComparison.status,
        });
      }

      // Generate grouped structure from flat comparisons
      reportData.groups = groupComparisons(reportData.comparisons);

      // Update summary
      reportData.timestamp = Date.now();
      reportData.summary = {
        total: reportData.comparisons.length,
        groups: reportData.groups.length,
        passed: reportData.comparisons.filter(
          c =>
            c.status === 'passed' ||
            c.status === 'baseline-created' ||
            c.status === 'new'
        ).length,
        failed: reportData.comparisons.filter(c => c.status === 'failed')
          .length,
        errors: reportData.comparisons.filter(c => c.status === 'error').length,
      };

      writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
    } catch (error) {
      output.error('Failed to update comparison:', error);
    }
  };

  const initialize = async () => {
    output.debug('tdd', 'setting up local comparison');

    // In baseline update mode, skip all baseline loading/downloading
    if (setBaseline) {
      output.debug('tdd', 'baseline update mode');
      return;
    }

    // Check if we have baseline override flags that should force a fresh download
    const shouldForceDownload =
      (baselineBuild || baselineComparison) && config.apiKey;

    if (shouldForceDownload) {
      output.debug('tdd', 'downloading baselines from cloud');
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
        output.debug('tdd', 'downloading baselines from cloud');
        await tddService.downloadBaselines(
          config.build?.environment || 'test',
          config.build?.branch || null,
          baselineBuild,
          baselineComparison
        );
      } else {
        output.debug('tdd', 'no baselines found, will create on first run');
      }
    } else {
      output.debug('tdd', `using baseline: ${baseline.buildName}`);
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

    // Unwrap double-nested properties if needed (client SDK wraps options in properties field)
    // This happens when test helper passes { properties: {...}, threshold: 0.1 }
    // and client SDK wraps it as { properties: options }
    let unwrappedProperties = properties;
    if (properties.properties && typeof properties.properties === 'object') {
      // Merge top-level properties with nested properties
      unwrappedProperties = {
        ...properties,
        ...properties.properties,
      };
      // Remove the nested properties field to avoid confusion
      delete unwrappedProperties.properties;
    }

    // Validate and sanitize properties
    let validatedProperties;
    try {
      validatedProperties = validateScreenshotProperties(unwrappedProperties);
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

    // Extract viewport/browser to top-level properties (matching cloud API behavior)
    // This ensures signature generation works correctly with: name|viewport_width|browser
    const extractedProperties = {
      viewport_width: validatedProperties.viewport?.width || null,
      viewport_height: validatedProperties.viewport?.height || null,
      browser: validatedProperties.browser || null,
      device: validatedProperties.device || null,
      url: validatedProperties.url || null,
      selector: validatedProperties.selector || null,
      threshold: validatedProperties.threshold,
      // Preserve full nested structure in metadata for compatibility
      metadata: validatedProperties,
    };

    // Support both base64 encoded images and file paths
    // Vitest browser mode returns file paths, so we need to handle both
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
            tddMode: true,
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
            tddMode: true,
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
            tddMode: true,
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
          tddMode: true,
        },
      };
    }

    // Auto-detect image dimensions if viewport not provided
    if (
      !extractedProperties.viewport_width ||
      !extractedProperties.viewport_height
    ) {
      try {
        const dimensions = getDimensionsSync(imageBuffer);
        if (!extractedProperties.viewport_width) {
          extractedProperties.viewport_width = dimensions.width;
        }
        if (!extractedProperties.viewport_height) {
          extractedProperties.viewport_height = dimensions.height;
        }
      } catch {
        // Dimensions will use defaults
      }
    }

    // Use the sanitized name as-is (no modification with browser/viewport)
    // Baseline matching uses signature logic (name + viewport_width + browser)
    const comparison = await tddService.compareScreenshot(
      sanitizedName,
      imageBuffer,
      extractedProperties
    );

    // Comparison tracked by tdd.js event handler

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
      id: comparison.id, // Include unique ID for variant identification
      name: comparison.name,
      originalName: name,
      status: comparison.status,
      baseline: convertPathToUrl(comparison.baseline),
      current: convertPathToUrl(comparison.current),
      diff: convertPathToUrl(comparison.diff),
      diffPercentage: comparison.diffPercentage,
      threshold: comparison.threshold,
      properties: extractedProperties, // Use extracted properties with top-level viewport_width/browser
      signature: comparison.signature, // Include signature for debugging
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

    // Debug output handled by tdd.js event handler
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

  const acceptBaseline = async comparisonId => {
    try {
      // Read current report data to get the comparison
      const reportData = readReportData();
      const comparison = reportData.comparisons.find(
        c => c.id === comparisonId
      );

      if (!comparison) {
        throw new Error(`Comparison not found with ID: ${comparisonId}`);
      }

      // Pass the comparison object to tddService instead of just the ID
      const result = await tddService.acceptBaseline(comparison);

      // Update the comparison to passed status
      const updatedComparison = {
        ...comparison,
        status: 'passed',
        diffPercentage: 0,
        diff: null,
      };

      updateComparison(updatedComparison);

      output.info(`Baseline accepted for comparison ${comparisonId}`);
      return result;
    } catch (error) {
      output.error(`Failed to accept baseline for ${comparisonId}:`, error);
      throw error;
    }
  };

  const acceptAllBaselines = async () => {
    try {
      output.debug('tdd', 'accepting all baselines');

      const reportData = readReportData();
      let acceptedCount = 0;

      // Accept all failed or new comparisons
      for (const comparison of reportData.comparisons) {
        if (comparison.status === 'failed' || comparison.status === 'new') {
          // Pass the comparison object directly instead of just the ID
          // This allows tddService to work with comparisons from report-data.json
          await tddService.acceptBaseline(comparison);

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

      output.info(`Accepted ${acceptedCount} baselines`);
      return { count: acceptedCount };
    } catch (error) {
      output.error('Failed to accept all baselines:', error);
      throw error;
    }
  };

  const resetBaselines = async () => {
    try {
      output.debug('tdd', 'resetting baselines');

      const reportData = readReportData();
      let deletedBaselines = 0;
      let deletedCurrents = 0;
      let deletedDiffs = 0;

      // Delete all baseline, current, and diff images
      for (const comparison of reportData.comparisons) {
        // Delete baseline image if it exists
        if (comparison.baseline) {
          const baselinePath = join(
            workingDir,
            '.vizzly',
            comparison.baseline.replace('/images/', '')
          );
          if (existsSync(baselinePath)) {
            try {
              const { unlinkSync } = await import('fs');
              unlinkSync(baselinePath);
              deletedBaselines++;
              // Silent deletion
            } catch (error) {
              output.warn(
                `Failed to delete baseline for ${comparison.name}: ${error.message}`
              );
            }
          }
        }

        // Delete current screenshot if it exists
        if (comparison.current) {
          const currentPath = join(
            workingDir,
            '.vizzly',
            comparison.current.replace('/images/', '')
          );
          if (existsSync(currentPath)) {
            try {
              const { unlinkSync } = await import('fs');
              unlinkSync(currentPath);
              deletedCurrents++;
              // Silent deletion
            } catch (error) {
              output.warn(
                `Failed to delete current screenshot for ${comparison.name}: ${error.message}`
              );
            }
          }
        }

        // Delete diff image if it exists
        if (comparison.diff) {
          const diffPath = join(
            workingDir,
            '.vizzly',
            comparison.diff.replace('/images/', '')
          );
          if (existsSync(diffPath)) {
            try {
              const { unlinkSync } = await import('fs');
              unlinkSync(diffPath);
              deletedDiffs++;
              output.debug(`Deleted diff for ${comparison.name}`);
            } catch (error) {
              output.warn(
                `Failed to delete diff for ${comparison.name}: ${error.message}`
              );
            }
          }
        }
      }

      // Delete baseline metadata
      const metadataPath = join(
        workingDir,
        '.vizzly',
        'baselines',
        'metadata.json'
      );
      if (existsSync(metadataPath)) {
        try {
          const { unlinkSync } = await import('fs');
          unlinkSync(metadataPath);
          output.debug('Deleted baseline metadata');
        } catch (error) {
          output.warn(`Failed to delete baseline metadata: ${error.message}`);
        }
      }

      // Clear the report data entirely - fresh start
      const freshReportData = {
        timestamp: Date.now(),
        comparisons: [],
        groups: [],
        summary: { total: 0, groups: 0, passed: 0, failed: 0, errors: 0 },
      };
      writeFileSync(reportPath, JSON.stringify(freshReportData, null, 2));

      output.info(
        `Baselines reset - ${deletedBaselines} baselines deleted, ${deletedCurrents} current screenshots deleted, ${deletedDiffs} diffs deleted`
      );
      return { success: true, deletedBaselines, deletedCurrents, deletedDiffs };
    } catch (error) {
      output.error('Failed to reset baselines:', error);
      throw error;
    }
  };

  const cleanup = () => {
    // Report data is persisted to file, no in-memory cleanup needed
  };

  return {
    initialize,
    handleScreenshot,
    getResults,
    acceptBaseline,
    acceptAllBaselines,
    resetBaselines,
    cleanup,
    // Expose tddService for baseline download operations
    tddService,
  };
};
