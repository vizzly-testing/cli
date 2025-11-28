/**
 * Build Manager Service
 * Manages the build lifecycle and coordinates test execution
 */

import crypto from 'crypto';
import { VizzlyError } from '../errors/vizzly-error.js';

/**
 * Generate unique build ID for local build management only.
 * Note: The API generates its own UUIDs for actual builds - this local ID
 * is only used for CLI internal tracking and is not sent to the API.
 * @returns {string} Build ID
 */
export function generateBuildId() {
  return `build-${crypto.randomUUID()}`;
}

/**
 * Create build object
 * @param {Object} buildOptions - Build configuration
 * @returns {Object} Build object
 */
export function createBuildObject(buildOptions) {
  const {
    name,
    branch,
    commit,
    environment = 'test',
    metadata = {},
  } = buildOptions;

  return {
    id: generateBuildId(),
    name: name || `build-${Date.now()}`,
    branch,
    commit,
    environment,
    metadata,
    status: 'pending',
    createdAt: new Date().toISOString(),
    screenshots: [],
  };
}

/**
 * Update build with new status and data
 * @param {Object} build - Current build
 * @param {string} status - New status
 * @param {Object} updates - Additional updates
 * @returns {Object} Updated build
 */
export function updateBuild(build, status, updates = {}) {
  return {
    ...build,
    status,
    updatedAt: new Date().toISOString(),
    ...updates,
  };
}

/**
 * Add screenshot to build
 * @param {Object} build - Current build
 * @param {Object} screenshot - Screenshot data
 * @returns {Object} Updated build
 */
export function addScreenshotToBuild(build, screenshot) {
  return {
    ...build,
    screenshots: [
      ...build.screenshots,
      {
        ...screenshot,
        addedAt: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Finalize build with result
 * @param {Object} build - Current build
 * @param {Object} result - Build result
 * @returns {Object} Finalized build
 */
export function finalizeBuildObject(build, result = {}) {
  const finalStatus = result.success ? 'completed' : 'failed';

  return {
    ...build,
    status: finalStatus,
    completedAt: new Date().toISOString(),
    result,
  };
}

/**
 * Create queued build item
 * @param {Object} buildOptions - Build options
 * @returns {Object} Queued build item
 */
export function createQueuedBuild(buildOptions) {
  return {
    ...buildOptions,
    queuedAt: new Date().toISOString(),
  };
}

/**
 * Validate build options
 * @param {Object} buildOptions - Build options to validate
 * @returns {Object} Validation result
 */
export function validateBuildOptions(buildOptions) {
  const errors = [];

  if (!buildOptions.name && !buildOptions.branch) {
    errors.push('Either name or branch is required');
  }

  if (
    buildOptions.environment &&
    !['test', 'staging', 'production'].includes(buildOptions.environment)
  ) {
    errors.push('Environment must be one of: test, staging, production');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export class BuildManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.currentBuild = null;
    this.buildQueue = [];
  }

  async createBuild(buildOptions) {
    let build = createBuildObject(buildOptions);
    this.currentBuild = build;
    this.logger.debug(`Build created: ${build.name}`);
    return build;
  }

  async updateBuildStatus(buildId, status, updates = {}) {
    if (!this.currentBuild || this.currentBuild.id !== buildId) {
      throw new VizzlyError(`Build ${buildId} not found`, 'BUILD_NOT_FOUND');
    }
    this.currentBuild = updateBuild(this.currentBuild, status, updates);
    this.logger.debug(`Build status: ${status}`);
    return this.currentBuild;
  }

  async addScreenshot(buildId, screenshot) {
    if (!this.currentBuild || this.currentBuild.id !== buildId) {
      throw new VizzlyError(`Build ${buildId} not found`, 'BUILD_NOT_FOUND');
    }
    this.currentBuild = addScreenshotToBuild(this.currentBuild, screenshot);
    this.logger.debug(
      `Screenshot added to build (${this.currentBuild.screenshots.length} total)`
    );
    return this.currentBuild;
  }

  async finalizeBuild(buildId, result = {}) {
    if (!this.currentBuild || this.currentBuild.id !== buildId) {
      throw new VizzlyError(`Build ${buildId} not found`, 'BUILD_NOT_FOUND');
    }
    this.currentBuild = finalizeBuildObject(this.currentBuild, result);
    this.logger.debug(`Build ${this.currentBuild.status}`);
    return this.currentBuild;
  }

  getCurrentBuild() {
    return this.currentBuild;
  }

  queueBuild(buildOptions) {
    let queuedBuild = createQueuedBuild(buildOptions);
    this.buildQueue.push(queuedBuild);
    this.logger.debug(`Build queued (${this.buildQueue.length} in queue)`);
  }

  clear() {
    this.buildQueue.length = 0;
    this.currentBuild = null;
  }

  async processNextBuild() {
    if (this.buildQueue.length === 0) {
      return null;
    }
    const buildOptions = this.buildQueue.shift();
    return await this.createBuild(buildOptions);
  }

  getQueueStatus() {
    return {
      length: this.buildQueue.length,
      items: this.buildQueue.map(item => ({
        name: item.name,
        branch: item.branch,
        queuedAt: item.queuedAt,
      })),
    };
  }
}
