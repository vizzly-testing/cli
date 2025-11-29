/**
 * Service Factory
 * Creates all services with explicit dependencies - no DI container needed
 */

import { ApiService } from './api-service.js';
import { AuthService } from './auth-service.js';
import { ConfigService } from './config-service.js';
import { ProjectService } from './project-service.js';
import { createUploader } from './uploader.js';
import { BuildManager } from './build-manager.js';
import { ServerManager } from './server-manager.js';
import { createTDDService } from './tdd-service.js';
import { TestRunner } from './test-runner.js';

/**
 * Create all services with their dependencies
 * @param {Object} config - Configuration object
 * @param {string} [command='run'] - Command context ('run', 'tdd', 'status')
 * @returns {Object} Services object
 */
export function createServices(config, command = 'run') {
  let apiService = new ApiService({ ...config, allowNoToken: true });
  let authService = new AuthService({ baseUrl: config.apiUrl });
  let configService = new ConfigService(config, {
    projectRoot: process.cwd(),
  });
  let projectService = new ProjectService(config, {
    apiService,
    authService,
  });
  let uploader = createUploader({ ...config, command });
  let buildManager = new BuildManager(config);
  let tddService = createTDDService(config, { authService });

  let serverManager = new ServerManager(config, {
    services: { configService, authService, projectService },
  });

  let testRunner = new TestRunner(
    config,
    buildManager,
    serverManager,
    tddService
  );

  return {
    apiService,
    authService,
    configService,
    projectService,
    uploader,
    buildManager,
    serverManager,
    tddService,
    testRunner,
  };
}
