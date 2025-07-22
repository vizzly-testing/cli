/**
 * Test Runner Service
 * Orchestrates the test execution flow
 */

import { BaseService } from './base-service.js';
import { VizzlyError } from '../errors/vizzly-error.js';
import { spawn } from 'child_process';

export class TestRunner extends BaseService {
  constructor(config, logger, buildManager, serverManager, tddService) {
    super(config, logger);
    this.buildManager = buildManager;
    this.serverManager = serverManager;
    this.tddService = tddService;
    this.testProcess = null;
  }

  async run(options) {
    const { testCommand, tdd, allowNoToken } = options;
    const startTime = Date.now();
    let buildId = null;

    if (!testCommand) {
      throw new VizzlyError('No test command provided', 'TEST_COMMAND_MISSING');
    }

    // If no token is allowed and not in TDD mode, just run the command without Vizzly integration
    if (allowNoToken && !this.config.apiKey && !tdd) {
      const env = {
        ...process.env,
        VIZZLY_ENABLED: 'false',
      };

      await this.executeTestCommand(testCommand, env);

      return {
        testsPassed: 1,
        testsFailed: 0,
        screenshotsCaptured: 0,
      };
    }

    try {
      let buildInfo = null;
      let buildUrl = null;
      let screenshotCount = 0;

      if (tdd) {
        // TDD mode: create local build for fast feedback
        this.logger.debug('TDD mode: creating local build...');
        const build = await this.buildManager.createBuild(options);
        buildId = build.id;
        this.logger.debug(`TDD build created with ID: ${build.id}`);
      } else if (options.eager) {
        // Eager mode: create build immediately via API
        this.logger.debug('Eager mode: creating build via API...');
        const apiService = await this.createApiService();
        if (apiService) {
          const buildResult = await apiService.createBuild({
            build: {
              name: options.buildName || `Test Run ${new Date().toISOString()}`,
              branch: options.branch || 'main',
              environment: options.environment || 'test',
              commit_sha: options.commit,
              commit_message: options.message,
            },
          });
          buildId = buildResult.id;
          buildUrl = buildResult.url;
          this.logger.debug(`Eager build created with ID: ${buildId}`);
          if (buildUrl) {
            this.logger.info(`Build URL: ${buildUrl}`);
          }

          // Emit build created event for eager mode
          this.emit('build-created', {
            buildId: buildResult.id,
            url: buildResult.url,
            name: buildResult.name || options.buildName,
          });
        } else {
          this.logger.warn(
            'No API key available for eager build creation, falling back to lazy mode'
          );
        }
      } else {
        // Lazy mode: prepare build info for API creation on first screenshot
        buildInfo = {
          buildName:
            options.buildName || `Test Run ${new Date().toISOString()}`,
          branch: options.branch || 'main',
          environment: options.environment || 'test',
          commitSha: options.commit,
          commitMessage: options.message,
        };
      }

      // Start server with appropriate configuration
      const mode = tdd ? 'tdd' : options.eager ? 'eager' : 'lazy';
      await this.serverManager.start(buildId, buildInfo, mode);

      // Forward server events
      if (this.serverManager.server && this.serverManager.server.emitter) {
        this.serverManager.server.emitter.on('build-created', buildInfo => {
          // Update local buildId and buildUrl from server
          buildId = buildInfo.buildId;
          buildUrl = buildInfo.url;
          this.emit('build-created', buildInfo);
        });

        this.serverManager.server.emitter.on(
          'screenshot-captured',
          screenshotInfo => {
            screenshotCount++;
            this.emit('screenshot-captured', screenshotInfo);
          }
        );
      }

      if (tdd) {
        this.logger.debug('TDD service ready for comparisons');
      }

      const env = {
        ...process.env,
        VIZZLY_SERVER_URL: `http://localhost:${this.config.server.port}`,
        VIZZLY_BUILD_ID: buildId || 'lazy', // Use 'lazy' for API-driven builds
        VIZZLY_ENABLED: 'true',
        VIZZLY_SET_BASELINE:
          options.setBaseline || options['set-baseline'] ? 'true' : 'false',
      };

      await this.executeTestCommand(testCommand, env);

      // Finalize builds based on mode
      const executionTime = Date.now() - startTime;
      await this.finalizeBuild(buildId, tdd, true, executionTime);

      return {
        buildId: buildId,
        url: buildUrl,
        testsPassed: 1,
        testsFailed: 0,
        screenshotsCaptured: screenshotCount,
      };
    } catch (error) {
      this.logger.error('Test run failed:', error);

      // Finalize builds on failure too
      const executionTime = Date.now() - startTime;
      await this.finalizeBuild(buildId, tdd, false, executionTime);

      throw error;
    } finally {
      await this.serverManager.stop();
      if (
        tdd &&
        this.tddService &&
        typeof this.tddService.stop === 'function'
      ) {
        await this.tddService.stop();
      }
    }
  }

  async createApiService() {
    if (!this.config.apiKey) return null;

    const { ApiService } = await import('./api-service.js');
    return new ApiService(
      { ...this.config, command: 'run' },
      { logger: this.logger }
    );
  }

  async finalizeBuild(buildId, isTddMode, success, executionTime) {
    if (!buildId) {
      this.logger.debug('No buildId to finalize');
      return;
    }

    try {
      if (isTddMode) {
        // TDD mode: use buildManager for local builds
        if (this.buildManager.getCurrentBuild()) {
          await this.buildManager.finalizeBuild(buildId, { success });
          this.logger.debug(
            `TDD build ${buildId} finalized with success: ${success}`
          );
        }
      } else {
        // API mode (eager/lazy): use API service to update build status
        const apiService = await this.createApiService();
        if (apiService) {
          await apiService.finalizeBuild(buildId, success, executionTime);
        }
      }
    } catch (error) {
      // Don't fail the entire run if build finalization fails
      this.logger.warn(`Failed to finalize build ${buildId}:`, error.message);
    }
  }

  async executeTestCommand(testCommand, env) {
    return new Promise((resolve, reject) => {
      // Use shell to execute the full command string
      this.testProcess = spawn(testCommand, {
        env,
        stdio: 'inherit',
        shell: true,
      });

      this.testProcess.on('error', error => {
        reject(
          new VizzlyError(`Failed to run test command: ${error.message}`),
          'TEST_COMMAND_FAILED'
        );
      });

      this.testProcess.on('exit', code => {
        if (code !== 0) {
          reject(
            new VizzlyError(
              `Test command exited with code ${code}`,
              'TEST_COMMAND_FAILED'
            )
          );
        } else {
          resolve();
        }
      });
    });
  }

  async cancel() {
    if (this.testProcess) {
      this.testProcess.kill('SIGTERM');
    }
  }
}
