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

    let buildUrl = null;
    let screenshotCount = 0;
    let testSuccess = false;
    let testError = null;

    try {
      // Create build based on mode
      buildId = await this.createBuild(options, tdd);
      if (!tdd && buildId) {
        // Get build URL for API mode
        const apiService = await this.createApiService();
        if (apiService) {
          try {
            const build = await apiService.getBuild(buildId);
            buildUrl = build.url;
            if (buildUrl) {
              this.logger.info(`Build URL: ${buildUrl}`);
            }
          } catch (error) {
            this.logger.debug('Could not retrieve build URL:', error.message);
          }
        }
      }

      // Start server with appropriate handler
      await this.serverManager.start(buildId, tdd);

      // Forward server events
      if (this.serverManager.server?.emitter) {
        this.serverManager.server.emitter.on(
          'screenshot-captured',
          screenshotInfo => {
            screenshotCount++;
            this.emit('screenshot-captured', screenshotInfo);
          }
        );
      }

      const env = {
        ...process.env,
        VIZZLY_SERVER_URL: `http://localhost:${this.config.server.port}`,
        VIZZLY_BUILD_ID: buildId,
        VIZZLY_ENABLED: 'true',
        VIZZLY_SET_BASELINE:
          options.setBaseline || options['set-baseline'] ? 'true' : 'false',
      };

      try {
        await this.executeTestCommand(testCommand, env);
        testSuccess = true;
      } catch (error) {
        testError = error;
        testSuccess = false;
      }
    } catch (error) {
      // Error in setup phase
      testError = error;
      testSuccess = false;
    } finally {
      // Always finalize the build and stop the server
      const executionTime = Date.now() - startTime;

      if (buildId) {
        try {
          await this.finalizeBuild(buildId, tdd, testSuccess, executionTime);
        } catch (finalizeError) {
          this.logger.error('Failed to finalize build:', finalizeError);
        }
      }

      try {
        await this.serverManager.stop();
      } catch (stopError) {
        this.logger.error('Failed to stop server:', stopError);
      }

    }

    // If there was a test error, throw it now (after cleanup)
    if (testError) {
      this.logger.error('Test run failed:', testError);
      throw testError;
    }

    return {
      buildId: buildId,
      url: buildUrl,
      testsPassed: testSuccess ? 1 : 0,
      testsFailed: testSuccess ? 0 : 1,
      screenshotsCaptured: screenshotCount,
    };
  }

  async createBuild(options, tdd) {
    if (tdd) {
      // TDD mode: create local build
      this.logger.debug('TDD mode: creating local build...');
      const build = await this.buildManager.createBuild(options);
      this.logger.debug(`TDD build created with ID: ${build.id}`);
      return build.id;
    } else {
      // API mode: create build via API
      this.logger.debug('Creating build via API...');
      const apiService = await this.createApiService();
      if (apiService) {
        const buildResult = await apiService.createBuild({
          name: options.buildName || `Test Run ${new Date().toISOString()}`,
          branch: options.branch || 'main',
          environment: options.environment || 'test',
          commit_sha: options.commit,
          commit_message: options.message,
          github_pull_request_number: options.pullRequestNumber,
        });
        this.logger.debug(`Build created with ID: ${buildResult.id}`);

        // Emit build created event
        this.emit('build-created', {
          buildId: buildResult.id,
          url: buildResult.url,
          name: buildResult.name || options.buildName,
        });

        return buildResult.id;
      } else {
        throw new VizzlyError(
          'No API key available for build creation',
          'API_KEY_MISSING'
        );
      }
    }
  }

  async createApiService() {
    if (!this.config.apiKey) return null;

    const { ApiService } = await import('./api-service.js');
    return new ApiService({
      ...this.config,
      command: 'run',
      uploadAll: this.config.uploadAll,
    });
  }

  async finalizeBuild(buildId, isTddMode, success, executionTime) {
    if (!buildId) {
      this.logger.debug('No buildId to finalize');
      return;
    }

    try {
      if (isTddMode) {
        // TDD mode: use server handler to finalize (local-only)
        if (this.serverManager.server?.finishBuild) {
          await this.serverManager.server.finishBuild(buildId);
          this.logger.debug(
            `TDD build ${buildId} finalized with success: ${success}`
          );
        } else {
          // In TDD mode without a server, just log that finalization is skipped
          this.logger.debug(
            `TDD build ${buildId} finalization skipped (local-only mode)`
          );
        }
      } else {
        // API mode: use API service to update build status
        const apiService = await this.createApiService();
        if (apiService) {
          await apiService.finalizeBuild(buildId, success, executionTime);
        }
      }
    } catch (error) {
      // Don't fail the entire run if build finalization fails
      this.logger.warn(`Failed to finalize build ${buildId}:`, error.message);
      // Emit event for UI handling
      this.emit('build-finalize-failed', {
        buildId,
        error: error.message,
        stack: error.stack,
      });
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

      this.testProcess.on('exit', (code, signal) => {
        // If process was killed by SIGINT, treat as interruption
        if (signal === 'SIGINT') {
          reject(
            new VizzlyError(
              'Test command was interrupted',
              'TEST_COMMAND_INTERRUPTED'
            )
          );
        } else if (code !== 0) {
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
    if (this.testProcess && !this.testProcess.killed) {
      this.testProcess.kill('SIGKILL');
    }

    // Stop server manager if running
    if (this.serverManager) {
      await this.serverManager.stop();
    }
  }
}
