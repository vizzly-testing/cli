/**
 * Plugin API - Stable interface for Vizzly plugins
 *
 * This module defines the stable API contract for plugins. Only methods
 * exposed here are considered part of the public API and are guaranteed
 * to not break between minor versions.
 *
 * Internal services (apiService, uploader, buildManager, etc.) are NOT
 * exposed to plugins to prevent coupling to implementation details.
 */

import {
  detectBranch,
  detectCommit,
  detectCommitMessage,
  detectPullRequestNumber,
  generateBuildNameWithGit,
} from './utils/git.js';

/**
 * Creates a stable plugin services object from the internal services
 *
 * Only exposes:
 * - git: Git information detection (branch, commit, PR number, etc.)
 * - testRunner: Build lifecycle management (createBuild, finalizeBuild, events)
 * - serverManager: Screenshot server control (start, stop)
 *
 * @param {Object} services - Internal services from createServices()
 * @returns {Object} Frozen plugin services object
 */
export function createPluginServices(services) {
  let { testRunner, serverManager } = services;

  return Object.freeze({
    // Git detection utilities - provides correct git info from CI environments
    git: Object.freeze({
      /**
       * Detect git information for build creation
       * Handles CI environment variables correctly (GitHub Actions, GitLab, etc.)
       *
       * @param {Object} [options] - Detection options
       * @param {string} [options.buildPrefix] - Prefix for generated build name
       * @returns {Promise<Object>} Git info: { branch, commit, message, prNumber, buildName }
       */
      async detect(options = {}) {
        let [branch, commit, message] = await Promise.all([
          detectBranch(),
          detectCommit(),
          detectCommitMessage(),
        ]);
        let prNumber = detectPullRequestNumber();
        let buildName = await generateBuildNameWithGit(options.buildPrefix);

        return {
          branch,
          commit,
          message,
          prNumber,
          buildName,
        };
      },
    }),

    testRunner: Object.freeze({
      // EventEmitter methods for build lifecycle events
      once: testRunner.once.bind(testRunner),
      on: testRunner.on.bind(testRunner),
      off: testRunner.off.bind(testRunner),

      // Build lifecycle
      createBuild: testRunner.createBuild.bind(testRunner),
      finalizeBuild: testRunner.finalizeBuild.bind(testRunner),
    }),

    serverManager: Object.freeze({
      // Server lifecycle
      start: serverManager.start.bind(serverManager),
      stop: serverManager.stop.bind(serverManager),
    }),
  });
}
