import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
 * Uses same logic as screenshot-identity.js: name + viewport_width + browser + custom properties
 *
 * Matches backend signature generation which uses:
 * - screenshot.name
 * - screenshot.viewport_width (top-level property)
 * - screenshot.browser (top-level property)
 * - custom properties from project's baseline_signature_properties setting
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
  const parts = [name];

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

  // Add custom properties in order (matches cloud screenshot-identity.js behavior)
  for (const propName of customProperties) {
    // Check multiple locations where property might exist:
    // 1. Top-level property (e.g., properties.device)
    // 2. In metadata object (e.g., properties.metadata.device)
    // 3. In nested metadata.properties (e.g., properties.metadata.properties.device)
    const value =
      properties[propName] ??
      properties.metadata?.[propName] ??
      properties.metadata?.properties?.[propName] ??
      '';

    // Normalize: convert to string, trim whitespace
    parts.push(String(value).trim());
  }

  return parts.join('|');
}

/**
 * Create a safe filename from signature
 * Handles custom property values that may contain spaces or special characters
 */
function signatureToFilename(signature) {
  return signature
    .replace(/\|/g, '_') // pipes to underscores
    .replace(/\s+/g, '_') // spaces to underscores
    .replace(/[/\\:*?"<>]/g, '') // remove unsafe filesystem chars
    .replace(/_+/g, '_'); // collapse multiple underscores
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
        // Use specific build ID - get it with screenshots in one call
        const apiResponse = await this.api.getBuild(buildId, 'screenshots');

        // API response available in verbose mode
        output.debug('tdd', 'fetched baseline build', {
          id: apiResponse?.build?.id || apiResponse?.id,
        });

        if (!apiResponse) {
          throw new Error(`Build ${buildId} not found or API returned null`);
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

        // Handle wrapped response format
        baselineBuild = apiResponse.build || apiResponse;

        if (!baselineBuild.id) {
          output.warn(
            `⚠️  Build response structure: ${JSON.stringify(Object.keys(apiResponse))}`
          );
          output.warn(
            `⚠️  Extracted build keys: ${JSON.stringify(Object.keys(baselineBuild))}`
          );
        }

        // Check build status and warn if it's not successful
        if (baselineBuild.status === 'failed') {
          output.warn(
            `⚠️  Build ${buildId} is marked as FAILED - falling back to local baselines`
          );
          output.info(
            `💡 To use remote baselines, specify a successful build ID instead`
          );
          // Fall back to local baseline logic
          return await this.handleLocalBaselines();
        } else if (baselineBuild.status !== 'completed') {
          output.warn(
            `⚠️  Build ${buildId} has status: ${baselineBuild.status} (expected: completed)`
          );
        }
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
          output.warn(
            `⚠️  No baseline builds found for ${environment}/${branch}`
          );
          output.info(
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
          output.warn(
            `Skipping screenshot with invalid name '${screenshot.name}': ${error.message}`
          );
          errorCount++;
          continue;
        }

        // Generate signature for baseline matching (same as compareScreenshot)
        // Build properties object with top-level viewport_width and browser
        // These are returned as top-level fields from the API, not inside metadata
        const properties = validateScreenshotProperties({
          viewport_width: screenshot.viewport_width,
          browser: screenshot.browser,
          ...(screenshot.metadata || screenshot.properties || {}),
        });
        const signature = generateScreenshotSignature(
          sanitizedName,
          properties,
          this.signatureProperties
        );
        const filename = signatureToFilename(signature);

        const imagePath = safePath(this.baselinePath, `${filename}.png`);

        // Check if we already have this file with the same SHA (using metadata)
        if (existsSync(imagePath) && screenshot.sha256) {
          const storedSha = existingShaMap.get(signature);

          if (storedSha === screenshot.sha256) {
            downloadedCount++; // Count as "downloaded" since we have it
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
          signature,
          filename,
          properties,
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
          .map(s => {
            let sanitizedName;
            try {
              sanitizedName = sanitizeScreenshotName(s.name);
            } catch (error) {
              output.warn(
                `Screenshot name sanitization failed for '${s.name}': ${error.message}`
              );
              return null; // Skip invalid screenshots
            }

            // Build properties object with top-level viewport_width and browser
            // These are returned as top-level fields from the API, not inside metadata
            const properties = validateScreenshotProperties({
              viewport_width: s.viewport_width,
              browser: s.browser,
              ...(s.metadata || s.properties || {}),
            });
            const signature = generateScreenshotSignature(
              sanitizedName,
              properties,
              this.signatureProperties
            );
            const filename = signatureToFilename(signature);

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
   * Download baselines using OAuth authentication
   * Used when user is logged in via device flow but no API token is configured
   * @param {string} buildId - Build ID to download from
   * @param {string} organizationSlug - Organization slug
   * @param {string} projectSlug - Project slug
   * @param {Object} authService - Auth service for OAuth requests
   * @returns {Promise<Object>} Download result
   */
  async downloadBaselinesWithAuth(
    buildId,
    organizationSlug,
    projectSlug,
    authService
  ) {
    output.info(`Downloading baselines using OAuth from build ${buildId}...`);

    try {
      // Fetch build with screenshots via OAuth endpoint
      const endpoint = `/api/build/${projectSlug}/${buildId}/tdd-baselines`;

      const response = await authService.authenticatedRequest(endpoint, {
        method: 'GET',
        headers: { 'X-Organization': organizationSlug },
      });

      const { build, screenshots, signatureProperties } = response;

      // Extract signature properties from API response (for variant support)
      if (signatureProperties && Array.isArray(signatureProperties)) {
        this.signatureProperties = signatureProperties;
        if (this.signatureProperties.length > 0) {
          output.info(
            `Using custom signature properties: ${this.signatureProperties.join(', ')}`
          );
        }
      }

      if (!screenshots || screenshots.length === 0) {
        output.warn('⚠️  No screenshots found in build');
        return { downloadedCount: 0, skippedCount: 0, errorCount: 0 };
      }

      output.info(
        `Using baseline from build: ${colors.cyan(build.name || 'Unknown')} (${build.id})`
      );
      output.info(
        `Checking ${colors.cyan(screenshots.length)} baseline screenshots...`
      );

      // Load existing baseline metadata for SHA comparison
      const existingBaseline = await this.loadBaseline();
      const existingShaMap = new Map();
      if (existingBaseline) {
        existingBaseline.screenshots.forEach(s => {
          if (s.sha256 && s.signature) {
            existingShaMap.set(s.signature, s.sha256);
          }
        });
      }

      // Process and download screenshots
      let downloadedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      const downloadedScreenshots = [];

      for (const screenshot of screenshots) {
        let sanitizedName;
        try {
          sanitizedName = sanitizeScreenshotName(screenshot.name);
        } catch (error) {
          output.warn(
            `Screenshot name sanitization failed for '${screenshot.name}': ${error.message}`
          );
          errorCount++;
          continue;
        }

        // Build properties object with top-level viewport_width and browser
        // These are returned as top-level fields from the API, not inside metadata
        const properties = validateScreenshotProperties({
          viewport_width: screenshot.viewport_width,
          browser: screenshot.browser,
          ...screenshot.metadata,
        });
        const signature = generateScreenshotSignature(
          sanitizedName,
          properties,
          this.signatureProperties
        );
        const filename = signatureToFilename(signature);
        const filePath = safePath(this.baselinePath, `${filename}.png`);

        // Check if we can skip via SHA comparison
        if (
          screenshot.sha256 &&
          existingShaMap.get(signature) === screenshot.sha256
        ) {
          skippedCount++;
          downloadedScreenshots.push({
            name: sanitizedName,
            sha256: screenshot.sha256,
            signature,
            path: filePath,
            properties,
          });
          continue;
        }

        // Download the screenshot
        const downloadUrl = screenshot.original_url;
        if (!downloadUrl) {
          output.warn(`⚠️  No download URL for screenshot: ${sanitizedName}`);
          errorCount++;
          continue;
        }

        try {
          const imageResponse = await fetchWithTimeout(downloadUrl, {}, 30000);
          if (!imageResponse.ok) {
            throw new Error(`HTTP ${imageResponse.status}`);
          }

          const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

          // Calculate SHA256 of downloaded content
          const sha256 = crypto
            .createHash('sha256')
            .update(imageBuffer)
            .digest('hex');

          writeFileSync(filePath, imageBuffer);
          downloadedCount++;

          downloadedScreenshots.push({
            name: sanitizedName,
            sha256,
            signature,
            path: filePath,
            properties,
            originalUrl: downloadUrl,
          });
        } catch (error) {
          output.warn(
            `⚠️  Failed to download ${sanitizedName}: ${error.message}`
          );
          errorCount++;
        }
      }

      // Store baseline metadata
      this.baselineData = {
        buildId: build.id,
        buildName: build.name,
        branch: build.branch,
        threshold: this.threshold,
        signatureProperties: this.signatureProperties, // Store for TDD comparison
        screenshots: downloadedScreenshots,
      };

      const metadataPath = join(this.baselinePath, 'metadata.json');
      writeFileSync(metadataPath, JSON.stringify(this.baselineData, null, 2));

      // Save baseline build metadata
      const baselineMetadataPath = safePath(
        this.workingDir,
        '.vizzly',
        'baseline-metadata.json'
      );
      writeFileSync(
        baselineMetadataPath,
        JSON.stringify(
          {
            buildId: build.id,
            buildName: build.name,
            branch: build.branch,
            commitSha: build.commit_sha,
            downloadedAt: new Date().toISOString(),
          },
          null,
          2
        )
      );

      // Summary
      if (skippedCount > 0 && downloadedCount === 0) {
        output.info(
          `✅ All ${skippedCount} baselines up-to-date (matching local SHA)`
        );
      } else if (skippedCount > 0) {
        output.info(
          `✅ Downloaded ${downloadedCount} new screenshots, ${skippedCount} already up-to-date`
        );
      } else {
        output.info(
          `✅ Downloaded ${downloadedCount}/${screenshots.length} screenshots successfully`
        );
      }

      if (errorCount > 0) {
        output.warn(`⚠️  ${errorCount} screenshots failed to download`);
      }

      return {
        downloadedCount,
        skippedCount,
        errorCount,
        buildId: build.id,
        buildName: build.name,
      };
    } catch (error) {
      output.error(
        `❌ OAuth download failed: ${error.message} (org=${organizationSlug}, project=${projectSlug}, build=${buildId})`
      );
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
    const filename = signatureToFilename(signature);

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
      const filename = signatureToFilename(signature);

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
    const filename = signatureToFilename(signature);

    // Find the current screenshot file
    const currentImagePath = safePath(this.currentPath, `${filename}.png`);

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
