import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { compare } from '@vizzly-testing/honeydiff';
import crypto from 'crypto';

import { ApiService } from '../services/api-service.js';
import { createServiceLogger } from '../utils/logger-factory.js';
import { colors } from '../utils/colors.js';
import { getDefaultBranch } from '../utils/git.js';
import { fetchWithTimeout } from '../utils/fetch-utils.js';
import { NetworkError } from '../errors/vizzly-error.js';
import { HtmlReportGenerator } from './html-report-generator.js';
import {
  sanitizeScreenshotName,
  validatePathSecurity,
  safePath,
  validateScreenshotProperties,
} from '../utils/security.js';

const logger = createServiceLogger('TDD');

/**
 * Generate a screenshot signature for baseline matching
 * Uses same logic as screenshot-identity.js: name + viewport_width + browser
 *
 * Matches backend signature generation which uses:
 * - screenshot.name
 * - screenshot.viewport_width (top-level property)
 * - screenshot.browser (top-level property)
 */
function generateScreenshotSignature(name, properties = {}) {
  let parts = [name];

  // Check for viewport_width as top-level property first (backend format)
  let viewportWidth = properties.viewport_width;

  // Fallback to nested viewport.width (SDK format)
  if (!viewportWidth && properties.viewport?.width) {
    viewportWidth = properties.viewport.width;
  }

  // Add viewport width if present
  if (viewportWidth) {
    parts.push(viewportWidth.toString());
  }

  // Add browser if present
  if (properties.browser) {
    parts.push(properties.browser);
  }

  return parts.join('|');
}

/**
 * Create a safe filename from signature
 */
function signatureToFilename(signature) {
  // Replace pipe separators with underscores for filesystem safety
  return signature.replace(/\|/g, '_');
}

/**
 * Generate a stable unique ID from signature for TDD comparisons
 * This allows UI to reference specific variants without database IDs
 */
function generateComparisonId(signature) {
  return crypto
    .createHash('sha256')
    .update(signature)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Create a new TDD service instance
 */
export function createTDDService(config, options = {}) {
  return new TddService(config, options.workingDir, options.setBaseline);
}

export class TddService {
  constructor(config, workingDir = process.cwd(), setBaseline = false) {
    this.config = config;
    this.setBaseline = setBaseline;
    this.api = new ApiService({
      baseUrl: config.apiUrl,
      token: config.apiKey,
      command: 'tdd',
      allowNoToken: true, // TDD can run without a token to create new screenshots
    });

    // Validate and secure the working directory
    try {
      this.workingDir = validatePathSecurity(workingDir, workingDir);
    } catch (error) {
      logger.error(`Invalid working directory: ${error.message}`);
      throw new Error(`Working directory validation failed: ${error.message}`);
    }

    // Use safe path construction for subdirectories
    this.baselinePath = safePath(this.workingDir, '.vizzly', 'baselines');
    this.currentPath = safePath(this.workingDir, '.vizzly', 'current');
    this.diffPath = safePath(this.workingDir, '.vizzly', 'diffs');
    this.baselineData = null;
    this.comparisons = [];
    this.threshold = config.comparison?.threshold || 0.1;

    // Check if we're in baseline update mode
    if (this.setBaseline) {
      logger.info(
        '🐻 Baseline update mode - will overwrite existing baselines with new ones'
      );
    }

    // Ensure directories exist
    [this.baselinePath, this.currentPath, this.diffPath].forEach(dir => {
      if (!existsSync(dir)) {
        try {
          mkdirSync(dir, { recursive: true });
        } catch (error) {
          logger.error(`Failed to create directory ${dir}: ${error.message}`);
          throw new Error(`Directory creation failed: ${error.message}`);
        }
      }
    });
  }

  async downloadBaselines(
    environment = 'test',
    branch = null,
    buildId = null,
    comparisonId = null
  ) {
    // If no branch specified, try to detect the default branch
    if (!branch) {
      branch = await getDefaultBranch();
      if (!branch) {
        // If we can't detect a default branch, use 'main' as fallback
        branch = 'main';
        logger.warn(
          `⚠️  Could not detect default branch, using 'main' as fallback`
        );
      } else {
        logger.debug(`Using detected default branch: ${branch}`);
      }
    }

    try {
      let baselineBuild;

      if (buildId) {
        // Use specific build ID - get it with screenshots in one call
        const apiResponse = await this.api.getBuild(buildId, 'screenshots');

        // Debug the full API response (only in debug mode)
        logger.debug(`📊 Raw API response:`, { apiResponse });

        if (!apiResponse) {
          throw new Error(`Build ${buildId} not found or API returned null`);
        }

        // Handle wrapped response format
        baselineBuild = apiResponse.build || apiResponse;

        if (!baselineBuild.id) {
          logger.warn(
            `⚠️  Build response structure: ${JSON.stringify(Object.keys(apiResponse))}`
          );
          logger.warn(
            `⚠️  Extracted build keys: ${JSON.stringify(Object.keys(baselineBuild))}`
          );
        }

        // Check build status and warn if it's not successful
        if (baselineBuild.status === 'failed') {
          logger.warn(
            `⚠️  Build ${buildId} is marked as FAILED - falling back to local baselines`
          );
          logger.info(
            `💡 To use remote baselines, specify a successful build ID instead`
          );
          // Fall back to local baseline logic
          return await this.handleLocalBaselines();
        } else if (baselineBuild.status !== 'completed') {
          logger.warn(
            `⚠️  Build ${buildId} has status: ${baselineBuild.status} (expected: completed)`
          );
        }
      } else if (comparisonId) {
        // Use specific comparison ID - download only this comparison's baseline screenshot
        logger.info(`📌 Using comparison: ${comparisonId}`);
        const comparison = await this.api.getComparison(comparisonId);

        // Debug: log what we got from the API
        logger.info(
          `📊 Comparison API response keys: ${Object.keys(comparison).join(', ')}`
        );
        logger.info(
          `📊 current_viewport_width: ${comparison.current_viewport_width}`
        );
        logger.info(
          `📊 current_viewport_height: ${comparison.current_viewport_height}`
        );
        logger.info(`📊 current_browser: ${comparison.current_browser}`);
        logger.info(
          `📊 baseline_viewport_width: ${comparison.baseline_viewport_width}`
        );
        logger.info(
          `📊 baseline_viewport_height: ${comparison.baseline_viewport_height}`
        );
        logger.info(`📊 baseline_browser: ${comparison.baseline_browser}`);

        // A comparison doesn't have baselineBuild directly - we need to get it
        // The comparison has baseline_screenshot which contains the build_id
        if (!comparison.baseline_screenshot) {
          throw new Error(
            `Comparison ${comparisonId} has no baseline screenshot. This comparison may be a "new" screenshot with no baseline to compare against.`
          );
        }

        // The original_url might be in baseline_screenshot.original_url or comparison.baseline_screenshot_url
        let baselineUrl =
          comparison.baseline_screenshot.original_url ||
          comparison.baseline_screenshot_url;

        if (!baselineUrl) {
          throw new Error(
            `Baseline screenshot for comparison ${comparisonId} has no download URL`
          );
        }

        // Extract properties from the current screenshot to ensure signature matching
        // The baseline should use the same properties (viewport/browser) as the current screenshot
        // so that generateScreenshotSignature produces the correct filename
        // Use current screenshot properties since we're downloading baseline to compare against current
        let screenshotProperties = {};

        // Build properties from comparison API fields (added in backend update)
        // Use current_* fields since we're matching against the current screenshot being tested
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
          // Fallback to baseline properties if current not available
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

        logger.info(
          `📊 Extracted properties for signature: ${JSON.stringify(screenshotProperties)}`
        );

        // For a specific comparison, we only download that one baseline screenshot
        // Create a mock build structure with just this one screenshot
        baselineBuild = {
          id: comparison.baseline_screenshot.build_id || 'comparison-baseline',
          name: `Comparison ${comparisonId.substring(0, 8)}`,
          screenshots: [
            {
              id: comparison.baseline_screenshot.id,
              name: comparison.baseline_name || comparison.current_name,
              original_url: baselineUrl,
              metadata: screenshotProperties,
              properties: screenshotProperties,
            },
          ],
        };
      } else {
        // Get the latest passed build for this environment and branch
        const builds = await this.api.getBuilds({
          environment,
          branch,
          status: 'passed',
          limit: 1,
        });

        if (!builds.data || builds.data.length === 0) {
          logger.warn(
            `⚠️  No baseline builds found for ${environment}/${branch}`
          );
          logger.info(
            '💡 Run a build in normal mode first to create baselines'
          );
          return null;
        }

        baselineBuild = builds.data[0];
      }

      // For specific buildId, we already have screenshots
      // For comparisonId, we created a mock build with just the one screenshot
      // Otherwise, get build details with screenshots
      let buildDetails = baselineBuild;
      if (!buildId && !comparisonId) {
        // Get build details with screenshots for non-buildId/non-comparisonId cases
        const actualBuildId = baselineBuild.id;
        buildDetails = await this.api.getBuild(actualBuildId, 'screenshots');
      }

      if (!buildDetails.screenshots || buildDetails.screenshots.length === 0) {
        logger.warn('⚠️  No screenshots found in baseline build');
        return null;
      }

      logger.info(
        `Using baseline from build: ${colors.cyan(baselineBuild.name || 'Unknown')} (${baselineBuild.id || 'Unknown ID'})`
      );
      logger.info(
        `Checking ${colors.cyan(buildDetails.screenshots.length)} baseline screenshots...`
      );

      // Debug: Show all screenshot names and properties
      logger.info(`📊 Screenshots in baseline build:`);
      buildDetails.screenshots.forEach((s, idx) => {
        let props = s.metadata || s.properties || {};
        let sig = generateScreenshotSignature(
          s.name,
          validateScreenshotProperties(props)
        );
        logger.info(`   ${idx + 1}. ${s.name} → signature: ${sig}`);
      });

      // Check existing baseline metadata for efficient SHA comparison
      const existingBaseline = await this.loadBaseline();
      const existingShaMap = new Map();

      if (existingBaseline) {
        existingBaseline.screenshots.forEach(s => {
          if (s.sha256 && s.signature) {
            existingShaMap.set(s.signature, s.sha256);
          }
        });
      }

      // Download screenshots in batches with progress indication
      let downloadedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      const totalScreenshots = buildDetails.screenshots.length;
      const batchSize = 5; // Download up to 5 screenshots concurrently

      // Filter screenshots that need to be downloaded
      const screenshotsToProcess = [];
      for (const screenshot of buildDetails.screenshots) {
        // Sanitize screenshot name for security
        let sanitizedName;
        try {
          sanitizedName = sanitizeScreenshotName(screenshot.name);
        } catch (error) {
          logger.warn(
            `Skipping screenshot with invalid name '${screenshot.name}': ${error.message}`
          );
          errorCount++;
          continue;
        }

        // Generate signature for baseline matching (same as compareScreenshot)
        let properties = validateScreenshotProperties(
          screenshot.metadata || screenshot.properties || {}
        );
        let signature = generateScreenshotSignature(sanitizedName, properties);
        let filename = signatureToFilename(signature);

        // Log signature generation for first screenshot to verify it's working
        if (downloadedCount + skippedCount === 0) {
          logger.info(`📊 First screenshot signature generation:`);
          logger.info(`   Name: ${sanitizedName}`);
          logger.info(`   Properties: ${JSON.stringify(properties)}`);
          logger.info(`   Signature: ${signature}`);
          logger.info(`   Filename: ${filename}.png`);
        }

        const imagePath = safePath(this.baselinePath, `${filename}.png`);

        // Check if we already have this file with the same SHA (using metadata)
        if (existsSync(imagePath) && screenshot.sha256) {
          const storedSha = existingShaMap.get(signature);

          if (storedSha === screenshot.sha256) {
            logger.debug(
              `⚡ Skipping ${sanitizedName} - SHA match from metadata`
            );
            downloadedCount++; // Count as "downloaded" since we have it
            skippedCount++;
            continue;
          } else if (storedSha) {
            logger.debug(
              `🔄 SHA mismatch for ${sanitizedName} - will re-download (stored: ${storedSha?.slice(0, 8)}..., remote: ${screenshot.sha256?.slice(0, 8)}...)`
            );
          }
        }

        // Use original_url as the download URL
        const downloadUrl = screenshot.original_url || screenshot.url;

        if (!downloadUrl) {
          logger.warn(
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
          signature,
          filename,
          properties,
        });
      }

      // Process downloads in batches
      const actualDownloadsNeeded = screenshotsToProcess.length;
      if (actualDownloadsNeeded > 0) {
        logger.info(
          `📥 Downloading ${actualDownloadsNeeded} new/updated screenshots in batches of ${batchSize}...`
        );

        for (let i = 0; i < screenshotsToProcess.length; i += batchSize) {
          const batch = screenshotsToProcess.slice(i, i + batchSize);
          const batchNum = Math.floor(i / batchSize) + 1;
          const totalBatches = Math.ceil(
            screenshotsToProcess.length / batchSize
          );

          logger.info(
            `📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} screenshots)`
          );

          // Download batch concurrently
          const downloadPromises = batch.map(
            async ({ sanitizedName, imagePath, downloadUrl }) => {
              try {
                logger.debug(`📥 Downloading: ${sanitizedName}`);

                const response = await fetchWithTimeout(downloadUrl);
                if (!response.ok) {
                  throw new NetworkError(
                    `Failed to download ${sanitizedName}: ${response.statusText}`
                  );
                }

                const arrayBuffer = await response.arrayBuffer();
                const imageBuffer = Buffer.from(arrayBuffer);
                writeFileSync(imagePath, imageBuffer);

                logger.debug(`✓ Downloaded ${sanitizedName}.png`);
                return { success: true, name: sanitizedName };
              } catch (error) {
                logger.warn(
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

          const batchResults = await Promise.all(downloadPromises);
          const batchSuccesses = batchResults.filter(r => r.success).length;
          const batchFailures = batchResults.filter(r => !r.success).length;

          downloadedCount += batchSuccesses;
          errorCount += batchFailures;

          // Show progress
          const totalProcessed = downloadedCount + skippedCount + errorCount;
          const progressPercent = Math.round(
            (totalProcessed / totalScreenshots) * 100
          );

          logger.info(
            `📊 Progress: ${totalProcessed}/${totalScreenshots} (${progressPercent}%) - ${batchSuccesses} downloaded, ${batchFailures} failed in this batch`
          );
        }
      }

      // Check if we actually downloaded any screenshots
      if (downloadedCount === 0 && skippedCount === 0) {
        logger.error(
          '❌ No screenshots were successfully downloaded from the baseline build'
        );
        if (errorCount > 0) {
          logger.info(
            `💡 ${errorCount} screenshots had errors - check download URLs and network connection`
          );
        }
        logger.info(
          '💡 This usually means the build failed or screenshots have no download URLs'
        );
        logger.info(
          '💡 Try using a successful build ID, or run without --baseline-build to create local baselines'
        );
        return null;
      }

      // Store enhanced baseline metadata with SHA hashes and build info
      this.baselineData = {
        buildId: baselineBuild.id,
        buildName: baselineBuild.name,
        environment,
        branch,
        threshold: this.threshold,
        createdAt: new Date().toISOString(),
        buildInfo: {
          commitSha: baselineBuild.commit_sha,
          commitMessage: baselineBuild.commit_message,
          approvalStatus: baselineBuild.approval_status,
          completedAt: baselineBuild.completed_at,
        },
        screenshots: buildDetails.screenshots
          .map(s => {
            let sanitizedName;
            try {
              sanitizedName = sanitizeScreenshotName(s.name);
            } catch (error) {
              logger.warn(
                `Screenshot name sanitization failed for '${s.name}': ${error.message}`
              );
              return null; // Skip invalid screenshots
            }

            let properties = validateScreenshotProperties(
              s.metadata || s.properties || {}
            );
            let signature = generateScreenshotSignature(
              sanitizedName,
              properties
            );
            let filename = signatureToFilename(signature);

            return {
              name: sanitizedName,
              originalName: s.name,
              sha256: s.sha256, // Store remote SHA for quick comparison
              id: s.id,
              properties: properties,
              path: safePath(this.baselinePath, `${filename}.png`),
              signature: signature,
              originalUrl: s.original_url,
              fileSize: s.file_size_bytes,
              dimensions: {
                width: s.width,
                height: s.height,
              },
            };
          })
          .filter(Boolean), // Remove null entries from invalid screenshots
      };

      const metadataPath = join(this.baselinePath, 'metadata.json');
      writeFileSync(metadataPath, JSON.stringify(this.baselineData, null, 2));

      // Save baseline build metadata for MCP plugin
      const baselineMetadataPath = safePath(
        this.workingDir,
        '.vizzly',
        'baseline-metadata.json'
      );
      const buildMetadata = {
        buildId: baselineBuild.id,
        buildName: baselineBuild.name,
        branch: branch,
        environment: environment,
        commitSha: baselineBuild.commit_sha,
        commitMessage: baselineBuild.commit_message,
        approvalStatus: baselineBuild.approval_status,
        completedAt: baselineBuild.completed_at,
        downloadedAt: new Date().toISOString(),
      };
      writeFileSync(
        baselineMetadataPath,
        JSON.stringify(buildMetadata, null, 2)
      );

      // Final summary
      const actualDownloads = downloadedCount - skippedCount;

      if (skippedCount > 0) {
        // All skipped (up-to-date)
        if (actualDownloads === 0) {
          logger.info(
            `✅ All ${skippedCount} baselines up-to-date (matching local SHA)`
          );
        } else {
          // Mixed: some downloaded, some skipped
          logger.info(
            `✅ Downloaded ${actualDownloads} new screenshots, ${skippedCount} already up-to-date`
          );
        }
      } else {
        // Fresh download
        logger.info(
          `✅ Downloaded ${downloadedCount}/${buildDetails.screenshots.length} screenshots successfully`
        );
      }

      if (errorCount > 0) {
        logger.warn(`⚠️  ${errorCount} screenshots failed to download`);
      }
      return this.baselineData;
    } catch (error) {
      logger.error(`❌ Failed to download baseline: ${error.message}`);
      throw error;
    }
  }

  /**
   * Handle local baseline logic (either load existing or prepare for new baselines)
   * @returns {Promise<Object|null>} Baseline data or null if no local baselines exist
   */
  async handleLocalBaselines() {
    // Check if we're in baseline update mode - skip loading existing baselines
    if (this.setBaseline) {
      logger.info(
        '📁 Ready for new baseline creation - all screenshots will be treated as new baselines'
      );

      // Reset baseline data since we're creating new ones
      this.baselineData = null;
      return null;
    }

    const baseline = await this.loadBaseline();

    if (!baseline) {
      if (this.config.apiKey) {
        logger.info(
          '📥 No local baseline found, but API key available for future remote fetching'
        );
        logger.info('🆕 Current run will create new local baselines');
      } else {
        logger.info(
          '📝 No local baseline found and no API token - all screenshots will be marked as new'
        );
      }
      return null;
    } else {
      logger.info(
        `✅ Using existing baseline: ${colors.cyan(baseline.buildName)}`
      );
      return baseline;
    }
  }

  async loadBaseline() {
    // In baseline update mode, never load existing baselines
    if (this.setBaseline) {
      logger.debug('🐻 Baseline update mode - skipping baseline loading');
      return null;
    }

    const metadataPath = join(this.baselinePath, 'metadata.json');

    if (!existsSync(metadataPath)) {
      return null;
    }

    try {
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
      this.baselineData = metadata;
      this.threshold = metadata.threshold || this.threshold;
      return metadata;
    } catch (error) {
      logger.error(`❌ Failed to load baseline metadata: ${error.message}`);
      return null;
    }
  }

  async compareScreenshot(name, imageBuffer, properties = {}) {
    // Sanitize screenshot name and validate properties
    let sanitizedName;
    try {
      sanitizedName = sanitizeScreenshotName(name);
    } catch (error) {
      logger.error(`Invalid screenshot name '${name}': ${error.message}`);
      throw new Error(`Screenshot name validation failed: ${error.message}`);
    }

    let validatedProperties;
    try {
      validatedProperties = validateScreenshotProperties(properties);
    } catch (error) {
      logger.warn(
        `Property validation failed for '${sanitizedName}': ${error.message}`
      );
      validatedProperties = {};
    }

    // Normalize properties to match backend format (viewport_width at top level)
    // This ensures signature generation matches backend's screenshot-identity.js
    if (
      validatedProperties.viewport?.width &&
      !validatedProperties.viewport_width
    ) {
      validatedProperties.viewport_width = validatedProperties.viewport.width;
    }

    // Generate signature for baseline matching (name + viewport_width + browser)
    const signature = generateScreenshotSignature(
      sanitizedName,
      validatedProperties
    );
    const filename = signatureToFilename(signature);

    logger.info(`📊 TDD Screenshot signature:`);
    logger.info(`   Name: ${sanitizedName}`);
    logger.info(`   Properties: ${JSON.stringify(validatedProperties)}`);
    logger.info(`   Signature: ${signature}`);
    logger.info(`   Filename: ${filename}.png`);

    const currentImagePath = safePath(this.currentPath, `${filename}.png`);
    const baselineImagePath = safePath(this.baselinePath, `${filename}.png`);
    const diffImagePath = safePath(this.diffPath, `${filename}.png`);

    // Save current screenshot
    writeFileSync(currentImagePath, imageBuffer);

    // Check if we're in baseline update mode - treat as first run, no comparisons
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
    const baselineExists = existsSync(baselineImagePath);
    if (!baselineExists) {
      logger.debug(
        `No baseline found for ${sanitizedName} - creating baseline`
      );
      logger.debug(`Path: ${baselineImagePath}`);
      logger.debug(`Size: ${imageBuffer.length} bytes`);

      // Copy current screenshot to baseline directory for future comparisons
      writeFileSync(baselineImagePath, imageBuffer);
      logger.debug(`Created baseline: ${imageBuffer.length} bytes`);

      // Update or create baseline metadata
      if (!this.baselineData) {
        this.baselineData = {
          buildId: 'local-baseline',
          buildName: 'Local TDD Baseline',
          environment: 'test',
          branch: 'local',
          threshold: this.threshold,
          screenshots: [],
        };
      }

      // Add screenshot to baseline metadata
      const screenshotEntry = {
        name: sanitizedName,
        properties: validatedProperties,
        path: baselineImagePath,
        signature: signature,
      };

      const existingIndex = this.baselineData.screenshots.findIndex(
        s => s.signature === signature
      );
      if (existingIndex >= 0) {
        this.baselineData.screenshots[existingIndex] = screenshotEntry;
      } else {
        this.baselineData.screenshots.push(screenshotEntry);
      }

      // Save updated metadata
      const metadataPath = join(this.baselinePath, 'metadata.json');
      writeFileSync(metadataPath, JSON.stringify(this.baselineData, null, 2));

      logger.debug(`✅ Created baseline for ${sanitizedName}`);

      const result = {
        id: generateComparisonId(signature),
        name: sanitizedName,
        status: 'new',
        baseline: baselineImagePath,
        current: currentImagePath,
        diff: null,
        properties: validatedProperties,
        signature,
      };

      this.comparisons.push(result);
      return result;
    }

    // Baseline exists - compare with it
    try {
      // Log file sizes for debugging
      const baselineSize = readFileSync(baselineImagePath).length;
      const currentSize = readFileSync(currentImagePath).length;
      logger.debug(`Comparing ${sanitizedName}`);
      logger.debug(`Baseline: ${baselineImagePath} (${baselineSize} bytes)`);
      logger.debug(`Current:  ${currentImagePath} (${currentSize} bytes)`);

      // Try to compare - honeydiff will throw if dimensions don't match
      const result = await compare(baselineImagePath, currentImagePath, {
        colorThreshold: this.threshold, // YIQ color threshold (0.0-1.0), default 0.1
        antialiasing: true,
        diffPath: diffImagePath,
        overwrite: true,
        includeClusters: true, // Enable spatial clustering analysis
      });

      if (!result.isDifferent) {
        // Images match
        const comparison = {
          id: generateComparisonId(signature),
          name: sanitizedName,
          status: 'passed',
          baseline: baselineImagePath,
          current: currentImagePath,
          diff: null,
          properties: validatedProperties,
          signature,
          threshold: this.threshold,
          // Include honeydiff metrics even for passing comparisons
          totalPixels: result.totalPixels,
          aaPixelsIgnored: result.aaPixelsIgnored,
          aaPercentage: result.aaPercentage,
        };

        logger.debug(`PASSED ${sanitizedName}`);
        this.comparisons.push(comparison);
        return comparison;
      } else {
        // Images differ
        let diffInfo = ` (${result.diffPercentage.toFixed(2)}% different, ${result.diffPixels} pixels)`;

        // Add cluster info to log if available
        if (result.diffClusters && result.diffClusters.length > 0) {
          diffInfo += `, ${result.diffClusters.length} region${result.diffClusters.length > 1 ? 's' : ''}`;
        }

        const comparison = {
          id: generateComparisonId(signature),
          name: sanitizedName,
          status: 'failed',
          baseline: baselineImagePath,
          current: currentImagePath,
          diff: diffImagePath,
          properties: validatedProperties,
          signature,
          threshold: this.threshold,
          diffPercentage: result.diffPercentage,
          diffCount: result.diffPixels,
          reason: 'pixel-diff',
          // Honeydiff metrics
          totalPixels: result.totalPixels,
          aaPixelsIgnored: result.aaPixelsIgnored,
          aaPercentage: result.aaPercentage,
          boundingBox: result.boundingBox,
          heightDiff: result.heightDiff,
          intensityStats: result.intensityStats,
          diffClusters: result.diffClusters,
        };

        logger.warn(
          `❌ ${colors.red('FAILED')} ${sanitizedName} - differences detected${diffInfo}`
        );
        logger.info(`    Diff saved to: ${diffImagePath}`);
        this.comparisons.push(comparison);
        return comparison;
      }
    } catch (error) {
      // Check if error is due to dimension mismatch
      const isDimensionMismatch =
        error.message && error.message.includes("Image dimensions don't match");

      if (isDimensionMismatch) {
        // Different dimensions = different screenshot signature
        // This shouldn't happen if signatures are working correctly, but handle gracefully
        logger.warn(
          `⚠️  Dimension mismatch for ${sanitizedName} - baseline file exists but has different dimensions`
        );
        logger.warn(
          `   This indicates a signature collision. Creating new baseline with correct signature.`
        );
        logger.debug(`   Error: ${error.message}`);

        // Create a new baseline for this screenshot (overwriting the incorrect one)
        writeFileSync(baselineImagePath, imageBuffer);

        // Update baseline metadata
        if (!this.baselineData) {
          this.baselineData = {
            buildId: 'local-baseline',
            buildName: 'Local TDD Baseline',
            environment: 'test',
            branch: 'local',
            threshold: this.threshold,
            screenshots: [],
          };
        }

        const screenshotEntry = {
          name: sanitizedName,
          properties: validatedProperties,
          path: baselineImagePath,
          signature: signature,
        };

        const existingIndex = this.baselineData.screenshots.findIndex(
          s => s.signature === signature
        );
        if (existingIndex >= 0) {
          this.baselineData.screenshots[existingIndex] = screenshotEntry;
        } else {
          this.baselineData.screenshots.push(screenshotEntry);
        }

        const metadataPath = join(this.baselinePath, 'metadata.json');
        writeFileSync(metadataPath, JSON.stringify(this.baselineData, null, 2));

        logger.info(
          `✅ Created new baseline for ${sanitizedName} (different dimensions)`
        );

        const comparison = {
          id: generateComparisonId(signature),
          name: sanitizedName,
          status: 'new',
          baseline: baselineImagePath,
          current: currentImagePath,
          diff: null,
          properties: validatedProperties,
          signature,
        };

        this.comparisons.push(comparison);
        return comparison;
      }

      // Handle other file errors or issues
      logger.error(`❌ Error comparing ${sanitizedName}: ${error.message}`);

      const comparison = {
        id: generateComparisonId(signature),
        name: sanitizedName,
        status: 'error',
        baseline: baselineImagePath,
        current: currentImagePath,
        diff: null,
        properties: validatedProperties,
        signature,
        error: error.message,
      };

      this.comparisons.push(comparison);
      return comparison;
    }
  }

  getResults() {
    const passed = this.comparisons.filter(c => c.status === 'passed').length;
    const failed = this.comparisons.filter(c => c.status === 'failed').length;
    const newScreenshots = this.comparisons.filter(
      c => c.status === 'new'
    ).length;
    const errors = this.comparisons.filter(c => c.status === 'error').length;

    return {
      total: this.comparisons.length,
      passed,
      failed,
      new: newScreenshots,
      errors,
      comparisons: this.comparisons,
      baseline: this.baselineData,
    };
  }

  async printResults() {
    const results = this.getResults();

    logger.info('\n📊 TDD Results:');
    logger.info(`Total: ${colors.cyan(results.total)}`);
    logger.info(`Passed: ${colors.green(results.passed)}`);

    if (results.failed > 0) {
      logger.info(`Failed: ${colors.red(results.failed)}`);
    }

    if (results.new > 0) {
      logger.info(`New: ${colors.yellow(results.new)}`);
    }

    if (results.errors > 0) {
      logger.info(`Errors: ${colors.red(results.errors)}`);
    }

    // Show failed comparisons
    const failedComparisons = results.comparisons.filter(
      c => c.status === 'failed'
    );
    if (failedComparisons.length > 0) {
      logger.info('\n❌ Failed comparisons:');
      failedComparisons.forEach(comp => {
        logger.info(`  • ${comp.name}`);
      });
    }

    // Show new screenshots
    const newComparisons = results.comparisons.filter(c => c.status === 'new');
    if (newComparisons.length > 0) {
      logger.info('\n📸 New screenshots:');
      newComparisons.forEach(comp => {
        logger.info(`  • ${comp.name}`);
      });
    }

    // Generate HTML report
    await this.generateHtmlReport(results);

    return results;
  }

  /**
   * Generate HTML report for TDD results
   * @param {Object} results - TDD comparison results
   */
  async generateHtmlReport(results) {
    try {
      const reportGenerator = new HtmlReportGenerator(
        this.workingDir,
        this.config
      );
      const reportPath = await reportGenerator.generateReport(results, {
        baseline: this.baselineData,
        threshold: this.threshold,
      });

      // Show report path (always clickable)
      logger.info(
        `\n🐻 View detailed report: ${colors.cyan('file://' + reportPath)}`
      );

      // Auto-open if configured
      if (this.config.tdd?.openReport) {
        await this.openReport(reportPath);
      }

      return reportPath;
    } catch (error) {
      logger.warn(`Failed to generate HTML report: ${error.message}`);
    }
  }

  /**
   * Open HTML report in default browser
   * @param {string} reportPath - Path to HTML report
   */
  async openReport(reportPath) {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      let command;
      switch (process.platform) {
        case 'darwin': // macOS
          command = `open "${reportPath}"`;
          break;
        case 'win32': // Windows
          command = `start "" "${reportPath}"`;
          break;
        default: // Linux and others
          command = `xdg-open "${reportPath}"`;
          break;
      }

      await execAsync(command);
      logger.info('📖 Report opened in browser');
    } catch (error) {
      logger.debug(`Failed to open report: ${error.message}`);
    }
  }

  /**
   * Update baselines with current screenshots (accept changes)
   * @returns {number} Number of baselines updated
   */
  updateBaselines() {
    if (this.comparisons.length === 0) {
      logger.warn('No comparisons found - nothing to update');
      return 0;
    }

    let updatedCount = 0;

    // Initialize baseline data if it doesn't exist
    if (!this.baselineData) {
      this.baselineData = {
        buildId: 'local-baseline',
        buildName: 'Local TDD Baseline',
        environment: 'test',
        branch: 'local',
        threshold: this.threshold,
        screenshots: [],
      };
    }

    for (const comparison of this.comparisons) {
      const { name, current } = comparison;

      if (!current || !existsSync(current)) {
        logger.warn(`Current screenshot not found for ${name}, skipping`);
        continue;
      }

      // Sanitize screenshot name for security
      let sanitizedName;
      try {
        sanitizedName = sanitizeScreenshotName(name);
      } catch (error) {
        logger.warn(
          `Skipping baseline update for invalid name '${name}': ${error.message}`
        );
        continue;
      }

      let validatedProperties = validateScreenshotProperties(
        comparison.properties || {}
      );
      let signature = generateScreenshotSignature(
        sanitizedName,
        validatedProperties
      );
      let filename = signatureToFilename(signature);

      const baselineImagePath = safePath(this.baselinePath, `${filename}.png`);

      try {
        // Copy current screenshot to baseline
        const currentBuffer = readFileSync(current);
        writeFileSync(baselineImagePath, currentBuffer);

        // Update baseline metadata
        const screenshotEntry = {
          name: sanitizedName,
          properties: validatedProperties,
          path: baselineImagePath,
          signature: signature,
        };

        const existingIndex = this.baselineData.screenshots.findIndex(
          s => s.signature === signature
        );
        if (existingIndex >= 0) {
          this.baselineData.screenshots[existingIndex] = screenshotEntry;
        } else {
          this.baselineData.screenshots.push(screenshotEntry);
        }

        updatedCount++;
        logger.info(`✅ Updated baseline for ${sanitizedName}`);
      } catch (error) {
        logger.error(
          `❌ Failed to update baseline for ${sanitizedName}: ${error.message}`
        );
      }
    }

    // Save updated metadata
    if (updatedCount > 0) {
      try {
        const metadataPath = join(this.baselinePath, 'metadata.json');
        writeFileSync(metadataPath, JSON.stringify(this.baselineData, null, 2));
        logger.info(`✅ Updated ${updatedCount} baseline(s)`);
      } catch (error) {
        logger.error(`❌ Failed to save baseline metadata: ${error.message}`);
      }
    }

    return updatedCount;
  }

  /**
   * Create a new baseline (used during --set-baseline mode)
   * @private
   */
  createNewBaseline(
    name,
    imageBuffer,
    properties,
    currentImagePath,
    baselineImagePath
  ) {
    logger.info(`🐻 Creating baseline for ${name}`);

    // Copy current screenshot to baseline directory
    writeFileSync(baselineImagePath, imageBuffer);

    // Update or create baseline metadata
    if (!this.baselineData) {
      this.baselineData = {
        buildId: 'local-baseline',
        buildName: 'Local TDD Baseline',
        environment: 'test',
        branch: 'local',
        threshold: this.threshold,
        screenshots: [],
      };
    }

    // Generate signature for this screenshot
    let signature = generateScreenshotSignature(name, properties || {});

    // Add screenshot to baseline metadata
    const screenshotEntry = {
      name,
      properties: properties || {},
      path: baselineImagePath,
      signature: signature,
    };

    const existingIndex = this.baselineData.screenshots.findIndex(
      s => s.signature === signature
    );
    if (existingIndex >= 0) {
      this.baselineData.screenshots[existingIndex] = screenshotEntry;
    } else {
      this.baselineData.screenshots.push(screenshotEntry);
    }

    // Save updated metadata
    const metadataPath = join(this.baselinePath, 'metadata.json');
    writeFileSync(metadataPath, JSON.stringify(this.baselineData, null, 2));

    const result = {
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
    logger.info(`✅ Baseline created for ${name}`);
    return result;
  }

  /**
   * Update a single baseline with current screenshot
   * @private
   */
  updateSingleBaseline(
    name,
    imageBuffer,
    properties,
    currentImagePath,
    baselineImagePath
  ) {
    logger.info(`🐻 Setting baseline for ${name}`);

    // Copy current screenshot to baseline directory
    writeFileSync(baselineImagePath, imageBuffer);

    // Update or create baseline metadata
    if (!this.baselineData) {
      this.baselineData = {
        buildId: 'local-baseline',
        buildName: 'Local TDD Baseline',
        environment: 'test',
        branch: 'local',
        threshold: this.threshold,
        screenshots: [],
      };
    }

    // Generate signature for this screenshot
    let signature = generateScreenshotSignature(name, properties || {});

    // Add screenshot to baseline metadata
    const screenshotEntry = {
      name,
      properties: properties || {},
      path: baselineImagePath,
      signature: signature,
    };

    const existingIndex = this.baselineData.screenshots.findIndex(
      s => s.signature === signature
    );
    if (existingIndex >= 0) {
      this.baselineData.screenshots[existingIndex] = screenshotEntry;
    } else {
      this.baselineData.screenshots.push(screenshotEntry);
    }

    // Save updated metadata
    const metadataPath = join(this.baselinePath, 'metadata.json');
    writeFileSync(metadataPath, JSON.stringify(this.baselineData, null, 2));

    const result = {
      id: generateComparisonId(signature),
      name,
      status: 'baseline-updated',
      baseline: baselineImagePath,
      current: currentImagePath,
      diff: null,
      properties,
      signature,
    };

    this.comparisons.push(result);
    logger.info(`🐻 Baseline set for ${name}`);
    return result;
  }

  /**
   * Accept a current screenshot as the new baseline
   * @param {string} id - Comparison ID to accept (generated from signature)
   * @returns {Object} Result object
   */
  async acceptBaseline(id) {
    // Find the comparison by ID
    let comparison = this.comparisons.find(c => c.id === id);
    if (!comparison) {
      throw new Error(`No comparison found with ID: ${id}`);
    }

    const sanitizedName = comparison.name;

    let properties = comparison.properties || {};
    let signature = generateScreenshotSignature(sanitizedName, properties);
    let filename = signatureToFilename(signature);

    // Find the current screenshot file
    const currentImagePath = safePath(this.currentPath, `${filename}.png`);

    if (!existsSync(currentImagePath)) {
      logger.error(`Current screenshot not found at: ${currentImagePath}`);
      throw new Error(
        `Current screenshot not found: ${sanitizedName} (looked at ${currentImagePath})`
      );
    }

    // Read the current image
    const imageBuffer = readFileSync(currentImagePath);

    // Create baseline directory if it doesn't exist
    if (!existsSync(this.baselinePath)) {
      mkdirSync(this.baselinePath, { recursive: true });
    }

    // Update the baseline
    const baselineImagePath = safePath(this.baselinePath, `${filename}.png`);

    // Write the baseline image directly
    writeFileSync(baselineImagePath, imageBuffer);

    // Verify the write
    if (!existsSync(baselineImagePath)) {
      logger.error(`Baseline file does not exist after write!`);
    }

    // Update baseline metadata
    if (!this.baselineData) {
      this.baselineData = {
        buildId: 'local-baseline',
        buildName: 'Local TDD Baseline',
        environment: 'test',
        branch: 'local',
        threshold: this.threshold,
        screenshots: [],
      };
    }

    // Add or update screenshot in baseline metadata
    const screenshotEntry = {
      name: sanitizedName,
      properties: properties,
      path: baselineImagePath,
      signature: signature,
    };

    const existingIndex = this.baselineData.screenshots.findIndex(
      s => s.signature === signature
    );
    if (existingIndex >= 0) {
      this.baselineData.screenshots[existingIndex] = screenshotEntry;
    } else {
      this.baselineData.screenshots.push(screenshotEntry);
    }

    // Save updated metadata
    const metadataPath = join(this.baselinePath, 'metadata.json');
    writeFileSync(metadataPath, JSON.stringify(this.baselineData, null, 2));
    return {
      name: sanitizedName,
      status: 'accepted',
      message: 'Screenshot accepted as new baseline',
    };
  }
}
