/**
 * Service Factory
 * Creates all services with explicit dependencies - no DI container needed
 */

import { ApiService } from './api-service.js';
import { AuthService } from './auth-service.js';
import { BuildManager } from './build-manager.js';
import { ConfigService } from './config-service.js';
import { ProjectService } from './project-service.js';
import { ServerManager } from './server-manager.js';
import { createTDDService } from './tdd-service.js';
import { TestRunner } from './test-runner.js';
import { createUploader } from './uploader.js';

/**
 * Create all services with their dependencies
 * @param {Object} config - Configuration object
 * @param {string} [command='run'] - Command context ('run', 'tdd', 'status')
 * @returns {Object} Services object
 */
export function createServices(config, command = 'run') {
  const apiService = new ApiService({ ...config, allowNoToken: true });
  const authService = new AuthService({ baseUrl: config.apiUrl });
  const configService = new ConfigService(config, {
    projectRoot: process.cwd(),
  });
  const projectService = new ProjectService(config, {
    apiService,
    authService,
  });
  const uploader = createUploader({ ...config, command });
  const buildManager = new BuildManager(config);
  const tddService = createTDDService(config, { authService });

  const serverManager = new ServerManager(config, {
    services: { configService, authService, projectService },
  });

  const testRunner = new TestRunner(
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
