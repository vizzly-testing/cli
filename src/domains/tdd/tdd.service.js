/**
 * TDD Service - Local Visual Testing
 *
 * Orchestrates visual testing by composing the extracted modules.
 * This is a thin orchestration layer - most logic lives in the modules.
 *
 * CRITICAL: Signature/filename generation MUST stay in sync with the cloud!
 * See src/domains/screenshots/screenshot-identity.js for details.
 */

import {
  existsSync as defaultExistsSync,
  mkdirSync as defaultMkdirSync,
  readFileSync as defaultReadFileSync,
  writeFileSync as defaultWriteFileSync,
} from 'node:fs';
import { compareSync } from '@vizzly-testing/honeydiff';
import { VizzlyError } from '../../errors/vizzly-error.js';
import { colors as defaultColors } from '../../services/colors.js';
import { fetchWithTimeout as defaultFetchWithTimeout } from '../../services/fetch-utils.js';
import { getDefaultBranch as defaultGetDefaultBranch } from '../../services/git.js';
import * as defaultOutput from '../../services/output.js';
import {
  safePath as defaultSafePath,
  validatePathSecurity as defaultValidatePathSecurity,
} from '../../services/paths.js';
import { createApiClient as defaultCreateApiClient } from '../auth/cloud-client.js';
import {
  baselineExists as defaultBaselineExists,
  clearBaselineData as defaultClearBaselineData,
  clearRunData as defaultClearRunData,
  getBaselinePath as defaultGetBaselinePath,
  getCurrentPath as defaultGetCurrentPath,
  getDiffPath as defaultGetDiffPath,
  initializeDirectories as defaultInitializeDirectories,
  saveBaseline as defaultSaveBaseline,
  saveCurrent as defaultSaveCurrent,
} from '../baselines/baseline.service.js';
import { installBaselineBuild } from '../baselines/baseline-download.js';
import {
  createEmptyBaselineMetadata as defaultCreateEmptyBaselineMetadata,
  loadBaselineMetadata as defaultLoadBaselineMetadata,
  saveBaselineMetadata as defaultSaveBaselineMetadata,
  upsertScreenshotInMetadata as defaultUpsertScreenshotInMetadata,
} from '../baselines/baseline-metadata.js';
import { getTddBaselines as defaultGetTddBaselines } from '../baselines/cloud-baselines.js';
import { getBuilds as defaultGetBuilds } from '../builds/build.service.js';
import { getComparison as defaultGetComparison } from '../comparisons/cloud-comparisons.js';
import {
  buildErrorComparison as defaultBuildErrorComparison,
  buildFailedComparison as defaultBuildFailedComparison,
  buildNewComparison as defaultBuildNewComparison,
  buildPassedComparison as defaultBuildPassedComparison,
  compareImages as defaultCompareImages,
  isDimensionMismatchError as defaultIsDimensionMismatchError,
} from '../comparisons/comparison.service.js';
import {
  buildResults as defaultBuildResults,
  getFailedComparisons as defaultGetFailedComparisons,
  getNewComparisons as defaultGetNewComparisons,
} from '../comparisons/comparison-results.js';
import {
  sanitizeScreenshotName as defaultSanitizeScreenshotName,
  validateScreenshotProperties as defaultValidateScreenshotProperties,
} from '../screenshots/screenshot.validations.js';
// Import from extracted modules
import {
  generateBaselineFilename as defaultGenerateBaselineFilename,
  generateComparisonId as defaultGenerateComparisonId,
  generateScreenshotSignature as defaultGenerateScreenshotSignature,
} from '../screenshots/screenshot-identity.js';
import {
  buildTddDependencyOps,
  resolveTddPaths,
  resolveTddWorkingDirectory,
} from './runtime-context.js';

/**
 * Create a new TDD service instance
 * @param {Object} config - Configuration object
 * @param {Object} options - Options
 * @param {string} options.workingDir - Working directory
 * @param {boolean} options.setBaseline - Whether to set baselines
 * @param {Object} options.authService - Authentication service
 * @param {Object} deps - Injectable dependencies for testing
 */
export function createTDDService(config, options = {}, deps = {}) {
  return new TddService(
    config,
    options.workingDir,
    options.setBaseline,
    options.authService,
    deps
  );
}

export class TddService {
  constructor(
    config,
    workingDir = process.cwd(),
    setBaseline = false,
    authService = null,
    deps = {}
  ) {
    let defaults = {
      output: defaultOutput,
      colors: defaultColors,
      validatePathSecurity: defaultValidatePathSecurity,
      initializeDirectories: defaultInitializeDirectories,
      fs: {
        existsSync: defaultExistsSync,
        mkdirSync: defaultMkdirSync,
        readFileSync: defaultReadFileSync,
        writeFileSync: defaultWriteFileSync,
      },
      api: {
        createApiClient: defaultCreateApiClient,
        getTddBaselines: defaultGetTddBaselines,
        getBuilds: defaultGetBuilds,
        getComparison: defaultGetComparison,
        fetchWithTimeout: defaultFetchWithTimeout,
        getDefaultBranch: defaultGetDefaultBranch,
      },
      metadata: {
        loadBaselineMetadata: defaultLoadBaselineMetadata,
        saveBaselineMetadata: defaultSaveBaselineMetadata,
        createEmptyBaselineMetadata: defaultCreateEmptyBaselineMetadata,
        upsertScreenshotInMetadata: defaultUpsertScreenshotInMetadata,
      },
      baseline: {
        baselineExists: defaultBaselineExists,
        clearBaselineData: defaultClearBaselineData,
        clearRunData: defaultClearRunData,
        getBaselinePath: defaultGetBaselinePath,
        getCurrentPath: defaultGetCurrentPath,
        getDiffPath: defaultGetDiffPath,
        saveBaseline: defaultSaveBaseline,
        saveCurrent: defaultSaveCurrent,
      },
      comparison: {
        compareImages: defaultCompareImages,
        buildPassedComparison: defaultBuildPassedComparison,
        buildNewComparison: defaultBuildNewComparison,
        buildFailedComparison: defaultBuildFailedComparison,
        buildErrorComparison: defaultBuildErrorComparison,
        isDimensionMismatchError: defaultIsDimensionMismatchError,
      },
      signature: {
        generateScreenshotSignature: defaultGenerateScreenshotSignature,
        generateBaselineFilename: defaultGenerateBaselineFilename,
        generateComparisonId: defaultGenerateComparisonId,
        sanitizeScreenshotName: defaultSanitizeScreenshotName,
        validateScreenshotProperties: defaultValidateScreenshotProperties,
        safePath: defaultSafePath,
      },
      results: {
        buildResults: defaultBuildResults,
        getFailedComparisons: defaultGetFailedComparisons,
        getNewComparisons: defaultGetNewComparisons,
      },
    };
    let { runtimeDeps, apiOps } = buildTddDependencyOps(deps, defaults);
    let { output, validatePathSecurity, initializeDirectories } = runtimeDeps;

    this._deps = runtimeDeps;

    this.config = config;
    this.setBaseline = setBaseline;
    this.authService = authService;
    this.client = apiOps.createApiClient({
      baseUrl: config.apiUrl,
      token: config.apiKey,
      command: 'tdd',
      allowNoToken: true,
    });

    // Validate and secure the working directory
    this.workingDir = resolveTddWorkingDirectory(
      workingDir,
      validatePathSecurity,
      output
    );

    let paths = resolveTddPaths(this.workingDir, initializeDirectories);
    this.baselinePath = paths.baselinePath;
    this.currentPath = paths.currentPath;
    this.diffPath = paths.diffPath;

    // State
    this.baselineData = null;
    this.comparisons = [];
    this.threshold = config.comparison?.threshold ?? 2.0;
    this.minClusterSize = config.comparison?.minClusterSize ?? 2;
    this.signatureProperties = config.signatureProperties ?? [];

    // Track whether results have been printed (to avoid duplicate output)
    this._resultsPrinted = false;

    if (this.setBaseline) {
      output.info(
        '[vizzly] Baseline update mode - will overwrite existing baselines with new ones'
      );
    }
  }

  clearRunData() {
    this._deps.clearRunData({
      currentPath: this.currentPath,
      diffPath: this.diffPath,
    });
  }

  /**
   * Download baselines from cloud
   */
  async downloadBaselines(
    environment = 'test',
    branch = null,
    buildId = null,
    comparisonId = null
  ) {
    // Destructure dependencies
    let {
      output,
      getDefaultBranch,
      getTddBaselines,
      getBuilds,
      getComparison,
      clearBaselineData,
      generateScreenshotSignature,
      generateBaselineFilename,
    } = this._deps;

    // If no branch specified, detect default branch
    if (!branch) {
      branch = await getDefaultBranch();
      if (!branch) {
        branch = 'main';
        output.warn(
          `Could not detect default branch, using 'main' as fallback`
        );
      } else {
        output.debug('tdd', `detected default branch: ${branch}`);
      }
    }

    try {
      let baselineBuild;

      if (buildId) {
        let apiResponse = await getTddBaselines(this.client, buildId);

        if (!apiResponse) {
          throw new Error(`Build ${buildId} not found or API returned null`);
        }

        // Clear local state before downloading
        output.info('Clearing local state before downloading baselines...');
        clearBaselineData({
          baselinePath: this.baselinePath,
          currentPath: this.currentPath,
          diffPath: this.diffPath,
        });

        // Extract signature properties
        if (
          apiResponse.signatureProperties &&
          Array.isArray(apiResponse.signatureProperties)
        ) {
          this.signatureProperties = apiResponse.signatureProperties;
          if (this.signatureProperties.length > 0) {
            output.info(
              `Using signature properties: ${this.signatureProperties.join(', ')}`
            );
          }
        }

        baselineBuild = apiResponse.build;

        if (baselineBuild.status === 'failed') {
          output.warn(
            `Build ${buildId} is marked as FAILED - falling back to local baselines`
          );
          return await this.handleLocalBaselines();
        } else if (baselineBuild.status !== 'completed') {
          output.warn(
            `Build ${buildId} has status: ${baselineBuild.status} (expected: completed)`
          );
        }

        baselineBuild.screenshots = apiResponse.screenshots;
      } else if (comparisonId) {
        // Handle specific comparison download
        output.info(`Using comparison: ${comparisonId}`);
        let comparison = await getComparison(this.client, comparisonId);

        if (!comparison.baseline_screenshot) {
          throw new Error(
            `Comparison ${comparisonId} has no baseline screenshot. This comparison may be a "new" screenshot.`
          );
        }

        let baselineUrl =
          comparison.baseline_screenshot.original_url ||
          comparison.baseline_screenshot_url;

        if (!baselineUrl) {
          throw new Error(
            `Baseline screenshot for comparison ${comparisonId} has no download URL`
          );
        }

        let screenshotProperties = {};
        if (comparison.current_viewport_width || comparison.current_browser) {
          if (comparison.current_viewport_width) {
            screenshotProperties.viewport = {
              width: comparison.current_viewport_width,
              height: comparison.current_viewport_height,
            };
          }
          if (comparison.current_browser) {
            screenshotProperties.browser = comparison.current_browser;
          }
        } else if (
          comparison.baseline_viewport_width ||
          comparison.baseline_browser
        ) {
          if (comparison.baseline_viewport_width) {
            screenshotProperties.viewport = {
              width: comparison.baseline_viewport_width,
              height: comparison.baseline_viewport_height,
            };
          }
          if (comparison.baseline_browser) {
            screenshotProperties.browser = comparison.baseline_browser;
          }
        }

        let screenshotName =
          comparison.baseline_name || comparison.current_name;
        let signature = generateScreenshotSignature(
          screenshotName,
          screenshotProperties,
          this.signatureProperties
        );
        let filename = generateBaselineFilename(screenshotName, signature);

        baselineBuild = {
          id: comparison.baseline_screenshot.build_id || 'comparison-baseline',
          name: `Comparison ${comparisonId.substring(0, 8)}`,
          screenshots: [
            {
              id: comparison.baseline_screenshot.id,
              name: screenshotName,
              original_url: baselineUrl,
              metadata: screenshotProperties,
              properties: screenshotProperties,
              filename: filename,
            },
          ],
        };
      } else {
        // Get latest passed build
        let builds = await getBuilds(this.client, {
          environment,
          branch,
          status: 'passed',
          limit: 1,
        });

        if (!builds.data || builds.data.length === 0) {
          output.warn(`No baseline builds found for ${environment}/${branch}`);
          output.info(
            'Tip: Run a build in normal mode first to create baselines'
          );
          return null;
        }

        let apiResponse = await getTddBaselines(this.client, builds.data[0].id);

        if (!apiResponse) {
          throw new Error(
            `Build ${builds.data[0].id} not found or API returned null`
          );
        }

        if (
          apiResponse.signatureProperties &&
          Array.isArray(apiResponse.signatureProperties)
        ) {
          this.signatureProperties = apiResponse.signatureProperties;
          if (this.signatureProperties.length > 0) {
            output.info(
              `Using custom signature properties: ${this.signatureProperties.join(', ')}`
            );
          }
        }

        baselineBuild = apiResponse.build;
        baselineBuild.screenshots = apiResponse.screenshots;
      }

      return await this._installBaselineBuild(
        baselineBuild,
        environment,
        branch
      );
    } catch (error) {
      output.error(`Failed to download baseline: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process already-fetched baseline data (for use when caller handles auth)
   * This allows the baseline router to fetch with a project token and pass the response here
   * @param {Object} apiResponse - Response from getTddBaselines API call
   * @param {string} buildId - Build ID for reference
   * @returns {Promise<Object>} Baseline data
   */
  async processDownloadedBaselines(apiResponse, buildId) {
    // Destructure dependencies
    let { output, clearBaselineData } = this._deps;

    // Clear local state before downloading
    output.info('Clearing local state before downloading baselines...');
    clearBaselineData({
      baselinePath: this.baselinePath,
      currentPath: this.currentPath,
      diffPath: this.diffPath,
    });

    // Extract signature properties
    if (
      apiResponse.signatureProperties &&
      Array.isArray(apiResponse.signatureProperties)
    ) {
      this.signatureProperties = apiResponse.signatureProperties;
      if (this.signatureProperties.length > 0) {
        output.info(
          `Using signature properties: ${this.signatureProperties.join(', ')}`
        );
      }
    }

    let baselineBuild = apiResponse.build;

    if (baselineBuild.status === 'failed') {
      output.warn(
        `Build ${buildId} is marked as FAILED - falling back to local baselines`
      );
      return await this.handleLocalBaselines();
    } else if (baselineBuild.status !== 'completed') {
      output.warn(
        `Build ${buildId} has status: ${baselineBuild.status} (expected: completed)`
      );
    }

    baselineBuild.screenshots = apiResponse.screenshots;

    return this._installBaselineBuild(baselineBuild, 'test', null);
  }

  async _installBaselineBuild(baselineBuild, environment, branch) {
    let { output, colors, fetchWithTimeout } = this._deps;
    if (!baselineBuild.screenshots || baselineBuild.screenshots.length === 0) {
      output.warn('No screenshots found in baseline build');
      return null;
    }

    output.info(
      `Using baseline from build: ${colors.info(baselineBuild.name || 'Unknown')} (${baselineBuild.id || 'Unknown ID'})`
    );
    output.info(
      `Checking ${colors.info(baselineBuild.screenshots.length)} baseline screenshots...`
    );
    let existingBaseline = await this.loadBaseline();
    let installedBaseline = await installBaselineBuild({
      baselineBuild,
      baselinePath: this.baselinePath,
      workingDir: this.workingDir,
      threshold: this.threshold,
      signatureProperties: this.signatureProperties,
      existingBaseline,
      environment,
      branch,
      output,
      fetchWithTimeout,
    });
    if (installedBaseline) this.baselineData = installedBaseline;
    return installedBaseline;
  }

  /**
   * Handle local baselines logic
   */
  async handleLocalBaselines() {
    let { output, colors } = this._deps;

    if (this.setBaseline) {
      output.info('📁 Ready for new baseline creation');
      this.baselineData = null;
      return null;
    }

    let baseline = await this.loadBaseline();

    if (!baseline) {
      if (this.config.apiKey) {
        output.info('📥 No local baseline found, but API key available');
        output.info('🆕 Current run will create new local baselines');
      } else {
        output.info(
          'No local baseline found - all screenshots will be marked as new'
        );
      }
      return null;
    } else {
      output.info(
        `Using existing baseline: ${colors.info(baseline.buildName)}`
      );
      return baseline;
    }
  }

  /**
   * Load baseline metadata
   */
  async loadBaseline() {
    let { output, loadBaselineMetadata } = this._deps;

    if (this.setBaseline) {
      output.debug('tdd', 'baseline update mode - skipping loading');
      return null;
    }

    let metadata = loadBaselineMetadata(this.baselinePath);

    if (!metadata) {
      return null;
    }

    this.baselineData = metadata;
    this.threshold = metadata.threshold ?? this.threshold;
    this.signatureProperties =
      metadata.signatureProperties || this.signatureProperties;

    if (this.signatureProperties.length > 0) {
      output.debug(
        'tdd',
        `loaded signature properties: ${this.signatureProperties.join(', ')}`
      );
    }

    return metadata;
  }

  /**
   * Upsert a comparison result - replaces existing if same ID, otherwise appends.
   * This prevents stale results from accumulating in daemon mode.
   * @private
   */
  _upsertComparison(result) {
    let existingIndex = this.comparisons.findIndex(c => c.id === result.id);
    if (existingIndex >= 0) {
      this.comparisons[existingIndex] = result;
    } else {
      this.comparisons.push(result);
    }
  }

  /**
   * Compare a screenshot against baseline
   */
  async compareScreenshot(
    name,
    imageBuffer,
    properties = {},
    screenshotOptions = {}
  ) {
    // Destructure dependencies
    let {
      output,
      sanitizeScreenshotName,
      validateScreenshotProperties,
      generateScreenshotSignature,
      generateBaselineFilename,
      getCurrentPath,
      getBaselinePath,
      getDiffPath,
      saveCurrent,
      baselineExists,
      saveBaseline,
      createEmptyBaselineMetadata,
      upsertScreenshotInMetadata,
      saveBaselineMetadata,
      buildNewComparison,
      compareImages,
      buildPassedComparison,
      buildFailedComparison,
      buildErrorComparison,
      isDimensionMismatchError,
    } = this._deps;

    // Sanitize and validate
    let sanitizedName;
    try {
      sanitizedName = sanitizeScreenshotName(name);
    } catch (error) {
      output.error(`Invalid screenshot name '${name}': ${error.message}`);
      throw new Error(`Screenshot name validation failed: ${error.message}`);
    }

    let validatedProperties;
    try {
      validatedProperties = validateScreenshotProperties(properties);
    } catch (error) {
      output.warn(
        `Property validation failed for '${sanitizedName}': ${error.message}`
      );
      validatedProperties = {};
    }

    // Preserve metadata
    if (properties.metadata && typeof properties.metadata === 'object') {
      validatedProperties.metadata = properties.metadata;
    }

    // Normalize viewport_width
    if (
      validatedProperties.viewport?.width &&
      !validatedProperties.viewport_width
    ) {
      validatedProperties.viewport_width = validatedProperties.viewport.width;
    }

    // Generate signature and filename
    let signature = generateScreenshotSignature(
      sanitizedName,
      validatedProperties,
      this.signatureProperties
    );
    let filename = generateBaselineFilename(sanitizedName, signature);

    let currentImagePath = getCurrentPath(this.currentPath, filename);
    let baselineImagePath = getBaselinePath(this.baselinePath, filename);
    let diffImagePath = getDiffPath(this.diffPath, filename);
    let hasBaseline = baselineExists(this.baselinePath, filename);

    // Existing baselines are decoded by normal comparison. New or explicitly
    // replaced baselines need the same validation before persisting any bytes.
    if (this.setBaseline || !hasBaseline) {
      try {
        compareSync(imageBuffer, imageBuffer);
      } catch (error) {
        throw new VizzlyError(
          `Invalid screenshot image: ${error.message}`,
          'INVALID_IMAGE'
        );
      }
    }

    // Save current screenshot
    saveCurrent(this.currentPath, filename, imageBuffer);

    // Handle baseline update mode
    if (this.setBaseline) {
      return this.createNewBaseline(
        sanitizedName,
        imageBuffer,
        validatedProperties,
        currentImagePath,
        baselineImagePath
      );
    }

    // Check if baseline exists
    if (!hasBaseline) {
      // Create new baseline
      saveBaseline(this.baselinePath, filename, imageBuffer);

      // Update metadata
      if (!this.baselineData) {
        this.baselineData = createEmptyBaselineMetadata({
          threshold: this.threshold,
          signatureProperties: this.signatureProperties,
        });
      }

      let screenshotEntry = {
        name: sanitizedName,
        properties: validatedProperties,
        path: baselineImagePath,
        signature,
      };

      upsertScreenshotInMetadata(this.baselineData, screenshotEntry, signature);
      saveBaselineMetadata(this.baselinePath, this.baselineData);

      let result = buildNewComparison({
        name: sanitizedName,
        signature,
        baselinePath: baselineImagePath,
        currentPath: currentImagePath,
        properties: validatedProperties,
      });

      this._upsertComparison(result);
      return result;
    }

    // Baseline exists - compare
    let effectiveThreshold =
      typeof screenshotOptions.threshold === 'number' &&
      screenshotOptions.threshold >= 0
        ? screenshotOptions.threshold
        : this.threshold;

    let effectiveMinClusterSize =
      Number.isInteger(screenshotOptions.minClusterSize) &&
      screenshotOptions.minClusterSize >= 1
        ? screenshotOptions.minClusterSize
        : this.minClusterSize;

    try {
      let honeydiffResult = await compareImages(
        baselineImagePath,
        currentImagePath,
        diffImagePath,
        {
          threshold: effectiveThreshold,
          minClusterSize: effectiveMinClusterSize,
        }
      );

      if (!honeydiffResult.isDifferent) {
        let result = buildPassedComparison({
          name: sanitizedName,
          signature,
          baselinePath: baselineImagePath,
          currentPath: currentImagePath,
          properties: validatedProperties,
          threshold: effectiveThreshold,
          minClusterSize: effectiveMinClusterSize,
          honeydiffResult,
        });

        this._upsertComparison(result);
        return result;
      } else {
        let result = buildFailedComparison({
          name: sanitizedName,
          signature,
          baselinePath: baselineImagePath,
          currentPath: currentImagePath,
          diffPath: diffImagePath,
          properties: validatedProperties,
          threshold: effectiveThreshold,
          minClusterSize: effectiveMinClusterSize,
          honeydiffResult,
        });

        // Log at debug level only (shown with --verbose)
        let diffInfo = `${honeydiffResult.diffPercentage.toFixed(2)}% diff, ${honeydiffResult.diffPixels} pixels`;
        if (honeydiffResult.diffClusters?.length > 0) {
          diffInfo += `, ${honeydiffResult.diffClusters.length} regions`;
        }
        output.debug('comparison', `${sanitizedName}: ${result.status}`, {
          diff: diffInfo,
        });

        this._upsertComparison(result);
        return result;
      }
    } catch (error) {
      if (isDimensionMismatchError(error)) {
        output.debug(
          'comparison',
          `${sanitizedName}: dimension mismatch, marking comparison as failed`,
          { error: error.message }
        );

        let result = buildFailedComparison({
          name: sanitizedName,
          signature,
          baselinePath: baselineImagePath,
          currentPath: currentImagePath,
          diffPath: null,
          properties: validatedProperties,
          threshold: effectiveThreshold,
          minClusterSize: effectiveMinClusterSize,
          honeydiffResult: {
            isDifferent: true,
            diffClusters: [],
          },
        });
        result.reason = 'dimension-mismatch';
        result.error = error.message;

        this._upsertComparison(result);
        return result;
      }

      output.debug('comparison', `${sanitizedName}: error - ${error.message}`);

      let result = buildErrorComparison({
        name: sanitizedName,
        signature,
        baselinePath: baselineImagePath,
        currentPath: currentImagePath,
        properties: validatedProperties,
        errorMessage: error.message,
      });

      this._upsertComparison(result);
      return result;
    }
  }

  /**
   * Get results summary
   */
  getResults() {
    let { buildResults } = this._deps;
    return buildResults(this.comparisons, this.baselineData);
  }

  /**
   * Print results to console
   * Only prints once per test run to avoid duplicate output
   */
  async printResults() {
    // Skip if already printed (prevents duplicate output from vizzlyFlush)
    if (this._resultsPrinted) {
      return this.getResults();
    }
    this._resultsPrinted = true;

    let {
      output,
      colors,
      getFailedComparisons,
      getNewComparisons,
      existsSync,
      readFileSync,
    } = this._deps;
    let results = this.getResults();
    let failedComparisons = getFailedComparisons(this.comparisons);
    let newComparisons = getNewComparisons(this.comparisons);
    let passedComparisons = this.comparisons.filter(
      c =>
        c.status === 'passed' ||
        c.status === 'baseline-created' ||
        c.status === 'baseline-updated'
    );
    let hasChanges = failedComparisons.length > 0 || newComparisons.length > 0;

    if (output.isJson?.()) {
      return results;
    }

    // Header with summary - use bear emoji as Vizzly mascot
    output.blank();
    output.print(
      `🐻 ${colors.bold(results.total)} screenshot${results.total !== 1 ? 's' : ''} compared`
    );
    output.blank();

    // Passed section - use BearDen success color
    if (results.passed > 0) {
      let successColor = colors.brand?.success || colors.success;
      if (output.isVerbose()) {
        // Verbose mode: show each screenshot
        for (let comp of passedComparisons) {
          output.print(`  ${successColor('✓')} ${comp.name}`);
        }
      } else {
        // Default mode: just show count with green checkmark and number
        output.print(
          `  ${successColor('✓')} ${successColor(results.passed)} passed`
        );
      }
      output.blank();
    }

    // Failed comparisons with diff bars - use BearDen warning/danger colors
    if (failedComparisons.length > 0) {
      let warningColor = colors.brand?.warning || colors.yellow;
      let dangerColor = colors.brand?.danger || colors.error;

      output.print(
        `  ${warningColor('◐')} ${warningColor(failedComparisons.length)} visual change${failedComparisons.length !== 1 ? 's' : ''} detected`
      );

      // Find longest name for alignment
      let maxNameLen = Math.max(...failedComparisons.map(c => c.name.length));
      let textMuted = colors.brand?.textMuted || colors.dim;

      for (let comp of failedComparisons) {
        let diffDisplay = '';
        if (comp.diffPercentage !== undefined) {
          // Use the new diffBar helper for visual representation
          let bar = output.diffBar(comp.diffPercentage, 10);
          let paddedName = comp.name.padEnd(maxNameLen);
          diffDisplay = ` ${bar} ${textMuted(`${comp.diffPercentage.toFixed(1)}%`)}`;
          output.print(`    ${dangerColor('✗')} ${paddedName}${diffDisplay}`);
        } else {
          output.print(`    ${dangerColor('✗')} ${comp.name}`);
        }
      }
      output.blank();
    }

    // New screenshots - use BearDen info color
    if (newComparisons.length > 0) {
      let infoColor = colors.brand?.info || colors.info;
      let textMuted = colors.brand?.textMuted || colors.dim;
      output.print(
        `  ${infoColor('+')} ${infoColor(newComparisons.length)} new screenshot${newComparisons.length !== 1 ? 's' : ''}`
      );
      for (let comp of newComparisons) {
        output.print(`    ${textMuted('○')} ${comp.name}`);
      }
      output.blank();
    }

    // Errors - use BearDen danger color
    if (results.errors > 0) {
      let dangerColor = colors.brand?.danger || colors.error;
      let errorComparisons = this.comparisons.filter(c => c.status === 'error');
      output.print(
        `  ${dangerColor('!')} ${dangerColor(results.errors)} error${results.errors !== 1 ? 's' : ''}`
      );
      for (let comp of errorComparisons) {
        output.print(`    ${dangerColor('✗')} ${comp.name}`);
      }
      output.blank();
    }

    // Dashboard link with prominent styling - detect if server is running
    if (hasChanges) {
      let infoColor = colors.brand?.info || colors.info;
      let textTertiary = colors.brand?.textTertiary || colors.dim;

      // Check if TDD server is already running
      let serverFile = `${this.workingDir}/.vizzly/server.json`;
      let serverRunning = false;
      let serverPort = 47392;
      let serverInfo = {};

      try {
        if (existsSync(serverFile)) {
          serverInfo = JSON.parse(readFileSync(serverFile, 'utf8'));
          if (serverInfo.port) {
            serverPort = serverInfo.port;
            serverRunning = true;
          }
        }
      } catch {
        // Ignore errors reading server file
      }

      if (serverRunning && !serverInfo.buildId) {
        // Server is running - show the dashboard URL
        output.print(
          `  ${textTertiary('→')} Review changes: ${infoColor(colors.underline(`http://localhost:${serverPort}`))}`
        );
      } else {
        // Server not running - suggest starting it
        output.print(
          `  ${textTertiary('→')} Review changes: ${infoColor(colors.underline('vizzly tdd start --open'))}`
        );
      }
      output.blank();
    }

    return results;
  }

  /**
   * Update all baselines with current screenshots
   */
  updateBaselines() {
    // Destructure dependencies
    let {
      output,
      generateScreenshotSignature,
      generateBaselineFilename,
      sanitizeScreenshotName,
      validateScreenshotProperties,
      getBaselinePath,
      existsSync,
      readFileSync,
      writeFileSync,
      createEmptyBaselineMetadata,
      upsertScreenshotInMetadata,
      saveBaselineMetadata,
    } = this._deps;

    if (this.comparisons.length === 0) {
      output.warn('No comparisons found - nothing to update');
      return 0;
    }

    let updatedCount = 0;

    if (!this.baselineData) {
      this.baselineData = createEmptyBaselineMetadata({
        threshold: this.threshold,
        signatureProperties: this.signatureProperties,
      });
    }

    for (let comparison of this.comparisons) {
      let { name, current } = comparison;

      if (!current || !existsSync(current)) {
        output.warn(`Current screenshot not found for ${name}, skipping`);
        continue;
      }

      let sanitizedName;
      try {
        sanitizedName = sanitizeScreenshotName(name);
      } catch (error) {
        output.warn(
          `Skipping baseline update for invalid name '${name}': ${error.message}`
        );
        continue;
      }

      let validatedProperties = validateScreenshotProperties(
        comparison.properties || {}
      );
      let signature = generateScreenshotSignature(
        sanitizedName,
        validatedProperties,
        this.signatureProperties
      );
      let filename = generateBaselineFilename(sanitizedName, signature);
      let baselineImagePath = getBaselinePath(this.baselinePath, filename);

      try {
        let currentBuffer = readFileSync(current);
        writeFileSync(baselineImagePath, currentBuffer);

        let screenshotEntry = {
          name: sanitizedName,
          properties: validatedProperties,
          path: baselineImagePath,
          signature,
        };

        upsertScreenshotInMetadata(
          this.baselineData,
          screenshotEntry,
          signature
        );

        updatedCount++;
        output.info(`Updated baseline for ${sanitizedName}`);
      } catch (error) {
        output.error(
          `Failed to update baseline for ${sanitizedName}: ${error.message}`
        );
      }
    }

    if (updatedCount > 0) {
      try {
        saveBaselineMetadata(this.baselinePath, this.baselineData);
        output.info(`Updated ${updatedCount} baseline(s)`);
      } catch (error) {
        output.error(`Failed to save baseline metadata: ${error.message}`);
      }
    }

    return updatedCount;
  }

  /**
   * Accept a single baseline
   */
  async acceptBaseline(idOrComparison) {
    // Destructure dependencies
    let {
      output,
      generateScreenshotSignature,
      generateBaselineFilename,
      sanitizeScreenshotName,
      safePath,
      existsSync,
      readFileSync,
      mkdirSync,
      writeFileSync,
      createEmptyBaselineMetadata,
      upsertScreenshotInMetadata,
      saveBaselineMetadata,
    } = this._deps;

    let comparison;

    if (typeof idOrComparison === 'string') {
      comparison = this.comparisons.find(c => c.id === idOrComparison);
      if (!comparison) {
        throw new Error(`No comparison found with ID: ${idOrComparison}`);
      }
    } else {
      comparison = idOrComparison;
    }

    // Sanitize name for consistency, even though comparison.name is typically pre-sanitized
    let sanitizedName;
    try {
      sanitizedName = sanitizeScreenshotName(comparison.name);
    } catch (error) {
      output.error(
        `Invalid screenshot name '${comparison.name}': ${error.message}`
      );
      throw new Error(`Screenshot name validation failed: ${error.message}`);
    }

    let properties = comparison.properties || {};

    // Generate signature from properties (don't rely on comparison.signature)
    let signature = generateScreenshotSignature(
      sanitizedName,
      properties,
      this.signatureProperties
    );
    let filename = generateBaselineFilename(sanitizedName, signature);

    // Find the current screenshot file
    let currentImagePath = safePath(this.currentPath, filename);

    if (!existsSync(currentImagePath)) {
      output.error(`Current screenshot not found at: ${currentImagePath}`);
      throw new Error(
        `Current screenshot not found: ${sanitizedName} (looked at ${currentImagePath})`
      );
    }

    // Read the current image
    let imageBuffer = readFileSync(currentImagePath);

    // Create baseline directory if it doesn't exist
    if (!existsSync(this.baselinePath)) {
      mkdirSync(this.baselinePath, { recursive: true });
    }

    // Update the baseline (filename already includes .png extension)
    let baselineImagePath = safePath(this.baselinePath, filename);

    writeFileSync(baselineImagePath, imageBuffer);

    // Update baseline metadata
    if (!this.baselineData) {
      this.baselineData = createEmptyBaselineMetadata({
        threshold: this.threshold,
        signatureProperties: this.signatureProperties,
      });
    }

    let screenshotEntry = {
      name: sanitizedName,
      properties,
      path: baselineImagePath,
      signature,
    };

    upsertScreenshotInMetadata(this.baselineData, screenshotEntry, signature);
    saveBaselineMetadata(this.baselinePath, this.baselineData);

    return {
      name: sanitizedName,
      status: 'accepted',
      message: 'Screenshot accepted as new baseline',
    };
  }

  /**
   * Create new baseline (used during --set-baseline mode)
   * @private
   */
  createNewBaseline(
    name,
    imageBuffer,
    properties,
    currentImagePath,
    baselineImagePath
  ) {
    // Destructure dependencies
    let {
      output,
      generateScreenshotSignature,
      generateComparisonId,
      writeFileSync,
      createEmptyBaselineMetadata,
      upsertScreenshotInMetadata,
      saveBaselineMetadata,
    } = this._deps;

    output.info(`Creating baseline for ${name}`);

    writeFileSync(baselineImagePath, imageBuffer);

    if (!this.baselineData) {
      this.baselineData = createEmptyBaselineMetadata({
        threshold: this.threshold,
        signatureProperties: this.signatureProperties,
      });
    }

    let signature = generateScreenshotSignature(
      name,
      properties || {},
      this.signatureProperties
    );

    let screenshotEntry = {
      name,
      properties: properties || {},
      path: baselineImagePath,
      signature,
    };

    upsertScreenshotInMetadata(this.baselineData, screenshotEntry, signature);
    saveBaselineMetadata(this.baselinePath, this.baselineData);

    let result = {
      id: generateComparisonId(signature),
      name,
      status: 'new',
      baseline: baselineImagePath,
      current: currentImagePath,
      diff: null,
      properties,
      signature,
    };

    this._upsertComparison(result);
    output.info(`Baseline created for ${name}`);
    return result;
  }
}
