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
    const { testCommand, tdd } = options;

    if (!testCommand) {
      throw new VizzlyError('No test command provided', 'TEST_COMMAND_MISSING');
    }

    try {
      await this.serverManager.start();

      if (tdd) {
        await this.tddService.start();
      }

      const build = await this.buildManager.createBuild(options);

      const env = {
        ...process.env,
        VIZZLY_SERVER_URL: `http://localhost:${this.config.server.port}`,
        VIZZLY_BUILD_ID: build.id,
        VIZZLY_ENABLED: 'true',
      };

      await this.executeTestCommand(testCommand, env);

      await this.buildManager.finalizeBuild(build.id, { success: true });
    } catch (error) {
      this.logger.error('Test run failed:', error);
      if (this.buildManager.getCurrentBuild()) {
        await this.buildManager.finalizeBuild(
          this.buildManager.getCurrentBuild().id,
          { success: false }
        );
      }
      throw error;
    } finally {
      await this.serverManager.stop();
      if (tdd) {
        await this.tddService.stop();
      }
    }
  }

  async executeTestCommand(testCommand, env) {
    return new Promise((resolve, reject) => {
      const [command, ...args] = testCommand.split(' ');

      this.testProcess = spawn(command, args, {
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
