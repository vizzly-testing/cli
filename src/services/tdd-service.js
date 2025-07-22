import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import { ApiService } from '../services/api-service.js';
import { createServiceLogger } from '../utils/logger-factory.js';
import { colors } from '../utils/colors.js';
import { getDefaultBranch } from '../utils/git.js';
import { fetchWithTimeout } from '../utils/fetch-utils.js';
import { NetworkError } from '../errors/vizzly-error.js';

const logger = createServiceLogger('TDD');

/**
 * Create a new TDD service instance
 */
export function createTDDService(config, options = {}) {
  return new TddService(config, options.workingDir);
}

export class TddService {
  constructor(config, workingDir = process.cwd()) {
    this.config = config;
    this.api = new ApiService({
      baseUrl: config.apiUrl,
      token: config.apiKey,
      command: 'tdd',
      allowNoToken: true, // TDD can run without a token to create new screenshots
    });
    this.workingDir = workingDir;
    this.baselinePath = join(workingDir, '.vizzly', 'baselines');
    this.currentPath = join(workingDir, '.vizzly', 'current');
    this.diffPath = join(workingDir, '.vizzly', 'diffs');
    this.baselineData = null;
    this.comparisons = [];
    this.threshold = config.comparison?.threshold || 0.01;

    // Ensure directories exist
    [this.baselinePath, this.currentPath, this.diffPath].forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  }

  async downloadBaselines(
    environment = 'test',
    branch = null,
    buildId = null,
    comparisonId = null
  ) {
    logger.info('🔍 Looking for baseline build...');

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
        // Use specific build ID
        logger.info(`📌 Using specified build: ${buildId}`);
        baselineBuild = await this.api.getBuild(buildId);
      } else if (comparisonId) {
        // Use specific comparison ID
        logger.info(`📌 Using comparison: ${comparisonId}`);
        const comparison = await this.api.getComparison(comparisonId);
        baselineBuild = comparison.baselineBuild;
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
      logger.info(
        `📥 Found baseline build: ${colors.cyan(baselineBuild.name)} (${baselineBuild.id})`
      );

      // Get build details with screenshots
      const buildDetails = await this.api.getBuild(
        baselineBuild.id,
        'screenshots'
      );

      if (!buildDetails.screenshots || buildDetails.screenshots.length === 0) {
        logger.warn('⚠️  No screenshots found in baseline build');
        return null;
      }

      logger.info(
        `📸 Downloading ${colors.cyan(buildDetails.screenshots.length)} baseline screenshots...`
      );

      // Download each screenshot
      for (const screenshot of buildDetails.screenshots) {
        const imagePath = join(this.baselinePath, `${screenshot.name}.png`);

        // Download the image
        const response = await fetchWithTimeout(screenshot.url);
        if (!response.ok) {
          throw new NetworkError(
            `Failed to download ${screenshot.name}: ${response.statusText}`
          );
        }

        const imageBuffer = await response.buffer();
        writeFileSync(imagePath, imageBuffer);

        logger.debug(`✓ Downloaded ${screenshot.name}.png`);
      }

      // Store baseline metadata
      this.baselineData = {
        buildId: baselineBuild.id,
        buildName: baselineBuild.name,
        environment,
        branch,
        threshold: this.threshold,
        screenshots: buildDetails.screenshots.map(s => ({
          name: s.name,
          properties: s.properties || {},
          path: join(this.baselinePath, `${s.name}.png`),
        })),
      };

      const metadataPath = join(this.baselinePath, 'metadata.json');
      writeFileSync(metadataPath, JSON.stringify(this.baselineData, null, 2));

      logger.info(`✅ Baseline downloaded successfully`);
      return this.baselineData;
    } catch (error) {
      logger.error(`❌ Failed to download baseline: ${error.message}`);
      throw error;
    }
  }

  async loadBaseline() {
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
    const currentImagePath = join(this.currentPath, `${name}.png`);
    const baselineImagePath = join(this.baselinePath, `${name}.png`);
    const diffImagePath = join(this.diffPath, `${name}.png`);

    // Save current screenshot
    writeFileSync(currentImagePath, imageBuffer);

    // Check if we're in baseline update mode - skip all comparisons
    const setBaseline = process.env.VIZZLY_SET_BASELINE === 'true';
    if (setBaseline) {
      return this.updateSingleBaseline(
        name,
        imageBuffer,
        properties,
        currentImagePath,
        baselineImagePath
      );
    }

    // Check if baseline exists
    if (!existsSync(baselineImagePath)) {
      logger.warn(`⚠️  No baseline found for ${name} - creating baseline`);

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
        name,
        properties: properties || {},
        path: baselineImagePath,
      };

      const existingIndex = this.baselineData.screenshots.findIndex(
        s => s.name === name
      );
      if (existingIndex >= 0) {
        this.baselineData.screenshots[existingIndex] = screenshotEntry;
      } else {
        this.baselineData.screenshots.push(screenshotEntry);
      }

      // Save updated metadata
      const metadataPath = join(this.baselinePath, 'metadata.json');
      writeFileSync(metadataPath, JSON.stringify(this.baselineData, null, 2));

      logger.info(`✅ Created baseline for ${name}`);

      const result = {
        name,
        status: 'new',
        baseline: baselineImagePath,
        current: currentImagePath,
        diff: null,
        properties,
      };

      this.comparisons.push(result);
      return result;
    }

    try {
      // Use odiff Node.js API to compare images
      const { compare } = await import('odiff-bin');

      logger.debug(`Comparing ${baselineImagePath} vs ${currentImagePath}`);

      const result = await compare(
        baselineImagePath,
        currentImagePath,
        diffImagePath,
        {
          threshold: this.threshold,
          outputDiffMask: true,
        }
      );

      if (result.match) {
        // Images match
        const comparison = {
          name,
          status: 'passed',
          baseline: baselineImagePath,
          current: currentImagePath,
          diff: null,
          properties,
          threshold: this.threshold,
        };

        logger.info(`✅ ${colors.green('PASSED')} ${name}`);
        this.comparisons.push(comparison);
        return comparison;
      } else {
        // Images differ
        let diffInfo = '';
        if (result.reason === 'pixel-diff') {
          diffInfo = ` (${result.diffPercentage.toFixed(2)}% different, ${result.diffCount} pixels)`;
        } else if (result.reason === 'layout-diff') {
          diffInfo = ' (layout difference)';
        }

        const comparison = {
          name,
          status: 'failed',
          baseline: baselineImagePath,
          current: currentImagePath,
          diff: diffImagePath,
          properties,
          threshold: this.threshold,
          diffPercentage:
            result.reason === 'pixel-diff' ? result.diffPercentage : null,
          diffCount: result.reason === 'pixel-diff' ? result.diffCount : null,
          reason: result.reason,
        };

        logger.warn(
          `❌ ${colors.red('FAILED')} ${name} - differences detected${diffInfo}`
        );
        logger.info(`    Diff saved to: ${diffImagePath}`);
        this.comparisons.push(comparison);
        return comparison;
      }
    } catch (error) {
      // Handle file errors or other issues
      logger.error(`❌ Error comparing ${name}: ${error.message}`);

      const comparison = {
        name,
        status: 'error',
        baseline: baselineImagePath,
        current: currentImagePath,
        diff: null,
        properties,
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

  printResults() {
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
        logger.info(`    Baseline: ${comp.baseline}`);
        logger.info(`    Current:  ${comp.current}`);
        logger.info(`    Diff:     ${comp.diff}`);
      });
    }

    // Show new screenshots
    const newComparisons = results.comparisons.filter(c => c.status === 'new');
    if (newComparisons.length > 0) {
      logger.info('\n📸 New screenshots:');
      newComparisons.forEach(comp => {
        logger.info(`  • ${comp.name}`);
        logger.info(`    Current: ${comp.current}`);
      });
    }

    logger.info(`\n📁 Results saved to: ${colors.dim('.vizzly/')}`);

    return results;
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

      const baselineImagePath = join(this.baselinePath, `${name}.png`);

      try {
        // Copy current screenshot to baseline
        const currentBuffer = readFileSync(current);
        writeFileSync(baselineImagePath, currentBuffer);

        // Update baseline metadata
        const screenshotEntry = {
          name,
          properties: comparison.properties || {},
          path: baselineImagePath,
        };

        const existingIndex = this.baselineData.screenshots.findIndex(
          s => s.name === name
        );
        if (existingIndex >= 0) {
          this.baselineData.screenshots[existingIndex] = screenshotEntry;
        } else {
          this.baselineData.screenshots.push(screenshotEntry);
        }

        updatedCount++;
        logger.info(`✅ Updated baseline for ${name}`);
      } catch (error) {
        logger.error(
          `❌ Failed to update baseline for ${name}: ${error.message}`
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

    // Add screenshot to baseline metadata
    const screenshotEntry = {
      name,
      properties: properties || {},
      path: baselineImagePath,
    };

    const existingIndex = this.baselineData.screenshots.findIndex(
      s => s.name === name
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
      name,
      status: 'baseline-updated',
      baseline: baselineImagePath,
      current: currentImagePath,
      diff: null,
      properties,
    };

    this.comparisons.push(result);
    logger.info(`🐻 Baseline set for ${name}`);
    return result;
  }
}
