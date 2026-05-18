/**
 * Build Manager - local build object creation for the test runner.
 */

import { randomUUID } from 'node:crypto';

/**
 * Create a local build object for test-runner orchestration.
 *
 * The API creates persisted build IDs. This object is only used inside the
 * CLI process to give the runner a consistent shape before API creation.
 *
 * @param {Object} buildOptions - Build configuration
 * @param {Object} [deps]
 * @param {Function} [deps.randomId]
 * @param {Function} [deps.now]
 * @param {Function} [deps.timestamp]
 * @returns {Object} Build object
 */
export function createBuildObject(buildOptions, deps = {}) {
  let {
    name,
    branch,
    commit,
    environment = 'test',
    metadata = {},
  } = buildOptions;
  let randomId = deps.randomId || randomUUID;
  let now = deps.now || (() => new Date().toISOString());
  let timestamp = deps.timestamp || Date.now;

  return {
    id: `build-${randomId()}`,
    name: name || `build-${timestamp()}`,
    branch,
    commit,
    environment,
    metadata,
    status: 'pending',
    createdAt: now(),
    screenshots: [],
  };
}
