import { createServer } from 'http';
import { randomUUID } from 'crypto';
import { Buffer } from 'buffer';
// import { createVizzly } from '../sdk/index.js'; // Commented out until needed
import { createServiceLogger } from '../utils/logger-factory.js';
import { TddService } from '../services/tdd-service.js';
import { colors } from '../utils/colors.js';

const logger = createServiceLogger('SERVER');

// Constants for lazy build creation
const VIZZLY_LAZY_BUILD_ID = 'lazy';

export class VizzlyServer {
  constructor({
    port,
    config,
    tddMode = false,
    baselineBuild,
    baselineComparison,
    workingDir,
    buildId = null,
    vizzlyApi = null,
    buildInfo = null,
    emitter = null,
  }) {
    this.port = port;
    this.config = config;
    this.builds = new Map();
    this.server = null;
    this.tddMode = tddMode;
    this.baselineBuild = baselineBuild;
    this.baselineComparison = baselineComparison;
    this.tddService = tddMode ? new TddService(config, workingDir) : null;
    this.buildId = buildId;
    this.vizzlyApi = vizzlyApi;
    this.buildInfo = buildInfo; // For lazy build creation
    this.emitter = emitter; // Event emitter for UI updates
    this.vizzlyDisabled = false; // Circuit breaker: disable Vizzly after first 500 error
  }

  async start() {
    // Initialize TDD mode if enabled
    if (this.tddMode && this.tddService) {
      logger.info('🔄 TDD mode enabled - setting up local comparison...');

      // Try to load existing baseline first
      const baseline = await this.tddService.loadBaseline();

      if (!baseline) {
        // Only try to download if we have an API token
        if (this.config.apiKey) {
          logger.info('📥 No local baseline found, downloading from Vizzly...');
          // Download baseline from the latest passed build
          await this.tddService.downloadBaselines(
            this.baselineBuild,
            this.baselineComparison
          );
        } else {
          logger.info(
            '📝 No local baseline found and no API token - all screenshots will be marked as new'
          );
        }
      } else {
        logger.info(
          `✅ Using existing baseline: ${colors.cyan(baseline.buildName)}`
        );
      }
    }

    // Register active build if provided
    if (this.buildId) {
      this.builds.set(this.buildId, {
        id: this.buildId,
        name: `Active Build ${this.buildId}`,
        branch: 'current',
        environment: 'test',
        screenshots: [],
        createdAt: Date.now(),
      });
      logger.debug(`Registered active build: ${this.buildId}`);
    }

    return new Promise((resolve, reject) => {
      this.server = createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res);
        } catch (error) {
          logger.error('Server error:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });

      this.server.listen(this.port, '127.0.0.1', error => {
        if (error) {
          reject(error);
        } else {
          logger.debug(
            `HTTP server listening on http://127.0.0.1:${this.port}`
          );
          resolve();
        }
      });

      this.server.on('error', error => {
        if (error.code === 'EADDRINUSE') {
          reject(
            new Error(
              `Port ${this.port} is already in use. Try a different port with --port.`
            )
          );
        } else {
          reject(error);
        }
      });
    });
  }

  async handleRequest(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.statusCode = 200;
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: 'ok',
          builds: this.builds.size,
          port: this.port,
          uptime: process.uptime(),
        })
      );
      return;
    }

    const screenshotPath = this.config?.server?.screenshotPath || '/screenshot';
    if (req.method === 'POST' && req.url === screenshotPath) {
      await this.handleScreenshot(req, res);
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  async handleScreenshot(req, res) {
    try {
      const body = await this.parseRequestBody(req);

      let { buildId, name, properties, image } = body;

      if (!buildId || !name || !image) {
        res.statusCode = 400;
        res.end(
          JSON.stringify({ error: 'buildId, name, and image are required' })
        );
        return;
      }

      // If Vizzly has been disabled due to server errors, skip upload and continue tests
      if (this.vizzlyDisabled) {
        logger.debug(`Screenshot captured (Vizzly disabled): ${name}`);

        // Create a mock build entry to track screenshot count for user feedback
        const mockBuildId = 'disabled-build';
        if (!this.builds.has(mockBuildId)) {
          this.builds.set(mockBuildId, {
            id: mockBuildId,
            name: 'Disabled Build',
            screenshots: [],
            createdAt: Date.now(),
          });
        }

        const mockBuild = this.builds.get(mockBuildId);
        mockBuild.screenshots.push({
          name,
          timestamp: Date.now(),
          disabled: true,
        });

        res.statusCode = 200;
        res.end(
          JSON.stringify({
            success: true,
            disabled: true,
            count: mockBuild.screenshots.length,
            message: `Vizzly disabled - ${mockBuild.screenshots.length} screenshots captured but not uploaded`,
          })
        );
        return;
      }

      // Handle lazy build creation or mapping
      if (buildId === VIZZLY_LAZY_BUILD_ID) {
        if (this.buildId) {
          // Build already created, use existing build ID
          buildId = this.buildId;
        } else if (this.buildInfo && this.vizzlyApi) {
          // Create build now
          const creatingMessage =
            '🏗️  Creating build (first screenshot captured)...';
          logger.debug(creatingMessage); // Change to debug level
          // Don't emit log event - let the build-created event handle UI updates

          try {
            const buildResult = await this.vizzlyApi.createBuild({
              build: {
                name: this.buildInfo.buildName,
                branch: this.buildInfo.branch,
                environment: this.buildInfo.environment || 'test',
                commit_sha: this.buildInfo.commitSha,
                commit_message: this.buildInfo.commitMessage,
              },
            });

            this.buildId = buildResult.id;
            buildId = this.buildId; // Update local variable
            const buildUrl = buildResult.url;

            // Register the build in our local map
            this.builds.set(this.buildId, {
              id: this.buildId,
              name: this.buildInfo.buildName,
              branch: this.buildInfo.branch,
              environment: 'test',
              screenshots: [],
              createdAt: Date.now(),
            });

            const createdMessage = `✅ Build created: ${this.buildInfo.buildName}`;
            const urlMessage = `🔗 Build URL: ${buildUrl}`;
            logger.debug(createdMessage); // Change to debug level
            logger.debug(urlMessage); // Change to debug level
            // Don't emit log events - the build-created event will handle UI
            if (this.emitter) {
              this.emitter.emit('build-created', {
                buildId: this.buildId,
                url: buildUrl,
                name: this.buildInfo.buildName,
              });
            }

            // Clear buildInfo since we no longer need it
            this.buildInfo = null;
          } catch (buildError) {
            logger.error('Failed to create build:', {
              error: buildError.message,
              code: buildError.code,
              stack: buildError.stack,
              buildInfo: this.buildInfo,
              apiUrl: this.vizzlyApi?.apiUrl,
              hasApiKey: !!this.config.apiKey,
            });

            // Log additional context for debugging
            if (buildError.response) {
              logger.error('API Response details:', {
                status: buildError.response.status,
                statusText: buildError.response.statusText,
                headers: buildError.response.headers,
              });
            }

            // Disable Vizzly on any build creation error
            this.vizzlyDisabled = true;
            const disabledMessage = `⚠️  Vizzly disabled due to build creation error: ${buildError.message} - continuing tests without visual testing`;
            logger.warn(disabledMessage);
            if (this.emitter) this.emitter.emit('log', disabledMessage);

            // Return success to allow tests to continue
            res.statusCode = 200;
            res.end(
              JSON.stringify({
                success: true,
                disabled: true,
                message:
                  'Vizzly disabled due to build creation error - screenshot captured but not uploaded',
              })
            );
            return;
          }
        } else {
          // No buildInfo available and no existing build - this shouldn't happen in lazy mode
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error:
                'Build creation failed - lazy mode requires valid configuration',
            })
          );
          return;
        }
      }

      const build = this.builds.get(buildId);
      if (!build) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Build not found' }));
        return;
      }

      // Store screenshot data (image is base64 encoded)
      const screenshot = {
        name,
        imageData: image,
        properties: properties || {},
        timestamp: Date.now(),
      };

      build.screenshots.push(screenshot);

      // Log screenshot capture (debug only, don't spam UI)
      logger.debug(`Screenshot captured: ${name}`);

      // Emit count update instead of individual logs
      if (this.emitter) {
        this.emitter.emit('screenshot-captured', {
          name,
          count: build.screenshots.length,
        });
      }

      // Handle TDD mode comparison - fail fast on visual differences
      if (this.tddMode && this.tddService) {
        const imageBuffer = Buffer.from(image, 'base64');
        const comparison = await this.tddService.compareScreenshot(
          name,
          imageBuffer,
          properties || {}
        );

        if (comparison.status === 'failed') {
          // Visual difference detected - fail immediately (clean logging for TDD)
          res.statusCode = 422; // Unprocessable Entity
          res.end(
            JSON.stringify({
              error: 'Visual difference detected',
              details: `Screenshot '${name}' differs from baseline`,
              comparison: {
                name: comparison.name,
                status: comparison.status,
                baseline: comparison.baseline,
                current: comparison.current,
                diff: comparison.diff,
              },
              tddMode: true,
            })
          );
          return;
        }

        if (comparison.status === 'baseline-updated') {
          // Baseline was updated successfully
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              status: 'success',
              message: `Baseline updated for ${name}`,
              comparison: {
                name: comparison.name,
                status: comparison.status,
                baseline: comparison.baseline,
                current: comparison.current,
              },
              tddMode: true,
            })
          );
          return;
        }

        if (comparison.status === 'error') {
          // Comparison error (clean logging for TDD)
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: `Comparison failed: ${comparison.error}`,
              tddMode: true,
            })
          );
          return;
        }

        // Success (passed or new)
        logger.debug(`✅ TDD: ${comparison.status.toUpperCase()} ${name}`);
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            success: true,
            comparison: {
              name: comparison.name,
              status: comparison.status,
            },
            tddMode: true,
          })
        );
        return;
      }

      // Non-TDD mode: Upload screenshot immediately to API
      if (
        this.vizzlyApi &&
        buildId !== VIZZLY_LAZY_BUILD_ID &&
        !this.vizzlyDisabled
      ) {
        try {
          const imageBuffer = Buffer.from(image, 'base64');
          const result = await this.vizzlyApi.uploadScreenshot(
            buildId,
            name,
            imageBuffer,
            properties ?? {}
          );

          // Log upload or skip
          if (result.skipped) {
            logger.debug(`Screenshot already exists, skipped: ${name}`);
          } else {
            logger.debug(`Screenshot uploaded: ${name}`);
          }
          if (this.emitter)
            this.emitter.emit('screenshot-uploaded', {
              name,
              skipped: result.skipped,
            });
        } catch (uploadError) {
          logger.error(
            `❌ Failed to upload screenshot ${name}:`,
            uploadError.message
          );

          // Disable Vizzly on any upload error
          this.vizzlyDisabled = true;
          const disabledMessage =
            '⚠️  Vizzly disabled due to upload error - continuing tests without visual testing';
          logger.warn(disabledMessage);
          if (this.emitter) this.emitter.emit('log', disabledMessage);
          // Continue anyway - don't fail the test for upload errors
        }
      }

      logger.debug(`Screenshot received: ${name}`);

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          success: true,
          count: build.screenshots.length,
          name: screenshot.name,
          tddMode: false,
        })
      );
    } catch (error) {
      logger.error('Screenshot upload error:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Failed to process screenshot' }));
    }
  }

  async parseRequestBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';

      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(data);
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });

      req.on('error', reject);
    });
  }

  async stop() {
    if (this.server) {
      return new Promise(resolve => {
        this.server.close(() => {
          this.server = null;
          logger.debug('HTTP server stopped');
          resolve();
        });
      });
    }

    // Clear builds from memory
    this.builds.clear();

    logger.debug('Cleanup completed');
  }

  async createBuild(options) {
    const buildId = randomUUID();

    const build = {
      id: buildId,
      name: options.name,
      branch: options.branch,
      environment: options.environment,
      screenshots: [],
      createdAt: Date.now(),
    };

    this.builds.set(buildId, build);

    logger.debug(`Build created: ${buildId} - ${options.name}`);

    return buildId;
  }

  getScreenshotCount(buildId) {
    const build = this.builds.get(buildId);
    return build ? build.screenshots.length : 0;
  }

  getTotalScreenshotCount() {
    let total = 0;
    for (const build of this.builds.values()) {
      total += build.screenshots.length;
    }
    return total;
  }

  async finishBuild(buildId) {
    const build = this.builds.get(buildId);
    if (!build) {
      throw new Error(`Build ${buildId} not found`);
    }

    if (build.screenshots.length === 0) {
      throw new Error(
        'No screenshots to upload. Make sure your tests are calling the Vizzly screenshot function.'
      );
    }

    // Handle TDD mode completion
    if (this.tddMode && this.tddService) {
      const results = this.tddService.printResults();

      // Cleanup this build
      await this.cleanupBuild(buildId);

      // Return TDD results instead of uploading
      return {
        id: buildId,
        name: build.name,
        tddMode: true,
        results,
        url: null, // No URL for TDD mode
        passed: results.failed === 0 && results.errors === 0,
      };
    }

    // Upload to Vizzly API using existing SDK
    const vizzly = createVizzly(this.config);

    await vizzly.startBuild({
      name: build.name,
      branch: build.branch,
      environment: build.environment,
    });

    // Upload each screenshot
    for (const screenshot of build.screenshots) {
      const imageBuffer = Buffer.from(screenshot.imageData, 'base64');

      await vizzly.screenshot({
        name: screenshot.name,
        image: imageBuffer,
        properties: screenshot.properties,
      });
    }

    const result = await vizzly.finishBuild();

    // Cleanup this build
    await this.cleanupBuild(buildId);

    logger.debug(`Build ${buildId} uploaded successfully as ${result.id}`);

    return result;
  }

  async cleanupBuild(buildId) {
    const build = this.builds.get(buildId);
    if (!build) return;

    // Remove from memory
    this.builds.delete(buildId);

    logger.debug(`Build ${buildId} cleaned up`);
  }
}
