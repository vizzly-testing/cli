import { Buffer as defaultBuffer } from 'node:buffer';
import {
  existsSync as defaultExistsSync,
  readFileSync as defaultReadFileSync,
  unlinkSync as defaultUnlinkSync,
  writeFileSync as defaultWriteFileSync,
} from 'node:fs';
import { join as defaultJoin, resolve as defaultResolve } from 'node:path';
import { getDimensionsSync as defaultGetDimensionsSync } from '@vizzly-testing/honeydiff';
import { TddService as DefaultTddService } from '../../tdd/tdd-service.js';
import { detectImageInputType as defaultDetectImageInputType } from '../../utils/image-input-detector.js';
import * as defaultOutput from '../../utils/output.js';
import {
  safePath as defaultSafePath,
  sanitizeScreenshotName as defaultSanitizeScreenshotName,
  validateScreenshotProperties as defaultValidateScreenshotProperties,
} from '../../utils/security.js';

/**
 * Unwrap double-nested properties if needed
 * Client SDK wraps options in properties field, so we may get { properties: { properties: {...} } }
 */
export const unwrapProperties = properties => {
  if (!properties) return {};
  if (properties.properties && typeof properties.properties === 'object') {
    // Merge top-level properties with nested properties
    let unwrapped = {
      ...properties,
      ...properties.properties,
    };
    // Remove the nested properties field to avoid confusion
    delete unwrapped.properties;
    return unwrapped;
  }
  return properties;
};

/**
 * Extract properties to top-level format matching cloud API
 * Normalizes viewport to viewport_width/height, ensures browser is set
 */
export const extractProperties = validatedProperties => {
  if (!validatedProperties) return {};
  return {
    ...validatedProperties,
    // Normalize viewport to top-level viewport_width/height (cloud format)
    viewport_width:
      validatedProperties.viewport?.width ??
      validatedProperties.viewport_width ??
      null,
    viewport_height:
      validatedProperties.viewport?.height ??
      validatedProperties.viewport_height ??
      null,
    browser: validatedProperties.browser ?? null,
    // Preserve nested structure in metadata for backward compatibility
    metadata: validatedProperties,
  };
};

/**
 * Convert absolute file paths to web-accessible URLs
 */
export const convertPathToUrl = (filePath, vizzlyDir) => {
  if (!filePath) return null;
  // Convert absolute path to relative path from .vizzly directory
  if (filePath.startsWith(vizzlyDir)) {
    let relativePath = filePath.substring(vizzlyDir.length + 1);
    return `/images/${relativePath}`;
  }
  return filePath;
};

/**
 * Group comparisons by screenshot name with variant structure
 * Matches cloud product's grouping logic from comparison.js
 */
export const groupComparisons = comparisons => {
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
  setBaseline = false,
  deps = {}
) => {
  // Inject dependencies with defaults
  let {
    TddService = DefaultTddService,
    existsSync = defaultExistsSync,
    readFileSync = defaultReadFileSync,
    unlinkSync = defaultUnlinkSync,
    writeFileSync = defaultWriteFileSync,
    join = defaultJoin,
    resolve = defaultResolve,
    Buffer = defaultBuffer,
    getDimensionsSync = defaultGetDimensionsSync,
    detectImageInputType = defaultDetectImageInputType,
    safePath = defaultSafePath,
    sanitizeScreenshotName = defaultSanitizeScreenshotName,
    validateScreenshotProperties = defaultValidateScreenshotProperties,
    output = defaultOutput,
  } = deps;

  const tddService = new TddService(config, workingDir, setBaseline);
  const reportPath = join(workingDir, '.vizzly', 'report-data.json');
  const detailsPath = join(workingDir, '.vizzly', 'comparison-details.json');

  /**
   * Read heavy comparison details from comparison-details.json
   * Returns a map of comparison ID -> heavy fields
   */
  const readComparisonDetails = () => {
    try {
      if (!existsSync(detailsPath)) return {};
      return JSON.parse(readFileSync(detailsPath, 'utf8'));
    } catch {
      return {};
    }
  };

  /**
   * Persist heavy fields for a comparison to comparison-details.json
   * This file is NOT watched by SSE, so writes here don't trigger broadcasts
   * Skips writing if all heavy fields are empty (passed comparisons)
   */
  const updateComparisonDetails = (id, heavyFields) => {
    let hasData = Object.values(heavyFields).some(
      v => v != null && (!Array.isArray(v) || v.length > 0)
    );
    if (!hasData) return;

    let details = readComparisonDetails();
    details[id] = heavyFields;
    writeFileSync(detailsPath, JSON.stringify(details));
  };

  /**
   * Remove a comparison's heavy fields from comparison-details.json
   */
  const removeComparisonDetails = id => {
    let details = readComparisonDetails();
    delete details[id];
    writeFileSync(detailsPath, JSON.stringify(details));
  };

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
      output.error('Failed to read report data:', error);
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
        const initialStatus =
          reportData.comparisons[existingIndex].initialStatus;
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

      // Update summary (groups computed client-side from comparisons)
      reportData.timestamp = Date.now();
      reportData.summary = {
        total: reportData.comparisons.length,
        passed: reportData.comparisons.filter(
          c =>
            c.status === 'passed' ||
            c.status === 'baseline-created' ||
            c.status === 'new'
        ).length,
        failed: reportData.comparisons.filter(c => c.status === 'failed')
          .length,
        rejected: reportData.comparisons.filter(c => c.status === 'rejected')
          .length,
        errors: reportData.comparisons.filter(c => c.status === 'error').length,
      };

      writeFileSync(reportPath, JSON.stringify(reportData));
    } catch (error) {
      output.error('Failed to update comparison:', error);
    }
  };

  const initialize = async () => {
    output.debug('tdd', 'initializing local mode');

    // In baseline update mode, skip all baseline loading/downloading
    if (setBaseline) {
      output.debug('tdd', 'baseline update mode');
      return;
    }

    // Check if we have baseline override flags that should force a fresh download
    const shouldForceDownload =
      (baselineBuild || baselineComparison) && config.apiKey;

    if (shouldForceDownload) {
      output.debug('tdd', 'downloading baselines');
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
        output.debug('tdd', 'downloading baselines');
        await tddService.downloadBaselines(
          config.build?.environment || 'test',
          config.build?.branch || null,
          baselineBuild,
          baselineComparison
        );
      } else {
        output.debug('tdd', 'no baselines yet');
      }
    } else {
      output.debug('tdd', `baseline: ${baseline.buildName}`);
    }
  };

  const handleScreenshot = async (
    _buildId,
    name,
    image,
    properties = {},
    type
  ) => {
    let handlerStart = Date.now();
    output.debug('tdd', `${name} received`);

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
    let unwrappedProperties = unwrapProperties(properties);

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

    // Extract ALL properties to top-level (matching cloud API behavior)
    const extractedProperties = extractProperties(validatedProperties);

    // Support both base64 encoded images and file paths
    // Vitest browser mode returns file paths, so we need to handle both
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
    const vizzlyDir = join(workingDir, '.vizzly');

    // Record the comparison for the dashboard
    // Only include lightweight fields in report-data.json (broadcast via SSE)
    const newComparison = {
      id: comparison.id,
      name: comparison.name,
      status: comparison.status,
      signature: comparison.signature,
      baseline: convertPathToUrl(comparison.baseline, vizzlyDir),
      current: convertPathToUrl(comparison.current, vizzlyDir),
      diff: convertPathToUrl(comparison.diff, vizzlyDir),
      properties: extractedProperties,
      threshold: comparison.threshold,
      minClusterSize: comparison.minClusterSize,
      diffPercentage: comparison.diffPercentage,
      diffCount: comparison.diffCount,
      reason: comparison.reason,
      totalPixels: comparison.totalPixels,
      aaPixelsIgnored: comparison.aaPixelsIgnored,
      aaPercentage: comparison.aaPercentage,
      heightDiff: comparison.heightDiff,
      error: comparison.error,
      originalName: name,
      timestamp: Date.now(),
      // Boolean hints so UI can show toggle buttons without fetching heavy data
      hasDiffClusters: comparison.diffClusters?.length > 0,
      hasConfirmedRegions: comparison.confirmedRegions?.length > 0,
    };

    // Update lightweight comparison in report-data.json (triggers SSE broadcast)
    updateComparison(newComparison);

    // Persist heavy fields separately (NOT broadcast via SSE)
    updateComparisonDetails(comparison.id, {
      diffClusters: comparison.diffClusters,
      intensityStats: comparison.intensityStats,
      boundingBox: comparison.boundingBox,
      regionAnalysis: comparison.regionAnalysis,
      hotspotAnalysis: comparison.hotspotAnalysis,
      confirmedRegions: comparison.confirmedRegions,
    });

    // Log screenshot event for menubar
    // Normalize status to match HTTP response ('failed' -> 'diff')
    let logStatus = comparison.status === 'failed' ? 'diff' : comparison.status;
    output.info(`Screenshot: ${sanitizedName}`, {
      screenshot: sanitizedName,
      status: logStatus,
      diffPercentage: comparison.diffPercentage || 0,
    });

    // Visual diffs return 200 with status: 'diff' - they're not errors
    // The SDK/user can decide whether to fail tests based on this
    if (comparison.status === 'failed') {
      return {
        statusCode: 200,
        body: {
          status: 'diff',
          name: comparison.name,
          message: `Visual difference detected for '${name}'`,
          baseline: comparison.baseline,
          current: comparison.current,
          diff: comparison.diff,
          diffPercentage: comparison.diffPercentage,
          threshold: comparison.threshold,
          tddMode: true,
        },
      };
    }

    if (comparison.status === 'baseline-updated') {
      return {
        statusCode: 200,
        body: {
          status: 'baseline-updated',
          name: comparison.name,
          message: `Baseline updated for '${name}'`,
          baseline: comparison.baseline,
          current: comparison.current,
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

    // Match or new baseline
    let handlerMs = Date.now() - handlerStart;
    output.debug('tdd', `${name} handler returning`, {
      ms: handlerMs,
      status: comparison.status,
    });

    return {
      statusCode: 200,
      body: {
        status: comparison.status === 'new' ? 'new' : 'match',
        name: comparison.name,
        baseline: comparison.baseline,
        current: comparison.current,
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

      // Log screenshot event for menubar
      output.info(`Screenshot: ${comparison.name}`, {
        screenshot: comparison.name,
        status: 'accepted',
        diffPercentage: 0,
      });
      return result;
    } catch (error) {
      output.error(`Failed to accept baseline for ${comparisonId}:`, error);
      throw error;
    }
  };

  const rejectBaseline = async comparisonId => {
    try {
      // Read current report data to get the comparison
      const reportData = readReportData();
      const comparison = reportData.comparisons.find(
        c => c.id === comparisonId
      );

      if (!comparison) {
        throw new Error(`Comparison not found with ID: ${comparisonId}`);
      }

      // Rejecting means: keep the current baseline, mark comparison as rejected
      // The user is saying "I don't want this change, the baseline is correct"
      // We update the status to 'rejected' so the UI shows the decision was made
      const updatedComparison = {
        ...comparison,
        status: 'rejected',
      };

      updateComparison(updatedComparison);

      // Log screenshot event for menubar
      output.info(`Screenshot: ${comparison.name}`, {
        screenshot: comparison.name,
        status: 'rejected',
        diffPercentage: comparison.diffPercentage || 0,
      });
      return { success: true, id: comparisonId };
    } catch (error) {
      output.error(`Failed to reject baseline for ${comparisonId}:`, error);
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
              const { unlinkSync } = await import('node:fs');
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
              const { unlinkSync } = await import('node:fs');
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
              const { unlinkSync } = await import('node:fs');
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
          const { unlinkSync } = await import('node:fs');
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
        summary: { total: 0, passed: 0, failed: 0, errors: 0 },
      };
      writeFileSync(reportPath, JSON.stringify(freshReportData));

      // Clear comparison details
      if (existsSync(detailsPath)) {
        writeFileSync(detailsPath, JSON.stringify({}));
      }

      output.info(
        `Baselines reset - ${deletedBaselines} baselines deleted, ${deletedCurrents} current screenshots deleted, ${deletedDiffs} diffs deleted`
      );
      return { success: true, deletedBaselines, deletedCurrents, deletedDiffs };
    } catch (error) {
      output.error('Failed to reset baselines:', error);
      throw error;
    }
  };

  /**
   * Safely delete a file within the .vizzly directory
   * @param {string} imagePath - Path like "/images/baselines/foo.png"
   * @param {string} label - Label for logging (e.g., "baseline", "current", "diff")
   * @param {string} name - Screenshot name for logging
   */
  const safeDeleteFile = (imagePath, label, name) => {
    if (!imagePath) return;

    try {
      // Use safePath to validate the path stays within workingDir
      const filePath = safePath(
        workingDir,
        '.vizzly',
        imagePath.replace('/images/', '')
      );

      if (existsSync(filePath)) {
        unlinkSync(filePath);
        output.debug(`Deleted ${label} for ${name}`);
      }
    } catch (error) {
      // safePath throws if path traversal is attempted
      output.warn(`Failed to delete ${label} for ${name}: ${error.message}`);
    }
  };

  const deleteComparison = async comparisonId => {
    const reportData = readReportData();
    const comparison = reportData.comparisons.find(c => c.id === comparisonId);

    if (!comparison) {
      const error = new Error(`Comparison not found with ID: ${comparisonId}`);
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Delete image files (safePath validates paths stay within workingDir)
    safeDeleteFile(comparison.baseline, 'baseline', comparison.name);
    safeDeleteFile(comparison.current, 'current', comparison.name);
    safeDeleteFile(comparison.diff, 'diff', comparison.name);

    // Remove from baseline metadata if it exists
    try {
      const metadataPath = safePath(
        workingDir,
        '.vizzly',
        'baselines',
        'metadata.json'
      );
      if (existsSync(metadataPath) && comparison.signature) {
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
        if (metadata.screenshots) {
          const originalLength = metadata.screenshots.length;
          metadata.screenshots = metadata.screenshots.filter(
            s => s.signature !== comparison.signature
          );
          if (metadata.screenshots.length < originalLength) {
            writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            output.debug(
              `Removed ${comparison.signature} from baseline metadata`
            );
          }
        }
      }
    } catch (error) {
      output.warn(`Failed to update baseline metadata: ${error.message}`);
    }

    // Remove heavy fields from comparison-details.json
    removeComparisonDetails(comparisonId);

    // Remove comparison from report data
    reportData.comparisons = reportData.comparisons.filter(
      c => c.id !== comparisonId
    );

    // Regenerate summary (groups computed client-side)
    reportData.timestamp = Date.now();
    reportData.summary = {
      total: reportData.comparisons.length,
      passed: reportData.comparisons.filter(
        c =>
          c.status === 'passed' ||
          c.status === 'baseline-created' ||
          c.status === 'new'
      ).length,
      failed: reportData.comparisons.filter(c => c.status === 'failed').length,
      rejected: reportData.comparisons.filter(c => c.status === 'rejected')
        .length,
      errors: reportData.comparisons.filter(c => c.status === 'error').length,
    };

    writeFileSync(reportPath, JSON.stringify(reportData));

    output.info(`Deleted comparison ${comparisonId} (${comparison.name})`);
    return { success: true, id: comparisonId };
  };

  const cleanup = () => {
    // Report data is persisted to file, no in-memory cleanup needed
  };

  return {
    initialize,
    handleScreenshot,
    getResults,
    acceptBaseline,
    rejectBaseline,
    acceptAllBaselines,
    resetBaselines,
    deleteComparison,
    cleanup,
    // Expose tddService for baseline download operations
    tddService,
  };
};
