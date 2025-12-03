/**
 * Test Runner Service
 * Orchestrates the test execution flow
 */

import { EventEmitter } from 'events';
import { VizzlyError } from '../errors/vizzly-error.js';
import { spawn } from 'child_process';
import * as output from '../utils/output.js';

export class TestRunner extends EventEmitter {
  constructor(config, buildManager, serverManager, tddService) {
    super();
    this.config = config;
    this.buildManager = buildManager;
    this.serverManager = serverManager;
    this.tddService = tddService;
    this.testProcess = null;
  }

  /**
   * Initialize server for daemon mode (no test execution)
   * @param {Object} options - Options for server initialization
   */
  async initialize(options) {
    const { tdd, daemon } = options;

    if (!tdd || !daemon) {
      throw new VizzlyError(
        'Initialize method is only for TDD daemon mode',
        'INVALID_MODE'
      );
    }

    try {
      // Start server manager for daemon mode
      await this.serverManager.start(null, tdd, options.setBaseline);

      this.emit('server-ready', {
        port: options.port,
        mode: 'daemon',
        tdd: true,
      });
    } catch (error) {
      output.error('Failed to initialize TDD daemon server:', error);
      throw error;
    }
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
              output.info(`Build URL: ${buildUrl}`);
            }
          } catch (error) {
            output.debug('build', 'could not retrieve url', {
              error: error.message,
            });
          }
        }
      }

      // Start server with appropriate handler
      await this.serverManager.start(buildId, tdd, options.setBaseline);

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
    }

    // Get TDD results before stopping the server (comparisons, screenshot count)
    let tddResults = null;
    if (tdd) {
      try {
        tddResults = await this.serverManager.getTddResults();
        if (tddResults) {
          screenshotCount = tddResults.total || 0;
        }
      } catch (tddError) {
        output.debug('tdd', 'failed to get results', {
          error: tddError.message,
        });
      }
    }

    // Always finalize the build and stop the server (cleanup phase)
    try {
      const executionTime = Date.now() - startTime;

      if (buildId) {
        try {
          await this.finalizeBuild(buildId, tdd, testSuccess, executionTime);
        } catch (finalizeError) {
          output.error('Failed to finalize build:', finalizeError);
        }
      }

      // In API mode, get actual screenshot count from handler after flush
      if (!tdd && this.serverManager.server?.getScreenshotCount) {
        screenshotCount =
          this.serverManager.server.getScreenshotCount(buildId) || 0;
      }
    } finally {
      // Always stop the server, even if finalization fails
      try {
        await this.serverManager.stop();
      } catch (stopError) {
        output.error('Failed to stop server:', stopError);
      }
    }

    // If there was a test error, throw it now (after cleanup)
    if (testError) {
      output.error('Test run failed:', testError);
      throw testError;
    }

    return {
      buildId: buildId,
      url: buildUrl,
      testsPassed: testSuccess ? 1 : 0,
      testsFailed: testSuccess ? 0 : 1,
      screenshotsCaptured: screenshotCount,
      comparisons: tddResults?.comparisons || null,
      failed: tddResults?.failed > 0,
    };
  }

  async createBuild(options, tdd) {
    if (tdd) {
      // TDD mode: create local build
      const build = await this.buildManager.createBuild(options);
      output.debug('build', `created ${build.id.substring(0, 8)}`);
      return build.id;
    } else {
      // API mode: create build via API
      const apiService = await this.createApiService();
      if (apiService) {
        const buildResult = await apiService.createBuild({
          name: options.buildName || `Test Run ${new Date().toISOString()}`,
          branch: options.branch || 'main',
          environment: options.environment || 'test',
          commit_sha: options.commit,
          commit_message: options.message,
          github_pull_request_number: options.pullRequestNumber,
          parallel_id: options.parallelId,
        });
        output.debug('build', `created ${buildResult.id}`);

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
      return;
    }

    try {
      if (isTddMode) {
        // TDD mode: use server handler to finalize (local-only)
        if (this.serverManager.server?.finishBuild) {
          await this.serverManager.server.finishBuild(buildId);
          output.debug('build', `finalized`, { success });
        }
      } else {
        // API mode: flush uploads first, then finalize build
        if (this.serverManager.server?.finishBuild) {
          await this.serverManager.server.finishBuild(buildId);
        }

        // Then update build status via API
        const apiService = await this.createApiService();
        if (apiService) {
          await apiService.finalizeBuild(buildId, success, executionTime);
          output.debug('build', 'finalized via api', { success });
        } else {
          output.warn(`No API service available to finalize build ${buildId}`);
        }
      }
    } catch (error) {
      // Don't fail the entire run if build finalization fails
      output.warn(`Failed to finalize build ${buildId}:`, error.message);
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
