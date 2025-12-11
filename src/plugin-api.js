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

/**
 * Creates a stable plugin services object from the internal services
 *
 * Only exposes:
 * - testRunner: Build lifecycle management (createBuild, finalizeBuild, events)
 * - serverManager: Screenshot server control (start, stop)
 *
 * @param {Object} services - Internal services from createServices()
 * @returns {Object} Frozen plugin services object
 */
export function createPluginServices(services) {
  let { testRunner, serverManager } = services;

  return Object.freeze({
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
