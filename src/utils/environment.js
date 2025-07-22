/**
 * Environment detection utilities for handling CI/interactive environments
 */

/**
 * Check if running in a CI environment
 * Based on common CI environment variables
 * @returns {boolean} True if running in CI
 */
export function isCI() {
  return Boolean(
    process.env.CI || // Generic CI flag
      process.env.CONTINUOUS_INTEGRATION || // TravisCI, CircleCI
      process.env.BUILD_NUMBER || // Jenkins
      process.env.GITHUB_ACTIONS || // GitHub Actions
      process.env.GITLAB_CI || // GitLab CI
      process.env.CIRCLECI || // CircleCI
      process.env.TRAVIS || // TravisCI
      process.env.APPVEYOR || // AppVeyor
      process.env.CODEBUILD_BUILD_ID || // AWS CodeBuild
      process.env.TEAMCITY_VERSION || // TeamCity
      process.env.TF_BUILD || // Azure DevOps
      process.env.DRONE || // Drone CI
      process.env.BITBUCKET_BUILD_NUMBER // Bitbucket Pipelines
  );
}

/**
 * Check if stdout supports interactive features
 * @returns {boolean} True if interactive features are supported
 */
export function isInteractiveTerminal() {
  return Boolean(
    process.stdout.isTTY &&
      process.stdin.isTTY &&
      (!process.env.TERM || process.env.TERM !== 'dumb')
  );
}

/**
 * Determine if interactive mode should be enabled
 * Takes into account CI detection, TTY support, and explicit flags
 * @param {Object} options
 * @param {boolean} [options.noInteractive] - Explicit flag to disable interactive mode
 * @param {boolean} [options.interactive] - Explicit flag to force interactive mode
 * @returns {boolean} True if interactive mode should be enabled
 */
export function shouldUseInteractiveMode(options = {}) {
  // Explicit flags take priority
  // Commander.js sets interactive=false when --no-interactive is used
  if (options.interactive === false) {
    return false;
  }

  if (options.interactive === true) {
    return true;
  }

  // Legacy support for explicit noInteractive flag
  if (options.noInteractive === true) {
    return false;
  }

  // Auto-detect based on environment
  return !isCI() && isInteractiveTerminal();
}

/**
 * Get environment type for logging/debugging
 * @returns {string} Environment type description
 */
export function getEnvironmentType() {
  if (isCI()) {
    return 'CI';
  }

  if (!isInteractiveTerminal()) {
    return 'non-interactive';
  }

  return 'interactive';
}

/**
 * Get detailed environment info for debugging
 * @returns {Object} Environment details
 */
export function getEnvironmentDetails() {
  return {
    isCI: isCI(),
    isInteractiveTerminal: isInteractiveTerminal(),
    environmentType: getEnvironmentType(),
    stdoutIsTTY: Boolean(process.stdout.isTTY),
    stdinIsTTY: Boolean(process.stdin.isTTY),
    ciVars: {
      CI: process.env.CI,
      CONTINUOUS_INTEGRATION: process.env.CONTINUOUS_INTEGRATION,
      GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
      GITLAB_CI: process.env.GITLAB_CI,
      CIRCLECI: process.env.CIRCLECI,
      TRAVIS: process.env.TRAVIS,
    },
    termType: process.env.TERM,
  };
}
