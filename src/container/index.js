import { EventEmitter } from 'events';
import { VizzlyError } from '../errors/vizzly-error.js';

/**
 * @typedef {Object} ServiceDefinition
 * @property {Function} factory - Factory function to create service instance
 * @property {boolean} [singleton=true] - Whether to cache the instance
 * @property {string[]} [dependencies=[]] - Array of dependency names
 */

/**
 * Service container for dependency injection and lifecycle management
 */
export class ServiceContainer extends EventEmitter {
  constructor() {
    super();
    this.services = new Map();
    this.instances = new Map();
    this.starting = new Map();
  }

  /**
   * Register a service
   * @param {string} name - Service name
   * @param {Function|ServiceDefinition} factoryOrDefinition - Factory function or service definition
   */
  register(name, factoryOrDefinition) {
    const definition =
      typeof factoryOrDefinition === 'function'
        ? { factory: factoryOrDefinition, singleton: true, dependencies: [] }
        : factoryOrDefinition;

    this.services.set(name, definition);
    this.emit('service:registered', { name, definition });
  }

  /**
   * Get a service instance
   * @param {string} name - Service name
   * @returns {Promise<any>} Service instance
   */
  async get(name) {
    if (!this.services.has(name)) {
      throw new VizzlyError(
        `Service '${name}' not registered`,
        'SERVICE_NOT_FOUND',
        { name }
      );
    }

    const definition = this.services.get(name);

    // Return cached instance for singletons
    if (definition.singleton && this.instances.has(name)) {
      return this.instances.get(name);
    }

    // Prevent circular dependencies during startup
    if (this.starting.has(name)) {
      throw new VizzlyError(
        `Circular dependency detected for service '${name}'`,
        'CIRCULAR_DEPENDENCY',
        { name }
      );
    }

    try {
      this.starting.set(name, true);

      // Resolve dependencies
      const deps = await Promise.all(
        (definition.dependencies || []).map(dep => this.get(dep))
      );

      // Create instance
      const instance = await definition.factory(...deps);

      // Cache singleton instances
      if (definition.singleton) {
        this.instances.set(name, instance);
      }

      this.emit('service:created', { name, instance });
      return instance;
    } finally {
      this.starting.delete(name);
    }
  }

  /**
   * Start all registered services
   */
  async startAll() {
    const services = Array.from(this.services.keys());

    for (const name of services) {
      const instance = await this.get(name);
      if (instance && typeof instance.start === 'function') {
        await instance.start();
        this.emit('service:started', { name, instance });
      }
    }
  }

  /**
   * Stop all services in reverse order
   */
  async stopAll() {
    const instances = Array.from(this.instances.entries()).reverse();

    for (const [name, instance] of instances) {
      if (instance && typeof instance.stop === 'function') {
        await instance.stop();
        this.emit('service:stopped', { name, instance });
      }
    }
  }

  /**
   * Clear all services and instances
   */
  clear() {
    this.services.clear();
    this.instances.clear();
    this.starting.clear();
  }
}

// Export singleton instance
export const container = new ServiceContainer();
/**
 * Create a configured service container
 * @param {Object} config - Configuration object
 * @returns {ServiceContainer}
 */
export async function createServiceContainer(config, command = 'run') {
  const container = new ServiceContainer();

  // Dynamic ESM imports to avoid circular deps
  const [
    { createComponentLogger },
    { ApiService },
    { createUploader },
    { createTDDService },
    { TestRunner },
    { BuildManager },
    { ServerManager },
    { AuthService },
    { ConfigService },
    { ProjectService },
  ] = await Promise.all([
    import('../utils/logger-factory.js'),
    import('../services/api-service.js'),
    import('../services/uploader.js'),
    import('../services/tdd-service.js'),
    import('../services/test-runner.js'),
    import('../services/build-manager.js'),
    import('../services/server-manager.js'),
    import('../services/auth-service.js'),
    import('../services/config-service.js'),
    import('../services/project-service.js'),
  ]);

  // Create logger instance once
  const logger = createComponentLogger('CONTAINER', {
    level: config.logLevel || (config.verbose ? 'debug' : 'warn'),
    verbose: config.verbose || false,
  });

  // Register services without circular dependencies
  container.register('logger', () => logger);

  container.register('apiService', () => new ApiService(config, { logger, allowNoToken: true }));

  container.register('authService', () => new AuthService({ baseUrl: config.apiUrl }));

  container.register('configService', () =>
    new ConfigService(config, { logger, projectRoot: process.cwd() })
  );

  container.register('projectService', {
    factory: async apiService =>
      new ProjectService(config, { logger, apiService }),
    dependencies: ['apiService'],
  });

  container.register('uploader', () =>
    createUploader({ ...config, command }, { logger })
  );

  container.register('buildManager', () => new BuildManager(config, logger));

  container.register('serverManager', {
    factory: async (configService, authService, projectService) =>
      new ServerManager(config, {
        logger,
        services: { configService, authService, projectService },
      }),
    dependencies: ['configService', 'authService', 'projectService'],
  });

  container.register('tddService', () => createTDDService(config, { logger }));

  container.register('testRunner', {
    factory: async (buildManager, serverManager, tddService) =>
      new TestRunner(config, logger, buildManager, serverManager, tddService),
    dependencies: ['buildManager', 'serverManager', 'tddService'],
  });

  return container;
}
