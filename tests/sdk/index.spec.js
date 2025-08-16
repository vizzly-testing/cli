import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createVizzly, VizzlySDK } from '../../src/sdk/index.js';

// Mock all dependencies
vi.mock('../../src/services/uploader.js', () => ({
  createUploader: vi.fn(() => ({
    upload: vi.fn(),
  })),
}));

vi.mock('../../src/services/tdd-service.js', () => ({
  createTDDService: vi.fn(() => ({
    start: vi.fn(),
    compareScreenshot: vi.fn(),
  })),
}));

vi.mock('../../src/services/screenshot-server.js', () => ({
  ScreenshotServer: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: vi.fn(() => true),
  })),
}));

vi.mock('../../src/utils/config-loader.js', () => ({
  loadConfig: vi.fn(() =>
    Promise.resolve({
      apiKey: 'test-key',
      apiUrl: 'https://test.vizzly.com',
    })
  ),
}));

vi.mock('../../src/utils/logger-factory.js', () => ({
  createComponentLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock global fetch
global.fetch = vi.fn();

describe('Vizzly SDK', () => {
  let mockCreateComponentLogger;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import and setup mocks once
    const uploaderModule = await import('../../src/services/uploader.js');
    const tddModule = await import('../../src/services/tdd-service.js');
    const configModule = await import('../../src/utils/config-loader.js');
    const loggerModule = await import('../../src/utils/logger-factory.js');
    const serverModule = await import(
      '../../src/services/screenshot-server.js'
    );

    vi.mocked(uploaderModule.createUploader);
    vi.mocked(tddModule.createTDDService);
    vi.mocked(configModule.loadConfig);
    mockCreateComponentLogger = vi.mocked(loggerModule.createComponentLogger);
    vi.mocked(serverModule.ScreenshotServer);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createVizzly factory function', () => {
    it('should create SDK instance with default config', () => {
      const sdk = createVizzly();

      expect(sdk).toHaveProperty('init');
      expect(sdk).toHaveProperty('upload');
      expect(sdk).toHaveProperty('startTDD');
      expect(sdk).toHaveProperty('createUploader');
      expect(sdk).toHaveProperty('createTDDService');
      expect(sdk).toHaveProperty('loadConfig');
      expect(sdk).toHaveProperty('createLogger');
      expect(sdk).toHaveProperty('getConfig');
      expect(sdk).toHaveProperty('updateConfig');
    });

    it('should create SDK instance with custom config', () => {
      const config = {
        apiKey: 'custom-key',
        apiUrl: 'https://custom.example.com',
        server: { port: 4000 },
      };

      const sdk = createVizzly(config);
      const retrievedConfig = sdk.getConfig();

      expect(retrievedConfig).toEqual(config);
    });

    it('should create SDK instance with custom options', () => {
      const options = {
        logLevel: 'debug',
        verbose: true,
      };

      createVizzly({}, options);

      expect(mockCreateComponentLogger).toHaveBeenCalledWith('SDK', {
        level: 'debug',
        verbose: true,
      });
    });

    it('should initialize with config loading', async () => {
      const { loadConfig } = vi.mocked(
        await import('../../src/utils/config-loader.js')
      );
      const fileConfig = { apiKey: 'file-key', environment: 'test' };
      const cliConfig = { apiKey: 'cli-key', server: { port: 3001 } };

      loadConfig.mockResolvedValue(fileConfig);

      const sdk = createVizzly(cliConfig);
      const result = await sdk.init();

      // CLI config should take precedence over file config
      expect(result).toEqual({
        apiKey: 'cli-key', // CLI override
        environment: 'test', // From file
        server: { port: 3001 }, // From CLI
      });
    });

    it('should create uploader service', async () => {
      const { createUploader } = vi.mocked(
        await import('../../src/services/uploader.js')
      );

      const config = {
        apiKey: 'test-key',
        apiUrl: 'https://test.vizzly.com',
      };

      const sdk = createVizzly(config);
      const uploader = sdk.createUploader();

      expect(createUploader).toHaveBeenCalledWith(
        { apiKey: 'test-key', apiUrl: 'https://test.vizzly.com' },
        expect.objectContaining({
          logger: expect.any(Object),
        })
      );
      expect(uploader).toBeDefined();
    });

    it('should create TDD service', async () => {
      const { createTDDService } = vi.mocked(
        await import('../../src/services/tdd-service.js')
      );

      const config = {
        apiKey: 'test-key',
        apiUrl: 'https://test.vizzly.com',
      };

      const sdk = createVizzly(config);
      const tddService = sdk.createTDDService();

      expect(createTDDService).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          logger: expect.any(Object),
        })
      );
      expect(tddService).toBeDefined();
    });

    it('should provide upload convenience method', async () => {
      const { createUploader } = vi.mocked(
        await import('../../src/services/uploader.js')
      );
      const mockUploader = {
        upload: vi.fn().mockResolvedValue({ success: true }),
      };
      createUploader.mockReturnValue(mockUploader);

      const sdk = createVizzly({
        apiKey: 'test-key',
        apiUrl: 'https://test.vizzly.com',
      });

      const uploadOptions = { screenshotsDir: './test-screenshots' };
      const result = await sdk.upload(uploadOptions);

      expect(mockUploader.upload).toHaveBeenCalledWith(uploadOptions);
      expect(result).toEqual({ success: true });
    });

    it('should provide startTDD convenience method', async () => {
      const { createTDDService } = vi.mocked(
        await import('../../src/services/tdd-service.js')
      );
      const mockTDDService = {
        start: vi.fn().mockResolvedValue({ started: true }),
      };
      createTDDService.mockReturnValue(mockTDDService);

      const sdk = createVizzly({
        apiKey: 'test-key',
        apiUrl: 'https://test.vizzly.com',
      });

      const tddOptions = { port: 3002 };
      const result = await sdk.startTDD(tddOptions);

      expect(mockTDDService.start).toHaveBeenCalledWith(tddOptions);
      expect(result).toEqual({ started: true });
    });

    it('should provide loadConfig method', async () => {
      const { loadConfig } = vi.mocked(
        await import('../../src/utils/config-loader.js')
      );
      loadConfig.mockResolvedValue({ apiKey: 'loaded-key' });

      const sdk = createVizzly();
      const result = await sdk.loadConfig();

      expect(loadConfig).toHaveBeenCalled();
      expect(result).toEqual({ apiKey: 'loaded-key' });
    });

    it('should provide createLogger method', async () => {
      const { createComponentLogger } = vi.mocked(
        await import('../../src/utils/logger-factory.js')
      );

      const sdk = createVizzly();
      const loggerOptions = { level: 'debug' };
      sdk.createLogger(loggerOptions);

      expect(createComponentLogger).toHaveBeenCalledWith('USER', loggerOptions);
    });

    it('should allow config updates', () => {
      const sdk = createVizzly({ apiKey: 'initial-key' });

      sdk.updateConfig({ apiKey: 'updated-key', newProperty: 'value' });
      const config = sdk.getConfig();

      expect(config).toEqual({
        apiKey: 'updated-key',
        newProperty: 'value',
      });
    });
  });

  describe('VizzlySDK class', () => {
    let sdk;
    let mockLogger;
    let mockServer;
    let mockServices;

    beforeEach(async () => {
      mockLogger = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const { ScreenshotServer } = vi.mocked(
        await import('../../src/services/screenshot-server.js')
      );
      mockServer = {
        start: vi.fn(),
        stop: vi.fn(),
        isRunning: vi.fn(() => true),
      };
      ScreenshotServer.mockReturnValue(mockServer);

      mockServices = {};

      sdk = new VizzlySDK(
        { apiKey: 'test-key', server: { port: 3000 } },
        mockLogger,
        mockServices
      );
    });

    it('should initialize correctly', () => {
      expect(sdk.config).toEqual({
        apiKey: 'test-key',
        server: { port: 3000 },
      });
      expect(sdk.logger).toBe(mockLogger);
      expect(sdk.services).toBe(mockServices);
      expect(sdk.server).toBeNull();
      expect(sdk.currentBuildId).toBeNull();
    });

    it('should start server successfully', async () => {
      const result = await sdk.start();

      expect(mockServer.start).toHaveBeenCalled();
      expect(result).toEqual({
        port: 3000,
        url: 'http://localhost:3000',
      });
      expect(sdk.server).toBe(mockServer);
    });

    it('should emit server:started event when starting', async () => {
      const eventSpy = vi.fn();
      sdk.on('server:started', eventSpy);

      const result = await sdk.start();

      expect(eventSpy).toHaveBeenCalledWith(result);
    });

    it('should handle starting server when already running', async () => {
      // Start server first
      await sdk.start();

      // Try to start again
      const result = await sdk.start();

      expect(mockLogger.warn).toHaveBeenCalledWith('Server already running');
      expect(result).toEqual({
        port: 3000,
        url: 'http://localhost:3000',
      });
    });

    it('should stop server successfully', async () => {
      // Start server first
      await sdk.start();

      const eventSpy = vi.fn();
      sdk.on('server:stopped', eventSpy);

      await sdk.stop();

      expect(mockServer.stop).toHaveBeenCalled();
      expect(sdk.server).toBeNull();
      expect(eventSpy).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Vizzly server stopped');
    });

    it('should handle stopping when server not running', async () => {
      await sdk.stop(); // Should not throw
      expect(mockServer.stop).not.toHaveBeenCalled();
    });

    it('should return current config', () => {
      const config = sdk.getConfig();

      expect(config).toEqual({ apiKey: 'test-key', server: { port: 3000 } });
      // Should return a copy, not the original
      expect(config).not.toBe(sdk.config);
    });

    it('should capture screenshot successfully', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      };
      global.fetch.mockResolvedValue(mockResponse);

      // Start server first
      await sdk.start();

      const eventSpy = vi.fn();
      sdk.on('screenshot:captured', eventSpy);

      const imageBuffer = Buffer.from('test-image-data');
      await sdk.screenshot('test-screenshot', imageBuffer, {
        properties: { browser: 'chrome' },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/screenshot',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buildId: 'default',
            name: 'test-screenshot',
            image: imageBuffer.toString('base64'),
            properties: { browser: 'chrome' },
          }),
        }
      );

      expect(eventSpy).toHaveBeenCalledWith({
        name: 'test-screenshot',
        buildId: 'default',
        options: { properties: { browser: 'chrome' } },
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Screenshot captured: test-screenshot'
      );
    });

    it('should use custom buildId for screenshots', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      };
      global.fetch.mockResolvedValue(mockResponse);

      await sdk.start();

      const imageBuffer = Buffer.from('test-image-data');
      await sdk.screenshot('test-screenshot', imageBuffer, {
        buildId: 'custom-build-123',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/screenshot',
        expect.objectContaining({
          body: expect.stringContaining('"buildId":"custom-build-123"'),
        })
      );

      expect(sdk.currentBuildId).toBe('custom-build-123');
    });

    it('should throw error when capturing screenshot without server running', async () => {
      const imageBuffer = Buffer.from('test-image-data');

      await expect(
        sdk.screenshot('test-screenshot', imageBuffer)
      ).rejects.toThrow('Server not running. Call start() first.');
    });

    it('should handle screenshot server errors', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: 'Server error' }),
      };
      global.fetch.mockResolvedValue(mockResponse);

      await sdk.start();

      const imageBuffer = Buffer.from('test-image-data');

      await expect(
        sdk.screenshot('test-screenshot', imageBuffer)
      ).rejects.toThrow('Screenshot capture failed: Server error');
    });

    it('should handle fetch errors during screenshot', async () => {
      const fetchError = new Error('Network error');
      global.fetch.mockRejectedValue(fetchError);

      await sdk.start();

      const imageBuffer = Buffer.from('test-image-data');

      await expect(
        sdk.screenshot('test-screenshot', imageBuffer)
      ).rejects.toThrow('Failed to send screenshot to server: Network error');
    });

    it('should upload screenshots successfully', async () => {
      const { createUploader } = vi.mocked(
        await import('../../src/services/uploader.js')
      );
      const mockUploader = {
        upload: vi.fn().mockResolvedValue({
          success: true,
          buildId: 'build123',
          url: 'https://vizzly.dev/build/123',
        }),
      };
      createUploader.mockReturnValue(mockUploader);

      const eventSpy = vi.fn();
      sdk.on('upload:completed', eventSpy);

      const result = await sdk.upload({
        screenshotsDir: './custom-screenshots',
        buildName: 'Test Build',
      });

      expect(mockUploader.upload).toHaveBeenCalledWith({
        screenshotsDir: './custom-screenshots',
        buildName: 'Test Build',
        branch: undefined,
        commit: undefined,
        message: undefined,
        environment: 'production',
        threshold: undefined,
        onProgress: expect.any(Function),
      });

      expect(result).toEqual({
        success: true,
        buildId: 'build123',
        url: 'https://vizzly.dev/build/123',
      });

      expect(eventSpy).toHaveBeenCalledWith(result);
    });

    it('should use config defaults for upload', async () => {
      const sdkWithDefaults = new VizzlySDK(
        {
          apiKey: 'test-key',
          buildName: 'Default Build',
          environment: 'staging',
          upload: { screenshotsDir: './default-screenshots' },
        },
        mockLogger,
        mockServices
      );

      const { createUploader } = vi.mocked(
        await import('../../src/services/uploader.js')
      );
      const mockUploader = {
        upload: vi.fn().mockResolvedValue({ success: true }),
      };
      createUploader.mockReturnValue(mockUploader);

      await sdkWithDefaults.upload();

      expect(mockUploader.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          screenshotsDir: './default-screenshots',
          buildName: 'Default Build',
          environment: 'staging',
        })
      );
    });

    it('should emit upload progress events', async () => {
      const { createUploader } = vi.mocked(
        await import('../../src/services/uploader.js')
      );
      const mockUploader = {
        upload: vi.fn().mockImplementation(({ onProgress }) => {
          onProgress({ phase: 'uploading', current: 5, total: 10 });
          return Promise.resolve({ success: true });
        }),
      };
      createUploader.mockReturnValue(mockUploader);

      const progressSpy = vi.fn();
      sdk.on('upload:progress', progressSpy);

      await sdk.upload();

      expect(progressSpy).toHaveBeenCalledWith({
        phase: 'uploading',
        current: 5,
        total: 10,
      });
    });

    it('should handle upload failures', async () => {
      const { createUploader } = vi.mocked(
        await import('../../src/services/uploader.js')
      );
      const uploadError = new Error('Upload failed');
      const mockUploader = {
        upload: vi.fn().mockRejectedValue(uploadError),
      };
      createUploader.mockReturnValue(mockUploader);

      const failureSpy = vi.fn();
      sdk.on('upload:failed', failureSpy);

      await expect(sdk.upload()).rejects.toThrow('Upload failed');
      expect(failureSpy).toHaveBeenCalledWith(uploadError);
    });

    it('should compare screenshots successfully', async () => {
      const { createTDDService } = vi.mocked(
        await import('../../src/services/tdd-service.js')
      );
      const mockTDDService = {
        compareScreenshot: vi.fn().mockResolvedValue({
          name: 'test-screenshot',
          status: 'passed',
          baseline: '/path/to/baseline.png',
          current: '/path/to/current.png',
        }),
      };
      createTDDService.mockReturnValue(mockTDDService);

      const eventSpy = vi.fn();
      sdk.on('comparison:completed', eventSpy);

      const imageBuffer = Buffer.from('test-image-data');
      const result = await sdk.compare('test-screenshot', imageBuffer);

      expect(mockTDDService.compareScreenshot).toHaveBeenCalledWith(
        'test-screenshot',
        imageBuffer
      );

      expect(result).toEqual({
        name: 'test-screenshot',
        status: 'passed',
        baseline: '/path/to/baseline.png',
        current: '/path/to/current.png',
      });

      expect(eventSpy).toHaveBeenCalledWith(result);
    });

    it('should handle comparison failures', async () => {
      const { createTDDService } = vi.mocked(
        await import('../../src/services/tdd-service.js')
      );
      const comparisonError = new Error('Comparison failed');
      const mockTDDService = {
        compareScreenshot: vi.fn().mockRejectedValue(comparisonError),
      };
      createTDDService.mockReturnValue(mockTDDService);

      const failureSpy = vi.fn();
      sdk.on('comparison:failed', failureSpy);

      const imageBuffer = Buffer.from('test-image-data');

      await expect(sdk.compare('test-screenshot', imageBuffer)).rejects.toThrow(
        'Comparison failed'
      );

      expect(failureSpy).toHaveBeenCalledWith({
        name: 'test-screenshot',
        error: comparisonError,
      });
    });

    it('should reuse services between calls', async () => {
      const { createUploader } = vi.mocked(
        await import('../../src/services/uploader.js')
      );
      const mockUploader = {
        upload: vi.fn().mockResolvedValue({ success: true }),
      };
      createUploader.mockReturnValue(mockUploader);

      // First upload call
      await sdk.upload();
      expect(createUploader).toHaveBeenCalledTimes(1);

      // Second upload call should reuse the service
      await sdk.upload();
      expect(createUploader).toHaveBeenCalledTimes(1);
    });
  });

  describe('SDK integration', () => {
    it('should work with EventEmitter inheritance', () => {
      const sdk = new VizzlySDK({}, {}, {});

      const eventHandler = vi.fn();
      sdk.on('test-event', eventHandler);
      sdk.emit('test-event', { data: 'test' });

      expect(eventHandler).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should handle server lifecycle with events', async () => {
      const testLogger = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const sdk = new VizzlySDK({ server: { port: 3001 } }, testLogger, {});

      const startSpy = vi.fn();
      const stopSpy = vi.fn();
      sdk.on('server:started', startSpy);
      sdk.on('server:stopped', stopSpy);

      // Start server
      const startResult = await sdk.start();
      expect(startSpy).toHaveBeenCalledWith(startResult);

      // Stop server
      await sdk.stop();
      expect(stopSpy).toHaveBeenCalled();
    });
  });
});
