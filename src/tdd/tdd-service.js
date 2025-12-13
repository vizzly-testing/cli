/**
 * TDD Service - Local Visual Testing
 *
 * Orchestrates visual testing by composing the extracted modules.
 * This is a thin orchestration layer - most logic lives in the modules.
 *
 * CRITICAL: Signature/filename generation MUST stay in sync with the cloud!
 * See src/tdd/core/signature.js for details.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { NetworkError } from '../errors/vizzly-error.js';
import { ApiService } from '../services/api-service.js';
import { colors } from '../utils/colors.js';
import { fetchWithTimeout } from '../utils/fetch-utils.js';
import { getDefaultBranch } from '../utils/git.js';
import * as output from '../utils/output.js';
import {
  safePath,
  sanitizeScreenshotName,
  validatePathSecurity,
  validateScreenshotProperties,
} from '../utils/security.js';
import { HtmlReportGenerator } from '../services/html-report-generator.js';

// Import from extracted modules
import {
  generateScreenshotSignature,
  generateBaselineFilename,
  generateComparisonId,
} from './core/signature.js';

import { calculateHotspotCoverage } from './core/hotspot-coverage.js';

import {
  loadBaselineMetadata,
  saveBaselineMetadata,
  createEmptyBaselineMetadata,
  upsertScreenshotInMetadata,
} from './metadata/baseline-metadata.js';

import {
  loadHotspotMetadata,
  saveHotspotMetadata,
} from './metadata/hotspot-metadata.js';

import {
  initializeDirectories,
  clearBaselineData,
  saveBaseline,
  saveCurrent,
  baselineExists,
  getBaselinePath,
  getCurrentPath,
  getDiffPath,
} from './services/baseline-manager.js';

import {
  compareImages,
  buildPassedComparison,
  buildNewComparison,
  buildFailedComparison,
  buildErrorComparison,
  isDimensionMismatchError,
} from './services/comparison-service.js';

import {
  buildResults,
  getFailedComparisons,
  getNewComparisons,
} from './services/result-service.js';

/**
 * Create a new TDD service instance
 */
export function createTDDService(config, options = {}) {
  return new TddService(
    config,
    options.workingDir,
    options.setBaseline,
    options.authService
  );
}

export class TddService {
  constructor(
    config,
    workingDir = process.cwd(),
    setBaseline = false,
    authService = null
  ) {
    this.config = config;
    this.setBaseline = setBaseline;
    this.authService = authService;
    this.api = new ApiService({
      baseUrl: config.apiUrl,
      token: config.apiKey,
      command: 'tdd',
      allowNoToken: true,
    });

    // Validate and secure the working directory
    try {
      this.workingDir = validatePathSecurity(workingDir, workingDir);
    } catch (error) {
      output.error(`Invalid working directory: ${error.message}`);
      throw new Error(`Working directory validation failed: ${error.message}`);
    }

    // Initialize directories using extracted module
    let paths = initializeDirectories(this.workingDir);
    this.baselinePath = paths.baselinePath;
    this.currentPath = paths.currentPath;
    this.diffPath = paths.diffPath;

    // State
    this.baselineData = null;
    this.comparisons = [];
    this.threshold = config.comparison?.threshold || 2.0;
    this.minClusterSize = config.comparison?.minClusterSize ?? 2;
    this.signatureProperties = config.signatureProperties ?? [];

    // Hotspot data (loaded lazily from disk or downloaded from cloud)
    this.hotspotData = null;

    if (this.setBaseline) {
      output.info(
        '🐻 Baseline update mode - will overwrite existing baselines with new ones'
      );
    }
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
    // If no branch specified, detect default branch
    if (!branch) {
      branch = await getDefaultBranch();
      if (!branch) {
        branch = 'main';
        output.warn(
          `⚠️  Could not detect default branch, using 'main' as fallback`
        );
      } else {
        output.debug('tdd', `detected default branch: ${branch}`);
      }
    }

    try {
      let baselineBuild;

      if (buildId) {
        let apiResponse = await this.api.getTddBaselines(buildId);

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
            `⚠️  Build ${buildId} is marked as FAILED - falling back to local baselines`
          );
          return await this.handleLocalBaselines();
        } else if (baselineBuild.status !== 'completed') {
          output.warn(
            `⚠️  Build ${buildId} has status: ${baselineBuild.status} (expected: completed)`
          );
        }

        baselineBuild.screenshots = apiResponse.screenshots;
      } else if (comparisonId) {
        // Handle specific comparison download
        output.info(`Using comparison: ${comparisonId}`);
        let comparison = await this.api.getComparison(comparisonId);

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
        let builds = await this.api.getBuilds({
          environment,
          branch,
          status: 'passed',
          limit: 1,
        });

        if (!builds.data || builds.data.length === 0) {
          output.warn(
            `⚠️  No baseline builds found for ${environment}/${branch}`
          );
          output.info(
            '💡 Run a build in normal mode first to create baselines'
          );
          return null;
        }

        let apiResponse = await this.api.getTddBaselines(builds.data[0].id);

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

      let buildDetails = baselineBuild;

      if (!buildDetails.screenshots || buildDetails.screenshots.length === 0) {
        output.warn('⚠️  No screenshots found in baseline build');
        return null;
      }

      output.info(
        `Using baseline from build: ${colors.cyan(baselineBuild.name || 'Unknown')} (${baselineBuild.id || 'Unknown ID'})`
      );
      output.info(
        `Checking ${colors.cyan(buildDetails.screenshots.length)} baseline screenshots...`
      );

      // Check existing baseline metadata for SHA comparison
      let existingBaseline = await this.loadBaseline();
      let existingShaMap = new Map();

      if (existingBaseline) {
        existingBaseline.screenshots.forEach(s => {
          if (s.sha256 && s.filename) {
            existingShaMap.set(s.filename, s.sha256);
          }
        });
      }

      // Download screenshots
      let downloadedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      let batchSize = 5;

      let screenshotsToProcess = [];
      for (let screenshot of buildDetails.screenshots) {
        let sanitizedName;
        try {
          sanitizedName = sanitizeScreenshotName(screenshot.name);
        } catch (error) {
          output.warn(
            `Skipping screenshot with invalid name '${screenshot.name}': ${error.message}`
          );
          errorCount++;
          continue;
        }

        let filename = screenshot.filename;
        if (!filename) {
          output.warn(
            `⚠️  Screenshot ${sanitizedName} has no filename from API - skipping`
          );
          errorCount++;
          continue;
        }

        let imagePath = safePath(this.baselinePath, filename);

        // Check SHA
        if (existsSync(imagePath) && screenshot.sha256) {
          let storedSha = existingShaMap.get(filename);
          if (storedSha === screenshot.sha256) {
            downloadedCount++;
            skippedCount++;
            continue;
          }
        }

        let downloadUrl = screenshot.original_url || screenshot.url;
        if (!downloadUrl) {
          output.warn(
            `⚠️  Screenshot ${sanitizedName} has no download URL - skipping`
          );
          errorCount++;
          continue;
        }

        screenshotsToProcess.push({
          screenshot,
          sanitizedName,
          imagePath,
          downloadUrl,
          filename,
        });
      }

      // Process downloads in batches
      if (screenshotsToProcess.length > 0) {
        output.info(
          `📥 Downloading ${screenshotsToProcess.length} new/updated screenshots...`
        );

        for (let i = 0; i < screenshotsToProcess.length; i += batchSize) {
          let batch = screenshotsToProcess.slice(i, i + batchSize);
          let batchNum = Math.floor(i / batchSize) + 1;
          let totalBatches = Math.ceil(screenshotsToProcess.length / batchSize);

          output.info(`📦 Processing batch ${batchNum}/${totalBatches}`);

          let downloadPromises = batch.map(
            async ({ sanitizedName, imagePath, downloadUrl }) => {
              try {
                let response = await fetchWithTimeout(downloadUrl);
                if (!response.ok) {
                  throw new NetworkError(
                    `Failed to download ${sanitizedName}: ${response.statusText}`
                  );
                }

                let arrayBuffer = await response.arrayBuffer();
                let imageBuffer = Buffer.from(arrayBuffer);
                writeFileSync(imagePath, imageBuffer);

                return { success: true, name: sanitizedName };
              } catch (error) {
                output.warn(
                  `⚠️  Failed to download ${sanitizedName}: ${error.message}`
                );
                return {
                  success: false,
                  name: sanitizedName,
                  error: error.message,
                };
              }
            }
          );

          let batchResults = await Promise.all(downloadPromises);
          let batchSuccesses = batchResults.filter(r => r.success).length;
          let batchFailures = batchResults.filter(r => !r.success).length;

          downloadedCount += batchSuccesses;
          errorCount += batchFailures;
        }
      }

      if (downloadedCount === 0 && skippedCount === 0) {
        output.error('❌ No screenshots were successfully downloaded');
        return null;
      }

      // Store baseline metadata
      this.baselineData = {
        buildId: baselineBuild.id,
        buildName: baselineBuild.name,
        environment,
        branch,
        threshold: this.threshold,
        signatureProperties: this.signatureProperties,
        createdAt: new Date().toISOString(),
        buildInfo: {
          commitSha: baselineBuild.commit_sha,
          commitMessage: baselineBuild.commit_message,
          approvalStatus: baselineBuild.approval_status,
          completedAt: baselineBuild.completed_at,
        },
        screenshots: buildDetails.screenshots
          .filter(s => s.filename)
          .map(s => ({
            name: sanitizeScreenshotName(s.name),
            originalName: s.name,
            sha256: s.sha256,
            id: s.id,
            filename: s.filename,
            path: safePath(this.baselinePath, s.filename),
            browser: s.browser,
            viewport_width: s.viewport_width,
            originalUrl: s.original_url,
            fileSize: s.file_size_bytes,
            dimensions: { width: s.width, height: s.height },
          })),
      };

      saveBaselineMetadata(this.baselinePath, this.baselineData);

      // Download hotspots
      await this.downloadHotspots(buildDetails.screenshots);

      // Save baseline build metadata for MCP plugin
      let baselineMetadataPath = safePath(
        this.workingDir,
        '.vizzly',
        'baseline-metadata.json'
      );
      writeFileSync(
        baselineMetadataPath,
        JSON.stringify(
          {
            buildId: baselineBuild.id,
            buildName: baselineBuild.name,
            branch,
            environment,
            commitSha: baselineBuild.commit_sha,
            commitMessage: baselineBuild.commit_message,
            approvalStatus: baselineBuild.approval_status,
            completedAt: baselineBuild.completed_at,
            downloadedAt: new Date().toISOString(),
          },
          null,
          2
        )
      );

      // Summary
      let actualDownloads = downloadedCount - skippedCount;
      if (skippedCount > 0) {
        if (actualDownloads === 0) {
          output.info(`✅ All ${skippedCount} baselines up-to-date`);
        } else {
          output.info(
            `✅ Downloaded ${actualDownloads} new screenshots, ${skippedCount} already up-to-date`
          );
        }
      } else {
        output.info(
          `✅ Downloaded ${downloadedCount}/${buildDetails.screenshots.length} screenshots successfully`
        );
      }

      if (errorCount > 0) {
        output.warn(`⚠️  ${errorCount} screenshots failed to download`);
      }

      return this.baselineData;
    } catch (error) {
      output.error(`❌ Failed to download baseline: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download hotspot data for screenshots
   */
  async downloadHotspots(screenshots) {
    if (!this.config.apiKey) {
      output.debug(
        'tdd',
        'Skipping hotspot download - no API token configured'
      );
      return;
    }

    try {
      let screenshotNames = [...new Set(screenshots.map(s => s.name))];

      if (screenshotNames.length === 0) {
        return;
      }

      output.info(
        `🔥 Fetching hotspot data for ${screenshotNames.length} screenshots...`
      );

      let response = await this.api.getBatchHotspots(screenshotNames);

      if (!response.hotspots || Object.keys(response.hotspots).length === 0) {
        output.debug('tdd', 'No hotspot data available from cloud');
        return;
      }

      // Update memory cache
      this.hotspotData = response.hotspots;

      // Save to disk using extracted module
      saveHotspotMetadata(this.workingDir, response.hotspots, response.summary);

      let hotspotCount = Object.keys(response.hotspots).length;
      let totalRegions = Object.values(response.hotspots).reduce(
        (sum, h) => sum + (h.regions?.length || 0),
        0
      );

      output.info(
        `✅ Downloaded hotspot data for ${hotspotCount} screenshots (${totalRegions} regions total)`
      );
    } catch (error) {
      output.debug('tdd', `Hotspot download failed: ${error.message}`);
      output.warn(
        '⚠️  Could not fetch hotspot data - comparisons will run without noise filtering'
      );
    }
  }

  /**
   * Load hotspot data from disk
   */
  loadHotspots() {
    return loadHotspotMetadata(this.workingDir);
  }

  /**
   * Get hotspot for a specific screenshot
   *
   * Note: Once hotspotData is loaded (from disk or cloud), we don't reload.
   * This is intentional - hotspots are downloaded once per session and cached.
   * If a screenshot isn't in the cache, it means no hotspot data exists for it.
   */
  getHotspotForScreenshot(screenshotName) {
    // Check memory cache first
    if (this.hotspotData?.[screenshotName]) {
      return this.hotspotData[screenshotName];
    }

    // Try loading from disk (only if we haven't loaded yet)
    if (!this.hotspotData) {
      this.hotspotData = this.loadHotspots();
    }

    return this.hotspotData?.[screenshotName] || null;
  }

  /**
   * Calculate hotspot coverage (delegating to pure function)
   */
  calculateHotspotCoverage(diffClusters, hotspotAnalysis) {
    return calculateHotspotCoverage(diffClusters, hotspotAnalysis);
  }

  /**
   * Handle local baselines logic
   */
  async handleLocalBaselines() {
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
          '📝 No local baseline found - all screenshots will be marked as new'
        );
      }
      return null;
    } else {
      output.info(
        `✅ Using existing baseline: ${colors.cyan(baseline.buildName)}`
      );
      return baseline;
    }
  }

  /**
   * Load baseline metadata
   */
  async loadBaseline() {
    if (this.setBaseline) {
      output.debug('tdd', 'baseline update mode - skipping loading');
      return null;
    }

    let metadata = loadBaselineMetadata(this.baselinePath);

    if (!metadata) {
      return null;
    }

    this.baselineData = metadata;
    this.threshold = metadata.threshold || this.threshold;
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
   * Compare a screenshot against baseline
   */
  async compareScreenshot(name, imageBuffer, properties = {}) {
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
    if (!baselineExists(this.baselinePath, filename)) {
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

      this.comparisons.push(result);
      return result;
    }

    // Baseline exists - compare
    try {
      let effectiveThreshold =
        typeof validatedProperties.threshold === 'number' &&
        validatedProperties.threshold >= 0
          ? validatedProperties.threshold
          : this.threshold;

      let effectiveMinClusterSize =
        Number.isInteger(validatedProperties.minClusterSize) &&
        validatedProperties.minClusterSize >= 1
          ? validatedProperties.minClusterSize
          : this.minClusterSize;

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

        this.comparisons.push(result);
        return result;
      } else {
        let hotspotAnalysis = this.getHotspotForScreenshot(name);

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
          hotspotAnalysis,
        });

        // Log result
        let diffInfo = ` (${honeydiffResult.diffPercentage.toFixed(2)}% different, ${honeydiffResult.diffPixels} pixels)`;

        if (honeydiffResult.diffClusters?.length > 0) {
          diffInfo += `, ${honeydiffResult.diffClusters.length} region${honeydiffResult.diffClusters.length > 1 ? 's' : ''}`;
        }

        if (result.hotspotAnalysis?.coverage > 0) {
          diffInfo += `, ${Math.round(result.hotspotAnalysis.coverage * 100)}% in hotspots`;
        }

        if (result.status === 'passed') {
          output.info(
            `✅ ${colors.green('PASSED')} ${sanitizedName} - differences in known hotspots${diffInfo}`
          );
        } else {
          output.warn(
            `❌ ${colors.red('FAILED')} ${sanitizedName} - differences detected${diffInfo}`
          );
          output.info(`    Diff saved to: ${diffImagePath}`);
        }

        this.comparisons.push(result);
        return result;
      }
    } catch (error) {
      if (isDimensionMismatchError(error)) {
        output.warn(
          `⚠️  Dimension mismatch for ${sanitizedName} - creating new baseline`
        );

        saveBaseline(this.baselinePath, filename, imageBuffer);

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

        upsertScreenshotInMetadata(
          this.baselineData,
          screenshotEntry,
          signature
        );
        saveBaselineMetadata(this.baselinePath, this.baselineData);

        output.info(
          `✅ Created new baseline for ${sanitizedName} (different dimensions)`
        );

        let result = buildNewComparison({
          name: sanitizedName,
          signature,
          baselinePath: baselineImagePath,
          currentPath: currentImagePath,
          properties: validatedProperties,
        });

        this.comparisons.push(result);
        return result;
      }

      output.error(`❌ Error comparing ${sanitizedName}: ${error.message}`);

      let result = buildErrorComparison({
        name: sanitizedName,
        signature,
        baselinePath: baselineImagePath,
        currentPath: currentImagePath,
        properties: validatedProperties,
        errorMessage: error.message,
      });

      this.comparisons.push(result);
      return result;
    }
  }

  /**
   * Get results summary
   */
  getResults() {
    return buildResults(this.comparisons, this.baselineData);
  }

  /**
   * Print results to console
   */
  async printResults() {
    let results = this.getResults();

    output.info('\n📊 TDD Results:');
    output.info(`Total: ${colors.cyan(results.total)}`);
    output.info(`Passed: ${colors.green(results.passed)}`);

    if (results.failed > 0) {
      output.info(`Failed: ${colors.red(results.failed)}`);
    }

    if (results.new > 0) {
      output.info(`New: ${colors.yellow(results.new)}`);
    }

    if (results.errors > 0) {
      output.info(`Errors: ${colors.red(results.errors)}`);
    }

    let failedComparisons = getFailedComparisons(this.comparisons);
    if (failedComparisons.length > 0) {
      output.info('\n❌ Failed comparisons:');
      for (let comp of failedComparisons) {
        output.info(`  • ${comp.name}`);
      }
    }

    let newComparisons = getNewComparisons(this.comparisons);
    if (newComparisons.length > 0) {
      output.info('\n📸 New screenshots:');
      for (let comp of newComparisons) {
        output.info(`  • ${comp.name}`);
      }
    }

    await this.generateHtmlReport(results);

    return results;
  }

  /**
   * Generate HTML report
   */
  async generateHtmlReport(results) {
    try {
      let reportGenerator = new HtmlReportGenerator(
        this.workingDir,
        this.config
      );
      let reportPath = await reportGenerator.generateReport(results, {
        baseline: this.baselineData,
        threshold: this.threshold,
      });

      output.info(
        `\n🐻 View detailed report: ${colors.cyan(`file://${reportPath}`)}`
      );

      if (this.config.tdd?.openReport) {
        await this.openReport(reportPath);
      }

      return reportPath;
    } catch (error) {
      output.warn(`Failed to generate HTML report: ${error.message}`);
    }
  }

  /**
   * Open report in browser
   */
  async openReport(reportPath) {
    try {
      let { exec } = await import('node:child_process');
      let { promisify } = await import('node:util');
      let execAsync = promisify(exec);

      let command;
      switch (process.platform) {
        case 'darwin':
          command = `open "${reportPath}"`;
          break;
        case 'win32':
          command = `start "" "${reportPath}"`;
          break;
        default:
          command = `xdg-open "${reportPath}"`;
          break;
      }

      await execAsync(command);
      output.info('📖 Report opened in browser');
    } catch {
      // Browser open may fail silently
    }
  }

  /**
   * Update all baselines with current screenshots
   */
  updateBaselines() {
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
        output.info(`✅ Updated baseline for ${sanitizedName}`);
      } catch (error) {
        output.error(
          `❌ Failed to update baseline for ${sanitizedName}: ${error.message}`
        );
      }
    }

    if (updatedCount > 0) {
      try {
        saveBaselineMetadata(this.baselinePath, this.baselineData);
        output.info(`✅ Updated ${updatedCount} baseline(s)`);
      } catch (error) {
        output.error(`❌ Failed to save baseline metadata: ${error.message}`);
      }
    }

    return updatedCount;
  }

  /**
   * Accept a single baseline
   */
  async acceptBaseline(idOrComparison) {
    let comparison;

    if (typeof idOrComparison === 'string') {
      comparison = this.comparisons.find(c => c.id === idOrComparison);
      if (!comparison) {
        throw new Error(`No comparison found with ID: ${idOrComparison}`);
      }
    } else {
      comparison = idOrComparison;
    }

    let sanitizedName = comparison.name;
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

    // Update the baseline
    let baselineImagePath = safePath(this.baselinePath, `${filename}.png`);

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
    output.info(`🐻 Creating baseline for ${name}`);

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

    this.comparisons.push(result);
    output.info(`✅ Baseline created for ${name}`);
    return result;
  }
}
