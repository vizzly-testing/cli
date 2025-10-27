import { readFile, readdir, stat, access, copyFile, mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { constants } from 'fs';

/**
 * Provider for reading local TDD state from .vizzly directory
 */
export class LocalTDDProvider {
  /**
   * Find .vizzly directory by searching up from current directory
   */
  async findVizzlyDir(workingDirectory = process.cwd()) {
    let currentDir = resolve(workingDirectory);
    let maxDepth = 10;
    let depth = 0;

    while (depth < maxDepth) {
      let vizzlyDir = join(currentDir, '.vizzly');
      try {
        await access(vizzlyDir, constants.R_OK);
        return vizzlyDir;
      } catch {
        // Directory doesn't exist or isn't readable, go up one level
        let parentDir = join(currentDir, '..');
        if (parentDir === currentDir) {
          // Reached root
          break;
        }
        currentDir = parentDir;
        depth++;
      }
    }

    return null;
  }

  /**
   * Get baseline metadata if available
   * Returns metadata about cloud build that baselines were downloaded from
   */
  async getBaselineMetadata(workingDirectory) {
    let vizzlyDir = await this.findVizzlyDir(workingDirectory);
    if (!vizzlyDir) {
      return null;
    }

    let metadataPath = join(vizzlyDir, 'baseline-metadata.json');
    try {
      let content = await readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      // No metadata file exists (expected for local-only baselines)
      return null;
    }
  }

  /**
   * Get TDD server information from server.json
   */
  async getServerInfo(workingDirectory) {
    let vizzlyDir = await this.findVizzlyDir(workingDirectory);
    if (!vizzlyDir) {
      return {
        running: false,
        message: 'No .vizzly directory found. TDD server not running.'
      };
    }

    let serverJsonPath = join(vizzlyDir, 'server.json');
    try {
      let content = await readFile(serverJsonPath, 'utf-8');
      let serverInfo = JSON.parse(content);
      return {
        running: true,
        ...serverInfo,
        dashboardUrl: `http://localhost:${serverInfo.port}/dashboard`
      };
    } catch {
      return {
        running: false,
        message: 'TDD server not running or server.json not found',
        vizzlyDir
      };
    }
  }

  /**
   * Get current TDD status with comparison results
   * @param {string} workingDirectory - Path to project directory
   * @param {string} statusFilter - Filter by status: 'failed', 'new', 'passed', 'all', or 'summary' (default)
   * @param {number} limit - Maximum number of comparisons to return
   */
  async getTDDStatus(workingDirectory, statusFilter = 'summary', limit) {
    let vizzlyDir = await this.findVizzlyDir(workingDirectory);
    if (!vizzlyDir) {
      return {
        error: 'No .vizzly directory found',
        message: 'Run `vizzly tdd start` or `vizzly tdd run "npm test"` to initialize TDD mode'
      };
    }

    let serverInfo = await this.getServerInfo(workingDirectory);

    // Read comparison results from report data
    let reportDataPath = join(vizzlyDir, 'report-data.json');
    let comparisons = [];
    let summary = {
      total: 0,
      passed: 0,
      failed: 0,
      new: 0
    };

    try {
      let reportData = await readFile(reportDataPath, 'utf-8');
      let data = JSON.parse(reportData);
      comparisons = data.comparisons || [];

      // Calculate summary
      summary.total = comparisons.length;
      summary.passed = comparisons.filter((c) => c.status === 'passed').length;
      summary.failed = comparisons.filter((c) => c.status === 'failed').length;
      summary.new = comparisons.filter((c) => c.status === 'new').length;
    } catch {
      // No comparisons yet
    }

    // List available diff images
    let diffsDir = join(vizzlyDir, 'diffs');
    let diffImages = [];
    try {
      let files = await readdir(diffsDir);
      diffImages = files
        .filter((f) => f.endsWith('.png'))
        .map((f) => ({
          name: f.replace('.png', ''),
          path: join(diffsDir, f)
        }));
    } catch {
      // No diffs directory
    }

    // Get baseline metadata if available
    let baselineMetadata = await this.getBaselineMetadata(workingDirectory);

    // Build base response
    let response = {
      vizzlyDir,
      serverInfo,
      summary,
      baselineMetadata
    };

    // If summary mode (default), don't include full comparison details
    if (statusFilter === 'summary') {
      response.failedComparisons = comparisons
        .filter((c) => c.status === 'failed')
        .map((c) => c.name);
      response.newScreenshots = comparisons.filter((c) => c.status === 'new').map((c) => c.name);
      response.diffImages = diffImages;
      return response;
    }

    // Filter comparisons based on statusFilter
    let filteredComparisons = comparisons;
    if (statusFilter !== 'all') {
      filteredComparisons = comparisons.filter((c) => c.status === statusFilter);
    }

    // Apply limit if provided
    if (limit && limit > 0) {
      filteredComparisons = filteredComparisons.slice(0, limit);
    }

    // Map comparisons with full details
    response.comparisons = filteredComparisons.map((c) => {
      // Convert paths from report-data.json to filesystem paths
      // Report paths like "/images/baselines/foo.png" -> ".vizzly/baselines/foo.png"
      let makeFilesystemPath = (path) => {
        if (!path) return null;
        // Strip /images/ prefix and join with vizzlyDir
        let cleanPath = path.replace(/^\/images\//, '');
        return join(vizzlyDir, cleanPath);
      };

      return {
        name: c.name,
        status: c.status,
        diffPercentage: c.diffPercentage,
        threshold: c.threshold,
        hasDiff: c.diffPercentage > c.threshold,
        currentPath: makeFilesystemPath(c.current),
        baselinePath: makeFilesystemPath(c.baseline),
        diffPath: makeFilesystemPath(c.diff)
      };
    });

    response.diffImages = diffImages;
    response.failedComparisons = comparisons
      .filter((c) => c.status === 'failed')
      .map((c) => c.name);
    response.newScreenshots = comparisons.filter((c) => c.status === 'new').map((c) => c.name);

    return response;
  }

  /**
   * Get detailed information about a specific comparison
   */
  async getComparisonDetails(screenshotName, workingDirectory) {
    // Get all comparisons to find the specific one
    let status = await this.getTDDStatus(workingDirectory, 'all');
    if (status.error) {
      return status;
    }

    let comparison = status.comparisons.find((c) => c.name === screenshotName);
    if (!comparison) {
      return {
        error: `Screenshot "${screenshotName}" not found`,
        availableScreenshots: status.comparisons.map((c) => c.name)
      };
    }

    return {
      ...comparison,
      mode: 'local',
      vizzlyDir: status.vizzlyDir,
      baselineMetadata: status.baselineMetadata,
      analysis: this.analyzeComparison(comparison)
    };
  }

  /**
   * Analyze comparison to provide helpful insights
   */
  analyzeComparison(comparison) {
    let insights = [];

    if (comparison.status === 'new') {
      insights.push('This is a new screenshot with no baseline for comparison.');
      insights.push('Accept this screenshot as the baseline if it looks correct.');
    } else if (comparison.status === 'failed') {
      let diffPct = comparison.diffPercentage;
      if (diffPct < 1) {
        insights.push(
          `Small difference detected (${diffPct.toFixed(2)}%). This might be minor anti-aliasing or subpixel rendering.`
        );
      } else if (diffPct < 5) {
        insights.push(
          `Moderate difference (${diffPct.toFixed(2)}%). Likely a layout shift or color change.`
        );
      } else {
        insights.push(
          `Large difference (${diffPct.toFixed(2)}%). Significant visual change detected.`
        );
      }

      insights.push(
        'Use the Read tool to view the baseline and current image paths to identify the differences.'
      );
      insights.push('Do NOT attempt to read the diff image path as it may cause API errors.');
      insights.push('If this change is intentional, accept it as the new baseline.');
      insights.push('If unintentional, investigate and fix the visual issue.');
    } else if (comparison.status === 'passed') {
      insights.push('Screenshot matches the baseline within threshold.');
    }

    return insights;
  }

  /**
   * List all diff images
   */
  async listDiffImages(workingDirectory) {
    let vizzlyDir = await this.findVizzlyDir(workingDirectory);
    if (!vizzlyDir) {
      return {
        error: 'No .vizzly directory found'
      };
    }

    let diffsDir = join(vizzlyDir, 'diffs');
    try {
      let files = await readdir(diffsDir);
      let diffImages = [];

      for (let file of files) {
        if (!file.endsWith('.png')) continue;

        let filePath = join(diffsDir, file);
        let stats = await stat(filePath);

        diffImages.push({
          name: file.replace('.png', ''),
          path: filePath,
          size: stats.size,
          modified: stats.mtime
        });
      }

      return {
        count: diffImages.length,
        diffImages: diffImages.sort((a, b) => b.modified.getTime() - a.modified.getTime())
      };
    } catch {
      return {
        count: 0,
        diffImages: [],
        message: 'No diff images found'
      };
    }
  }

  /**
   * Accept a screenshot as new baseline
   * Copies current screenshot to baselines directory
   */
  async acceptBaseline(screenshotName, workingDirectory) {
    let vizzlyDir = await this.findVizzlyDir(workingDirectory);
    if (!vizzlyDir) {
      throw new Error('No .vizzly directory found. TDD server not running.');
    }

    let currentPath = join(vizzlyDir, 'current', `${screenshotName}.png`);
    let baselinePath = join(vizzlyDir, 'baselines', `${screenshotName}.png`);

    try {
      // Check current screenshot exists
      await access(currentPath, constants.R_OK);

      // Ensure baselines directory exists
      await mkdir(join(vizzlyDir, 'baselines'), { recursive: true });

      // Copy current to baseline
      await copyFile(currentPath, baselinePath);

      return {
        success: true,
        message: `Accepted ${screenshotName} as new baseline`,
        screenshotName,
        baselinePath
      };
    } catch (error) {
      throw new Error(
        `Failed to accept baseline: ${error.message}. Make sure the screenshot exists at ${currentPath}`
      );
    }
  }

  /**
   * Reject a screenshot (marks it for investigation)
   * Creates a rejection marker file
   */
  async rejectBaseline(screenshotName, reason, workingDirectory) {
    let vizzlyDir = await this.findVizzlyDir(workingDirectory);
    if (!vizzlyDir) {
      throw new Error('No .vizzly directory found. TDD server not running.');
    }

    let rejectionsDir = join(vizzlyDir, 'rejections');
    await mkdir(rejectionsDir, { recursive: true });

    let rejectionFile = join(rejectionsDir, `${screenshotName}.json`);
    let rejectionData = {
      screenshotName,
      reason,
      rejectedAt: new Date().toISOString()
    };

    try {
      await writeFile(rejectionFile, JSON.stringify(rejectionData, null, 2));

      return {
        success: true,
        message: `Rejected ${screenshotName}: ${reason}`,
        screenshotName,
        reason
      };
    } catch (error) {
      throw new Error(`Failed to reject baseline: ${error.message}`);
    }
  }

  /**
   * Download and save baselines from cloud build
   */
  async downloadBaselinesFromCloud(screenshots, workingDirectory, buildMetadata = null) {
    let vizzlyDir = await this.findVizzlyDir(workingDirectory);
    if (!vizzlyDir) {
      throw new Error('No .vizzly directory found. TDD server not running.');
    }

    let baselinesDir = join(vizzlyDir, 'baselines');
    await mkdir(baselinesDir, { recursive: true });

    let results = [];

    for (let screenshot of screenshots) {
      try {
        // Download image from URL
        let response = await fetch(screenshot.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        // eslint-disable-next-line no-undef
        let buffer = Buffer.from(await response.arrayBuffer());
        let baselinePath = join(baselinesDir, `${screenshot.name}.png`);

        await writeFile(baselinePath, buffer);

        results.push({
          name: screenshot.name,
          success: true,
          path: baselinePath
        });
      } catch (error) {
        results.push({
          name: screenshot.name,
          success: false,
          error: error.message
        });
      }
    }

    let successCount = results.filter((r) => r.success).length;

    // Save baseline metadata if build metadata provided
    if (buildMetadata && successCount > 0) {
      let metadata = {
        sourceType: 'cloud-build',
        buildId: buildMetadata.id,
        buildName: buildMetadata.name,
        branch: buildMetadata.branch,
        commitSha: buildMetadata.commitSha,
        commitMessage: buildMetadata.commitMessage,
        commonAncestorSha: buildMetadata.commonAncestorSha,
        buildUrl: buildMetadata.url,
        downloadedAt: new Date().toISOString(),
        screenshots: results.filter((r) => r.success).map((r) => r.name)
      };

      let metadataPath = join(vizzlyDir, 'baseline-metadata.json');
      await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }

    return {
      success: successCount > 0,
      message: `Downloaded ${successCount}/${screenshots.length} baselines`,
      results,
      metadataSaved: buildMetadata && successCount > 0
    };
  }
}
