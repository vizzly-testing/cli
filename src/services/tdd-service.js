/**
 * TDD Service - Local Visual Testing
 *
 * ⚠️  CRITICAL: Signature/filename generation MUST stay in sync with the cloud!
 *
 * Cloud counterpart: vizzly/src/utils/screenshot-identity.js
 *   - generateScreenshotSignature()
 *   - generateBaselineFilename()
 *
 * Contract tests: Both repos have golden tests that must produce identical values:
 *   - Cloud: tests/contracts/signature-parity.test.js
 *   - CLI:   tests/contracts/signature-parity.spec.js
 *
 * If you modify signature or filename generation here, you MUST:
 *   1. Make the same change in the cloud repo
 *   2. Update golden test values in BOTH repos
 *   3. Run contract tests in both repos to verify parity
 *
 * The signature format is: name|viewport_width|browser|custom1|custom2|...
 * The filename format is: {sanitized-name}_{12-char-sha256-hash}.png
 */

import crypto from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { compare } from '@vizzly-testing/honeydiff';
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
import { HtmlReportGenerator } from './html-report-generator.js';

/**
 * Generate a screenshot signature for baseline matching
 *
 * ⚠️  SYNC WITH: vizzly/src/utils/screenshot-identity.js - generateScreenshotSignature()
 *
 * Uses same logic as cloud: name + viewport_width + browser + custom properties
 *
 * @param {string} name - Screenshot name
 * @param {Object} properties - Screenshot properties (viewport, browser, metadata, etc.)
 * @param {Array<string>} customProperties - Custom property names from project settings
 * @returns {string} Signature like "Login|1920|chrome|iPhone 15 Pro"
 */
function generateScreenshotSignature(
  name,
  properties = {},
  customProperties = []
) {
  // Match cloud screenshot-identity.js behavior exactly:
  // Always include all default properties (name, viewport_width, browser)
  // even if null/undefined, using empty string as placeholder
  const defaultProperties = ['name', 'viewport_width', 'browser'];
  const allProperties = [...defaultProperties, ...customProperties];

  const parts = allProperties.map(propName => {
    let value;

    if (propName === 'name') {
      value = name;
    } else if (propName === 'viewport_width') {
      // Check for viewport_width as top-level property first (backend format)
      value = properties.viewport_width;
      // Fallback to nested viewport.width (SDK format)
      if (value === null || value === undefined) {
        value = properties.viewport?.width;
      }
    } else if (propName === 'browser') {
      value = properties.browser;
    } else {
      // Custom property - check multiple locations
      value =
        properties[propName] ??
        properties.metadata?.[propName] ??
        properties.metadata?.properties?.[propName];
    }

    // Handle null/undefined values consistently (match cloud behavior)
    if (value === null || value === undefined) {
      return '';
    }

    // Convert to string and normalize
    return String(value).trim();
  });

  return parts.join('|');
}

/**
 * Generate a stable, filesystem-safe filename for a screenshot baseline
 * Uses a hash of the signature to avoid character encoding issues
 * Matches the cloud's generateBaselineFilename implementation exactly
 *
 * @param {string} name - Screenshot name
 * @param {string} signature - Full signature string
 * @returns {string} Filename like "homepage_a1b2c3d4e5f6.png"
 */
function generateBaselineFilename(name, signature) {
  const hash = crypto
    .createHash('sha256')
    .update(signature)
    .digest('hex')
    .slice(0, 12);

  // Sanitize the name for filesystem safety
  const safeName = name
    .replace(/[/\\:*?"<>|]/g, '') // Remove unsafe chars
    .replace(/\s+/g, '-') // Spaces to hyphens
    .slice(0, 50); // Limit length

  return `${safeName}_${hash}.png`;
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
      allowNoToken: true, // TDD can run without a token to create new screenshots
    });

    // Validate and secure the working directory
    try {
      this.workingDir = validatePathSecurity(workingDir, workingDir);
    } catch (error) {
      output.error(`Invalid working directory: ${error.message}`);
      throw new Error(`Working directory validation failed: ${error.message}`);
    }

    // Use safe path construction for subdirectories
    this.baselinePath = safePath(this.workingDir, '.vizzly', 'baselines');
    this.currentPath = safePath(this.workingDir, '.vizzly', 'current');
    this.diffPath = safePath(this.workingDir, '.vizzly', 'diffs');
    this.baselineData = null;
    this.comparisons = [];
    this.threshold = config.comparison?.threshold || 2.0;
    this.minClusterSize = config.comparison?.minClusterSize ?? 2; // Filter single-pixel noise by default
    this.signatureProperties = []; // Custom properties from project's baseline_signature_properties

    // Check if we're in baseline update mode
    if (this.setBaseline) {
      output.info(
        '🐻 Baseline update mode - will overwrite existing baselines with new ones'
      );
    }

    // Ensure directories exist
    [this.baselinePath, this.currentPath, this.diffPath].forEach(dir => {
      if (!existsSync(dir)) {
        try {
          mkdirSync(dir, { recursive: true });
        } catch (error) {
          output.error(`Failed to create directory ${dir}: ${error.message}`);
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
        // Use the tdd-baselines endpoint which returns pre-computed filenames
        let apiResponse = await this.api.getTddBaselines(buildId);

        if (!apiResponse) {
          throw new Error(`Build ${buildId} not found or API returned null`);
        }

        // When downloading baselines, always start with a clean slate
        // This handles signature property changes, build switches, and any stale state
        output.info('Clearing local state before downloading baselines...');
        try {
          // Clear everything - baselines, current screenshots, diffs, and metadata
          // This ensures we start fresh with the new baseline build
          rmSync(this.baselinePath, { recursive: true, force: true });
          rmSync(this.currentPath, { recursive: true, force: true });
          rmSync(this.diffPath, { recursive: true, force: true });
          mkdirSync(this.baselinePath, { recursive: true });
          mkdirSync(this.currentPath, { recursive: true });
          mkdirSync(this.diffPath, { recursive: true });

          // Clear baseline metadata file (will be regenerated with new baseline)
          const baselineMetadataPath = safePath(
            this.workingDir,
            '.vizzly',
            'baseline-metadata.json'
          );
          if (existsSync(baselineMetadataPath)) {
            rmSync(baselineMetadataPath, { force: true });
          }
        } catch (error) {
          output.error(`Failed to clear local state: ${error.message}`);
        }

        // Extract signature properties from API response (for variant support)
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

        // Check build status and warn if it's not successful
        if (baselineBuild.status === 'failed') {
          output.warn(
            `⚠️  Build ${buildId} is marked as FAILED - falling back to local baselines`
          );
          output.info(
            `💡 To use remote baselines, specify a successful build ID instead`
          );
          return await this.handleLocalBaselines();
        } else if (baselineBuild.status !== 'completed') {
          output.warn(
            `⚠️  Build ${buildId} has status: ${baselineBuild.status} (expected: completed)`
          );
        }

        // Attach screenshots to build for unified processing below
        baselineBuild.screenshots = apiResponse.screenshots;
      } else if (comparisonId) {
        // Use specific comparison ID - download only this comparison's baseline screenshot
        output.info(`Using comparison: ${comparisonId}`);
        const comparison = await this.api.getComparison(comparisonId);

        // A comparison doesn't have baselineBuild directly - we need to get it
        // The comparison has baseline_screenshot which contains the build_id
        if (!comparison.baseline_screenshot) {
          throw new Error(
            `Comparison ${comparisonId} has no baseline screenshot. This comparison may be a "new" screenshot with no baseline to compare against.`
          );
        }

        // The original_url might be in baseline_screenshot.original_url or comparison.baseline_screenshot_url
        const baselineUrl =
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
        const screenshotProperties = {};

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

        output.info(
          `📊 Extracted properties for signature: ${JSON.stringify(screenshotProperties)}`
        );

        // Generate filename locally for comparison path (we don't have API-provided filename)
        const screenshotName =
          comparison.baseline_name || comparison.current_name;
        const signature = generateScreenshotSignature(
          screenshotName,
          screenshotProperties,
          this.signatureProperties
        );
        const filename = generateBaselineFilename(screenshotName, signature);

        // For a specific comparison, we only download that one baseline screenshot
        // Create a mock build structure with just this one screenshot
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
              filename: filename, // Generated locally for comparison path
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
          output.warn(
            `⚠️  No baseline builds found for ${environment}/${branch}`
          );
          output.info(
            '💡 Run a build in normal mode first to create baselines'
          );
          return null;
        }

        // Use getTddBaselines to get screenshots with pre-computed filenames
        const apiResponse = await this.api.getTddBaselines(builds.data[0].id);

        if (!apiResponse) {
          throw new Error(
            `Build ${builds.data[0].id} not found or API returned null`
          );
        }

        // Extract signature properties from API response (for variant support)
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

      // For both buildId and getBuilds paths, we now have screenshots with filenames
      // For comparisonId, we created a mock build with just the one screenshot
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

      // Check existing baseline metadata for efficient SHA comparison
      let existingBaseline = await this.loadBaseline();
      let existingShaMap = new Map();

      if (existingBaseline) {
        existingBaseline.screenshots.forEach(s => {
          if (s.sha256 && s.filename) {
            existingShaMap.set(s.filename, s.sha256);
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
          output.warn(
            `Skipping screenshot with invalid name '${screenshot.name}': ${error.message}`
          );
          errorCount++;
          continue;
        }

        // Use API-provided filename (required from tdd-baselines endpoint)
        // This ensures filenames match between cloud and local TDD
        let filename = screenshot.filename;
        if (!filename) {
          output.warn(
            `⚠️  Screenshot ${sanitizedName} has no filename from API - skipping`
          );
          errorCount++;
          continue;
        }

        let imagePath = safePath(this.baselinePath, filename);

        // Check if we already have this file with the same SHA
        if (existsSync(imagePath) && screenshot.sha256) {
          let storedSha = existingShaMap.get(filename);
          if (storedSha === screenshot.sha256) {
            downloadedCount++;
            skippedCount++;
            continue;
          }
        }

        // Use original_url as the download URL
        const downloadUrl = screenshot.original_url || screenshot.url;

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
      const actualDownloadsNeeded = screenshotsToProcess.length;
      if (actualDownloadsNeeded > 0) {
        output.info(
          `📥 Downloading ${actualDownloadsNeeded} new/updated screenshots in batches of ${batchSize}...`
        );

        for (let i = 0; i < screenshotsToProcess.length; i += batchSize) {
          const batch = screenshotsToProcess.slice(i, i + batchSize);
          const batchNum = Math.floor(i / batchSize) + 1;
          const totalBatches = Math.ceil(
            screenshotsToProcess.length / batchSize
          );

          output.info(
            `📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} screenshots)`
          );

          // Download batch concurrently
          const downloadPromises = batch.map(
            async ({ sanitizedName, imagePath, downloadUrl }) => {
              try {
                const response = await fetchWithTimeout(downloadUrl);
                if (!response.ok) {
                  throw new NetworkError(
                    `Failed to download ${sanitizedName}: ${response.statusText}`
                  );
                }

                const arrayBuffer = await response.arrayBuffer();
                const imageBuffer = Buffer.from(arrayBuffer);
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

          output.info(
            `📊 Progress: ${totalProcessed}/${totalScreenshots} (${progressPercent}%) - ${batchSuccesses} downloaded, ${batchFailures} failed in this batch`
          );
        }
      }

      // Check if we actually downloaded any screenshots
      if (downloadedCount === 0 && skippedCount === 0) {
        output.error(
          '❌ No screenshots were successfully downloaded from the baseline build'
        );
        if (errorCount > 0) {
          output.info(
            `💡 ${errorCount} screenshots had errors - check download URLs and network connection`
          );
        }
        output.info(
          '💡 This usually means the build failed or screenshots have no download URLs'
        );
        output.info(
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
        signatureProperties: this.signatureProperties, // Store for TDD comparison
        createdAt: new Date().toISOString(),
        buildInfo: {
          commitSha: baselineBuild.commit_sha,
          commitMessage: baselineBuild.commit_message,
          approvalStatus: baselineBuild.approval_status,
          completedAt: baselineBuild.completed_at,
        },
        screenshots: buildDetails.screenshots
          .filter(s => s.filename) // Only include screenshots with filenames
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
            dimensions: {
              width: s.width,
              height: s.height,
            },
          })),
      };

      const metadataPath = join(this.baselinePath, 'metadata.json');
      writeFileSync(metadataPath, JSON.stringify(this.baselineData, null, 2));

      // Download hotspot data for noise filtering
      await this.downloadHotspots(buildDetails.screenshots);

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
          output.info(
            `✅ All ${skippedCount} baselines up-to-date (matching local SHA)`
          );
        } else {
          // Mixed: some downloaded, some skipped
          output.info(
            `✅ Downloaded ${actualDownloads} new screenshots, ${skippedCount} already up-to-date`
          );
        }
      } else {
        // Fresh download
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
   * Download hotspot data for screenshots from the cloud
   * Hotspots identify regions that frequently change (timestamps, IDs, etc.)
   * Used to filter out known dynamic content during comparisons
   * @param {Array} screenshots - Array of screenshot objects with name property
   */
  async downloadHotspots(screenshots) {
    // Only attempt if we have an API token
    if (!this.config.apiKey) {
      output.debug(
        'tdd',
        'Skipping hotspot download - no API token configured'
      );
      return;
    }

    try {
      // Get unique screenshot names
      const screenshotNames = [...new Set(screenshots.map(s => s.name))];

      if (screenshotNames.length === 0) {
        return;
      }

      output.info(
        `🔥 Fetching hotspot data for ${screenshotNames.length} screenshots...`
      );

      // Use batch endpoint for efficiency
      const response = await this.api.getBatchHotspots(screenshotNames);

      if (!response.hotspots || Object.keys(response.hotspots).length === 0) {
        output.debug('tdd', 'No hotspot data available from cloud');
        return;
      }

      // Store hotspots in a separate file for easy access during comparisons
      this.hotspotData = response.hotspots;

      const hotspotsPath = safePath(
        this.workingDir,
        '.vizzly',
        'hotspots.json'
      );
      writeFileSync(
        hotspotsPath,
        JSON.stringify(
          {
            downloadedAt: new Date().toISOString(),
            summary: response.summary,
            hotspots: response.hotspots,
          },
          null,
          2
        )
      );

      const hotspotCount = Object.keys(response.hotspots).length;
      const totalRegions = Object.values(response.hotspots).reduce(
        (sum, h) => sum + (h.regions?.length || 0),
        0
      );

      output.info(
        `✅ Downloaded hotspot data for ${hotspotCount} screenshots (${totalRegions} regions total)`
      );
    } catch (error) {
      // Don't fail baseline download if hotspot fetch fails
      output.debug('tdd', `Hotspot download failed: ${error.message}`);
      output.warn(
        '⚠️  Could not fetch hotspot data - comparisons will run without noise filtering'
      );
    }
  }

  /**
   * Load hotspot data from disk
   * @returns {Object|null} Hotspot data keyed by screenshot name, or null if not available
   */
  loadHotspots() {
    try {
      const hotspotsPath = safePath(
        this.workingDir,
        '.vizzly',
        'hotspots.json'
      );
      if (!existsSync(hotspotsPath)) {
        return null;
      }
      const data = JSON.parse(readFileSync(hotspotsPath, 'utf8'));
      return data.hotspots || null;
    } catch (error) {
      output.debug('tdd', `Failed to load hotspots: ${error.message}`);
      return null;
    }
  }

  /**
   * Get hotspot analysis for a specific screenshot
   * @param {string} screenshotName - Name of the screenshot
   * @returns {Object|null} Hotspot analysis or null if not available
   */
  getHotspotForScreenshot(screenshotName) {
    // Check memory cache first
    if (this.hotspotData?.[screenshotName]) {
      return this.hotspotData[screenshotName];
    }

    // Try loading from disk
    if (!this.hotspotData) {
      this.hotspotData = this.loadHotspots();
    }

    return this.hotspotData?.[screenshotName] || null;
  }

  /**
   * Calculate what percentage of diff falls within hotspot regions
   * Uses 1D Y-coordinate matching (same algorithm as cloud)
   * @param {Array} diffClusters - Array of diff clusters from honeydiff
   * @param {Object} hotspotAnalysis - Hotspot data with regions array
   * @returns {Object} Coverage info { coverage, linesInHotspots, totalLines }
   */
  calculateHotspotCoverage(diffClusters, hotspotAnalysis) {
    if (!diffClusters || diffClusters.length === 0) {
      return { coverage: 0, linesInHotspots: 0, totalLines: 0 };
    }

    if (
      !hotspotAnalysis ||
      !hotspotAnalysis.regions ||
      hotspotAnalysis.regions.length === 0
    ) {
      return { coverage: 0, linesInHotspots: 0, totalLines: 0 };
    }

    // Extract Y-coordinates (diff lines) from clusters
    // Each cluster has a boundingBox with y and height
    let diffLines = [];
    for (const cluster of diffClusters) {
      if (cluster.boundingBox) {
        const { y, height } = cluster.boundingBox;
        // Add all Y lines covered by this cluster
        for (let line = y; line < y + height; line++) {
          diffLines.push(line);
        }
      }
    }

    if (diffLines.length === 0) {
      return { coverage: 0, linesInHotspots: 0, totalLines: 0 };
    }

    // Remove duplicates and sort
    diffLines = [...new Set(diffLines)].sort((a, b) => a - b);

    // Check how many diff lines fall within hotspot regions
    let linesInHotspots = 0;
    for (const line of diffLines) {
      const inHotspot = hotspotAnalysis.regions.some(
        region => line >= region.y1 && line <= region.y2
      );
      if (inHotspot) {
        linesInHotspots++;
      }
    }

    const coverage = linesInHotspots / diffLines.length;

    return {
      coverage,
      linesInHotspots,
      totalLines: diffLines.length,
    };
  }

  /**
   * Handle local baseline logic (either load existing or prepare for new baselines)
   * @returns {Promise<Object|null>} Baseline data or null if no local baselines exist
   */
  async handleLocalBaselines() {
    // Check if we're in baseline update mode - skip loading existing baselines
    if (this.setBaseline) {
      output.info(
        '📁 Ready for new baseline creation - all screenshots will be treated as new baselines'
      );

      // Reset baseline data since we're creating new ones
      this.baselineData = null;
      return null;
    }

    const baseline = await this.loadBaseline();

    if (!baseline) {
      if (this.config.apiKey) {
        output.info(
          '📥 No local baseline found, but API key available for future remote fetching'
        );
        output.info('🆕 Current run will create new local baselines');
      } else {
        output.info(
          '📝 No local baseline found and no API token - all screenshots will be marked as new'
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

  async loadBaseline() {
    // In baseline update mode, never load existing baselines
    if (this.setBaseline) {
      output.debug('tdd', 'baseline update mode - skipping loading');
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

      // Restore signature properties from saved metadata (for variant support)
      this.signatureProperties = metadata.signatureProperties || [];
      if (this.signatureProperties.length > 0) {
        output.debug(
          'tdd',
          `loaded signature properties: ${this.signatureProperties.join(', ')}`
        );
      }

      return metadata;
    } catch (error) {
      output.error(`❌ Failed to load baseline metadata: ${error.message}`);
      return null;
    }
  }

  async compareScreenshot(name, imageBuffer, properties = {}) {
    // Sanitize screenshot name and validate properties
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

    // Preserve metadata object through validation (validateScreenshotProperties strips non-primitives)
    // This is needed because signature generation checks properties.metadata.* for custom properties
    if (properties.metadata && typeof properties.metadata === 'object') {
      validatedProperties.metadata = properties.metadata;
    }

    // Normalize properties to match backend format (viewport_width at top level)
    // This ensures signature generation matches backend's screenshot-identity.js
    if (
      validatedProperties.viewport?.width &&
      !validatedProperties.viewport_width
    ) {
      validatedProperties.viewport_width = validatedProperties.viewport.width;
    }

    // Generate signature for baseline matching (name + viewport_width + browser + custom props)
    const signature = generateScreenshotSignature(
      sanitizedName,
      validatedProperties,
      this.signatureProperties
    );
    // Use hash-based filename for reliable matching (matches cloud format)
    const filename = generateBaselineFilename(sanitizedName, signature);

    const currentImagePath = safePath(this.currentPath, filename);
    const baselineImagePath = safePath(this.baselinePath, filename);
    const diffImagePath = safePath(this.diffPath, filename);

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
      // Copy current screenshot to baseline directory for future comparisons
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

      // Baseline creation tracked by event handler

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
      // Try to compare - honeydiff will throw if dimensions don't match
      const result = await compare(baselineImagePath, currentImagePath, {
        threshold: this.threshold, // CIEDE2000 Delta E (2.0 = recommended default)
        antialiasing: true,
        diffPath: diffImagePath,
        overwrite: true,
        includeClusters: true, // Enable spatial clustering analysis
        minClusterSize: this.minClusterSize, // Filter single-pixel noise (default: 2)
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

        // Result tracked by event handler
        this.comparisons.push(comparison);
        return comparison;
      } else {
        // Images differ - check if differences are in known hotspot regions
        const hotspotAnalysis = this.getHotspotForScreenshot(name);
        let hotspotCoverage = null;
        let isHotspotFiltered = false;

        if (
          hotspotAnalysis &&
          result.diffClusters &&
          result.diffClusters.length > 0
        ) {
          hotspotCoverage = this.calculateHotspotCoverage(
            result.diffClusters,
            hotspotAnalysis
          );

          // Consider it filtered if:
          // 1. High confidence hotspot data (score >= 70)
          // 2. 80%+ of the diff is within hotspot regions
          const isHighConfidence =
            hotspotAnalysis.confidence === 'high' ||
            (hotspotAnalysis.confidence_score &&
              hotspotAnalysis.confidence_score >= 70);

          if (isHighConfidence && hotspotCoverage.coverage >= 0.8) {
            isHotspotFiltered = true;
          }
        }

        let diffInfo = ` (${result.diffPercentage.toFixed(2)}% different, ${result.diffPixels} pixels)`;

        // Add cluster info to log if available
        if (result.diffClusters && result.diffClusters.length > 0) {
          diffInfo += `, ${result.diffClusters.length} region${result.diffClusters.length > 1 ? 's' : ''}`;
        }

        // Add hotspot info if applicable
        if (hotspotCoverage && hotspotCoverage.coverage > 0) {
          diffInfo += `, ${Math.round(hotspotCoverage.coverage * 100)}% in hotspots`;
        }

        const comparison = {
          id: generateComparisonId(signature),
          name: sanitizedName,
          status: isHotspotFiltered ? 'passed' : 'failed',
          baseline: baselineImagePath,
          current: currentImagePath,
          diff: diffImagePath,
          properties: validatedProperties,
          signature,
          threshold: this.threshold,
          diffPercentage: result.diffPercentage,
          diffCount: result.diffPixels,
          reason: isHotspotFiltered ? 'hotspot-filtered' : 'pixel-diff',
          // Honeydiff metrics
          totalPixels: result.totalPixels,
          aaPixelsIgnored: result.aaPixelsIgnored,
          aaPercentage: result.aaPercentage,
          boundingBox: result.boundingBox,
          heightDiff: result.heightDiff,
          intensityStats: result.intensityStats,
          diffClusters: result.diffClusters,
          // Hotspot analysis data
          hotspotAnalysis: hotspotCoverage
            ? {
                coverage: hotspotCoverage.coverage,
                linesInHotspots: hotspotCoverage.linesInHotspots,
                totalLines: hotspotCoverage.totalLines,
                confidence: hotspotAnalysis?.confidence,
                confidenceScore: hotspotAnalysis?.confidence_score,
                regionCount: hotspotAnalysis?.regions?.length || 0,
                isFiltered: isHotspotFiltered,
              }
            : null,
        };

        if (isHotspotFiltered) {
          output.info(
            `✅ ${colors.green('PASSED')} ${sanitizedName} - differences in known hotspots${diffInfo}`
          );
          output.debug(
            'tdd',
            `Hotspot filtered: ${Math.round(hotspotCoverage.coverage * 100)}% coverage, confidence: ${hotspotAnalysis.confidence}`
          );
        } else {
          output.warn(
            `❌ ${colors.red('FAILED')} ${sanitizedName} - differences detected${diffInfo}`
          );
          output.info(`    Diff saved to: ${diffImagePath}`);
        }

        this.comparisons.push(comparison);
        return comparison;
      }
    } catch (error) {
      // Check if error is due to dimension mismatch
      const isDimensionMismatch = error.message?.includes(
        "Image dimensions don't match"
      );

      if (isDimensionMismatch) {
        // Different dimensions = different screenshot signature
        // This shouldn't happen if signatures are working correctly, but handle gracefully
        output.warn(
          `⚠️  Dimension mismatch for ${sanitizedName} - baseline file exists but has different dimensions`
        );
        output.warn(
          `   This indicates a signature collision. Creating new baseline with correct signature.`
        );
        output.debug('tdd', 'dimension mismatch', { error: error.message });

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

        output.info(
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
      output.error(`❌ Error comparing ${sanitizedName}: ${error.message}`);

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

    // Show failed comparisons
    const failedComparisons = results.comparisons.filter(
      c => c.status === 'failed'
    );
    if (failedComparisons.length > 0) {
      output.info('\n❌ Failed comparisons:');
      failedComparisons.forEach(comp => {
        output.info(`  • ${comp.name}`);
      });
    }

    // Show new screenshots
    const newComparisons = results.comparisons.filter(c => c.status === 'new');
    if (newComparisons.length > 0) {
      output.info('\n📸 New screenshots:');
      newComparisons.forEach(comp => {
        output.info(`  • ${comp.name}`);
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
      output.info(
        `\n🐻 View detailed report: ${colors.cyan(`file://${reportPath}`)}`
      );

      // Auto-open if configured
      if (this.config.tdd?.openReport) {
        await this.openReport(reportPath);
      }

      return reportPath;
    } catch (error) {
      output.warn(`Failed to generate HTML report: ${error.message}`);
    }
  }

  /**
   * Open HTML report in default browser
   * @param {string} reportPath - Path to HTML report
   */
  async openReport(reportPath) {
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
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
      output.info('📖 Report opened in browser');
    } catch {
      // Browser open may fail silently
    }
  }

  /**
   * Update baselines with current screenshots (accept changes)
   * @returns {number} Number of baselines updated
   */
  updateBaselines() {
    if (this.comparisons.length === 0) {
      output.warn('No comparisons found - nothing to update');
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
        output.warn(`Current screenshot not found for ${name}, skipping`);
        continue;
      }

      // Sanitize screenshot name for security
      let sanitizedName;
      try {
        sanitizedName = sanitizeScreenshotName(name);
      } catch (error) {
        output.warn(
          `Skipping baseline update for invalid name '${name}': ${error.message}`
        );
        continue;
      }

      const validatedProperties = validateScreenshotProperties(
        comparison.properties || {}
      );
      const signature = generateScreenshotSignature(
        sanitizedName,
        validatedProperties,
        this.signatureProperties
      );
      const filename = generateBaselineFilename(sanitizedName, signature);

      const baselineImagePath = safePath(this.baselinePath, filename);

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
        output.info(`✅ Updated baseline for ${sanitizedName}`);
      } catch (error) {
        output.error(
          `❌ Failed to update baseline for ${sanitizedName}: ${error.message}`
        );
      }
    }

    // Save updated metadata
    if (updatedCount > 0) {
      try {
        const metadataPath = join(this.baselinePath, 'metadata.json');
        writeFileSync(metadataPath, JSON.stringify(this.baselineData, null, 2));
        output.info(`✅ Updated ${updatedCount} baseline(s)`);
      } catch (error) {
        output.error(`❌ Failed to save baseline metadata: ${error.message}`);
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
    output.info(`🐻 Creating baseline for ${name}`);

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
    const signature = generateScreenshotSignature(
      name,
      properties || {},
      this.signatureProperties
    );

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
    output.info(`✅ Baseline created for ${name}`);
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
    output.info(`🐻 Setting baseline for ${name}`);

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
    const signature = generateScreenshotSignature(
      name,
      properties || {},
      this.signatureProperties
    );

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
    output.info(`🐻 Baseline set for ${name}`);
    return result;
  }

  /**
   * Accept a current screenshot as the new baseline
   * @param {string|Object} idOrComparison - Comparison ID or comparison object
   * @returns {Object} Result object
   */
  async acceptBaseline(idOrComparison) {
    let comparison;

    // Support both ID lookup and direct comparison object
    if (typeof idOrComparison === 'string') {
      // Find the comparison by ID in memory
      comparison = this.comparisons.find(c => c.id === idOrComparison);
      if (!comparison) {
        throw new Error(`No comparison found with ID: ${idOrComparison}`);
      }
    } else {
      // Use the provided comparison object directly
      comparison = idOrComparison;
    }

    const sanitizedName = comparison.name;

    const properties = comparison.properties || {};
    const signature = generateScreenshotSignature(
      sanitizedName,
      properties,
      this.signatureProperties
    );
    const filename = generateBaselineFilename(sanitizedName, signature);

    // Find the current screenshot file
    const currentImagePath = safePath(this.currentPath, filename);

    if (!existsSync(currentImagePath)) {
      output.error(`Current screenshot not found at: ${currentImagePath}`);
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
      output.error(`Baseline file does not exist after write!`);
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
