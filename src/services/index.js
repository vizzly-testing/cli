/**
 * Service Factory
 * Creates services for plugin API compatibility.
 *
 * Internal commands now use functional modules directly:
 * - API: import { createApiClient, getBuild } from '../api/index.js'
 * - Auth: import { createAuthClient, whoami } from '../auth/index.js'
 *
 * This factory is only used by cli.js to provide services to plugins.
 */

import { createServerManager } from '../server-manager/index.js';
import { TestRunner } from './test-runner.js';

/**
 * Create services for plugin API compatibility.
 *
 * Only creates services that plugins actually need:
 * - testRunner: Build lifecycle management with EventEmitter
 * - serverManager: Screenshot server control
 *
 * Commands use functional modules directly - this factory exists
 * only to support the plugin API contract.
 *
 * @param {Object} config - Configuration object
 * @returns {Object} Services object for plugins
 */
export function createServices(config) {
  let serverManager = createServerManager(config, {});

  let testRunner = new TestRunner(config, serverManager);

  return {
    serverManager,
    testRunner,
  };
}
