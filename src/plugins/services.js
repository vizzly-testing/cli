/**
 * Service Factory
 * Assembles the execution and screenshot-server interfaces consumed by plugins.
 * Commands import their domain operations directly.
 */

import { TestRunner } from '../domains/runs/run-events.js';
import { createServerManager } from '../server/server-manager.js';

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
