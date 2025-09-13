/**
 * Vizzly SDK - Full API for custom integrations
 *
 * This is the comprehensive SDK for building custom Vizzly integrations.
 * For simple test runner usage, use @vizzly-testing/cli/client instead.
 */

/**
 * @module @vizzly-testing/cli/sdk
 * @description Full SDK for custom integrations and advanced usage
 */

import { EventEmitter } from 'events';
import { createUploader } from '../services/uploader.js';
import { createTDDService } from '../services/tdd-service.js';
import { ScreenshotServer } from '../services/screenshot-server.js';
import { loadConfig } from '../utils/config-loader.js';
import { createComponentLogger } from '../utils/logger-factory.js';
import { VizzlyError } from '../errors/vizzly-error.js';

/**
 * Create a new Vizzly instance with custom configuration
 *
 * @param {import('../types').VizzlyConfig} [config] - Configuration options
 * @returns {Promise<VizzlySDK>} Configured Vizzly SDK instance
 *
 * @example
 * // Create with custom config
 * import { createVizzly } from '@vizzly-testing/cli/sdk';
 *
 * const vizzly = await createVizzly({
 *   apiKey: process.env.VIZZLY_TOKEN,
 *   apiUrl: 'https://app.vizzly.dev',
 *   server: {
 *     port: 3003,
 *     enabled: true
 *   }
 * });
 *
 * // Start the server
 * await vizzly.start();
 *
 * // Take screenshots
 * const screenshot = await getScreenshotSomehow();
 * await vizzly.screenshot('my-test', screenshot);
 *
 * // Upload results
 * const result = await vizzly.upload();
 * console.log(`Build URL: ${result.url}`);
 *
 * // Cleanup
 * await vizzly.stop();
 */
export function createVizzly(config = {}, options = {}) {
  const logger =
    options.logger ||
    createComponentLogger('SDK', {
      level: options.logLevel || 'info',
      verbose: options.verbose || false,
    });

  // Merge with loaded config
  const resolvedConfig = { ...config };

  /**
   * Initialize SDK with config loading
   */
  const init = async () => {
    const fileConfig = await loadConfig();
    Object.assign(resolvedConfig, fileConfig, config); // CLI config takes precedence
    return resolvedConfig;
  };

  /**
   * Create uploader service
   */
  const createUploaderService = (uploaderOptions = {}) => {
    return createUploader(
      { apiKey: resolvedConfig.apiKey, apiUrl: resolvedConfig.apiUrl },
      { ...options, ...uploaderOptions, logger }
    );
  };

  /**
   * Create TDD service
   */
  const createTDDServiceInstance = (tddOptions = {}) => {
    return createTDDService(resolvedConfig, {
      ...options,
      ...tddOptions,
      logger,
    });
  };

  /**
   * Upload screenshots (convenience method)
   */
  const upload = async uploadOptions => {
    const uploader = createUploaderService();
    return uploader.upload(uploadOptions);
  };

  /**
   * Start TDD mode (convenience method)
   */
  const startTDD = async (tddOptions = {}) => {
    const tddService = createTDDServiceInstance();
    return tddService.start(tddOptions);
  };

  return {
    // Core methods
    init,
    upload,
    startTDD,

    // Service factories
    createUploader: createUploaderService,
    createTDDService: createTDDServiceInstance,

    // Utilities
    loadConfig: () => loadConfig(),
    createLogger: loggerOptions => createComponentLogger('USER', loggerOptions),

    // Config access
    getConfig: () => ({ ...resolvedConfig }),
    updateConfig: newConfig => Object.assign(resolvedConfig, newConfig),
  };
}

/**
 * @typedef {Object} VizzlySDK
 * @property {Function} start - Start the Vizzly server
 * @property {Function} stop - Stop the Vizzly server
 * @property {Function} screenshot - Capture a screenshot
 * @property {Function} upload - Upload screenshots to Vizzly
 * @property {Function} compare - Run local comparison (TDD mode)
 * @property {Function} getConfig - Get current configuration
 * @property {Function} on - Subscribe to events
 * @property {Function} off - Unsubscribe from events
 */

/**
 * VizzlySDK class implementation
 * @class
 * @extends {EventEmitter}
 */
export class VizzlySDK extends EventEmitter {
  /**
   * @param {import('../types').VizzlyConfig} config - Configuration
   * @param {import('../utils/logger').Logger} logger - Logger instance
   * @param {Object} services - Service instances
   */
  constructor(config, logger, services) {
    super();
    this.config = config;
    this.logger = logger;
    this.services = services;
    this.server = null;
    this.currentBuildId = null;
  }

  /**
   * Stop the Vizzly server
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.server) {
      await this.server.stop();
      this.server = null;
      this.emit('server:stopped');
      this.logger.info('Vizzly server stopped');
    }
  }

  /**
   * Get current configuration
   * @returns {Object} Current config
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Start the Vizzly server
   * @returns {Promise<{port: number, url: string}>} Server information
   */
  async start() {
    if (this.server) {
      this.logger.warn('Server already running');
      return {
        port: this.config.server?.port || 3000,
        url: `http://localhost:${this.config.server?.port || 3000}`,
      };
    }

    // Create a simple build manager for screenshot collection
    const buildManager = {
      screenshots: new Map(),
      currentBuildId: null,

      async addScreenshot(buildId, screenshot) {
        if (!this.screenshots.has(buildId)) {
          this.screenshots.set(buildId, []);
        }
        this.screenshots.get(buildId).push(screenshot);
      },

      getScreenshots(buildId) {
        return this.screenshots.get(buildId) || [];
      },
    };

    this.server = new ScreenshotServer(this.config, this.logger, buildManager);

    await this.server.start();

    const port = this.config.server?.port || 3000;
    const serverInfo = {
      port,
      url: `http://localhost:${port}`,
    };

    this.emit('server:started', serverInfo);
    return serverInfo;
  }

  /**
   * Capture a screenshot
   * @param {string} name - Screenshot name
   * @param {Buffer} imageBuffer - Image data
   * @param {import('../types').ScreenshotOptions} [options] - Options
   * @returns {Promise<void>}
   */
  async screenshot(name, imageBuffer, options = {}) {
    if (!this.server || !this.server.isRunning()) {
      throw new VizzlyError(
        'Server not running. Call start() first.',
        'SERVER_NOT_RUNNING'
      );
    }

    // Generate or use provided build ID
    const buildId = options.buildId || this.currentBuildId || 'default';
    this.currentBuildId = buildId;

    // Convert Buffer to base64 for JSON transport
    const imageBase64 = imageBuffer.toString('base64');

    const screenshotData = {
      buildId,
      name,
      image: imageBase64,
      properties: options.properties || {},
    };

    // POST to the local screenshot server
    const serverUrl = `http://localhost:${this.config.server?.port || 3000}`;

    try {
      const response = await fetch(`${serverUrl}/screenshot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(screenshotData),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Unknown error' }));
        throw new VizzlyError(
          `Screenshot capture failed: ${errorData.error}`,
          'SCREENSHOT_FAILED',
          { name, buildId, status: response.status }
        );
      }

      this.emit('screenshot:captured', { name, buildId, options });
      this.logger.debug(`Screenshot captured: ${name}`);
    } catch (error) {
      if (error instanceof VizzlyError) throw error;

      throw new VizzlyError(
        `Failed to send screenshot to server: ${error.message}`,
        'SCREENSHOT_TRANSPORT_ERROR',
        { name, buildId, originalError: error.message }
      );
    }
  }

  /**
   * Upload all captured screenshots
   * @param {import('../types').UploadOptions} [options] - Upload options
   * @returns {Promise<import('../types').UploadResult>} Upload result
   */
  async upload(options = {}) {
    if (!this.services?.uploader) {
      this.services = this.services || {};
      this.services.uploader = createUploader(
        {
          apiKey: this.config.apiKey,
          apiUrl: this.config.apiUrl,
          upload: this.config.upload,
        },
        {
          logger: this.logger,
        }
      );
    }

    // Get the screenshots directory from config or default
    const screenshotsDir =
      options.screenshotsDir ||
      this.config?.upload?.screenshotsDir ||
      './screenshots';

    const uploadOptions = {
      screenshotsDir,
      buildName: options.buildName || this.config.buildName,
      branch: options.branch || this.config.branch,
      commit: options.commit || this.config.commit,
      message: options.message || this.config.message,
      environment:
        options.environment || this.config.environment || 'production',
      threshold: options.threshold || this.config.threshold,
      onProgress: progress => {
        this.emit('upload:progress', progress);
        if (options.onProgress) {
          options.onProgress(progress);
        }
      },
    };

    try {
      const result = await this.services.uploader.upload(uploadOptions);
      this.emit('upload:completed', result);
      return result;
    } catch (error) {
      this.emit('upload:failed', error);
      throw error;
    }
  }

  /**
   * Run local comparison in TDD mode
   * @param {string} name - Screenshot name
   * @param {Buffer} imageBuffer - Current image
   * @returns {Promise<import('../types').ComparisonResult>} Comparison result
   */
  async compare(name, imageBuffer) {
    if (!this.services?.tddService) {
      this.services = this.services || {};
      this.services.tddService = createTDDService(this.config, {
        logger: this.logger,
      });
    }

    try {
      const result = await this.services.tddService.compareScreenshot(
        name,
        imageBuffer
      );
      this.emit('comparison:completed', result);
      return result;
    } catch (error) {
      this.emit('comparison:failed', { name, error });
      throw error;
    }
  }
}

// Re-export key utilities and errors
export { loadConfig } from '../utils/config-loader.js';
export { createLogger } from '../utils/logger.js';

// Export service creators for advanced usage
export { createUploader } from '../services/uploader.js';
export { createTDDService } from '../services/tdd-service.js';
