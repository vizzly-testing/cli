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
  // Direct programmatic config is explicit; loadConfig already distinguishes
  // explicit comparison settings from its local fallback defaults.
  let serviceConfig = {
    ...config,
    _comparisonOverrides:
      config._comparisonOverrides ?? config.comparison ?? {},
  };
  let serverManager = createServerManager(serviceConfig, {});

  let testRunner = new TestRunner(serviceConfig, serverManager);

  return {
    serverManager,
    testRunner,
  };
}
