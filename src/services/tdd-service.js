import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import { createApiService } from '../services/api-service.js';
import { createLogger } from '../utils/logger.js';
import { colors } from '../utils/colors.js';
import { getDefaultBranch } from '../utils/git.js';
import { fetchWithTimeout } from '../utils/fetch-utils.js';

const logger = createLogger('TDD');

/**
 * Create a new TDD service instance
 */
export function createTDDService(config, options = {}) {
  return new TddService(config, options.workingDir);
}

export class TddService {
  constructor(config, workingDir = process.cwd()) {
    this.config = config;
    this.api = createApiService({
      baseUrl: config.apiUrl,
      apiKey: config.apiKey,
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
          throw new Error(
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

    // Check if baseline exists
    if (!existsSync(baselineImagePath)) {
      logger.warn(`⚠️  No baseline found for ${name} - marking as new`);

      const result = {
        name,
        status: 'new',
        baseline: null,
        current: currentImagePath,
        diff: null,
        properties,
      };

      this.comparisons.push(result);
      return result;
    }

    try {
      // Use odiff to compare images
      let odiffPath;
      try {
        // Try to find odiff-bin in node_modules
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        odiffPath = require.resolve('odiff-bin');
      } catch {
        // Fall back to system odiff
        odiffPath = 'odiff';
      }

      const command = `"${odiffPath}" "${baselineImagePath}" "${currentImagePath}" "${diffImagePath}" --threshold ${this.threshold}`;

      logger.debug(`Running: ${command}`);

      execSync(command, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // odiff returns 0 if images match, 1 if they don't
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
    } catch (error) {
      // odiff exits with code 1 when images differ
      if (error.status === 1) {
        const comparison = {
          name,
          status: 'failed',
          baseline: baselineImagePath,
          current: currentImagePath,
          diff: diffImagePath,
          properties,
          threshold: this.threshold,
        };

        logger.warn(
          `❌ ${colors.red('FAILED')} ${name} - differences detected`
        );
        this.comparisons.push(comparison);
        return comparison;
      }

      // Other errors (file not found, etc.)
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
}
