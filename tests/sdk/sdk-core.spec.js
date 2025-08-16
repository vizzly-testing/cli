import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createVizzly, VizzlySDK } from '../../src/sdk/index.js';

// Mock all dependencies with simple mocks
vi.mock('../../src/services/uploader.js');
vi.mock('../../src/services/tdd-service.js');
vi.mock('../../src/services/screenshot-server.js');
vi.mock('../../src/utils/config-loader.js');
vi.mock('../../src/utils/logger-factory.js');

// Mock global fetch
global.fetch = vi.fn();

describe('Vizzly SDK Core Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    vi.doMock('../../src/utils/config-loader.js', () => ({
      loadConfig: vi.fn(() => Promise.resolve({})),
    }));

    vi.doMock('../../src/utils/logger-factory.js', () => ({
      createComponentLogger: vi.fn(() => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      })),
    }));

    vi.doMock('../../src/services/uploader.js', () => ({
      createUploader: vi.fn(() => ({
        upload: vi.fn(),
      })),
    }));

    vi.doMock('../../src/services/tdd-service.js', () => ({
      createTDDService: vi.fn(() => ({
        start: vi.fn(),
        compareScreenshot: vi.fn(),
      })),
    }));

    vi.doMock('../../src/services/screenshot-server.js', () => ({
      ScreenshotServer: vi.fn(() => ({
        start: vi.fn(),
        stop: vi.fn(),
        isRunning: vi.fn(() => true),
      })),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createVizzly factory function', () => {
    it('should create SDK instance with all required methods', () => {
      const sdk = createVizzly();

      // Test that all required methods exist
      expect(typeof sdk.init).toBe('function');
      expect(typeof sdk.upload).toBe('function');
      expect(typeof sdk.startTDD).toBe('function');
      expect(typeof sdk.createUploader).toBe('function');
      expect(typeof sdk.createTDDService).toBe('function');
      expect(typeof sdk.loadConfig).toBe('function');
      expect(typeof sdk.createLogger).toBe('function');
      expect(typeof sdk.getConfig).toBe('function');
      expect(typeof sdk.updateConfig).toBe('function');
    });

    it('should accept and store custom config', () => {
      const config = {
        apiKey: 'test-key',
        apiUrl: 'https://test.vizzly.com',
        server: { port: 4000 },
      };

      const sdk = createVizzly(config);
      const retrievedConfig = sdk.getConfig();

      expect(retrievedConfig).toEqual(config);
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

    it('should return different config instances', () => {
      const sdk = createVizzly({ apiKey: 'test-key' });

      const config1 = sdk.getConfig();
      const config2 = sdk.getConfig();

      // Should return different objects (defensive copy)
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('VizzlySDK class', () => {
    let sdk;
    let mockLogger;

    beforeEach(() => {
      mockLogger = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      sdk = new VizzlySDK(
        {
          apiKey: 'test-key',
          apiUrl: 'https://test.vizzly.com',
          server: { port: 3000 },
        },
        mockLogger,
        {}
      );
    });

    it('should initialize with correct properties', () => {
      expect(sdk.config).toEqual({
        apiKey: 'test-key',
        apiUrl: 'https://test.vizzly.com',
        server: { port: 3000 },
      });
      expect(sdk.logger).toBe(mockLogger);
      expect(sdk.server).toBeNull();
      expect(sdk.currentBuildId).toBeNull();
    });

    it('should return config copy', () => {
      const config = sdk.getConfig();

      expect(config).toEqual(sdk.config);
      expect(config).not.toBe(sdk.config); // Should be a copy
    });

    it('should be an EventEmitter', () => {
      expect(sdk.on).toBeDefined();
      expect(sdk.emit).toBeDefined();
      expect(sdk.removeListener).toBeDefined();

      // Test event functionality
      const handler = vi.fn();
      sdk.on('test-event', handler);
      sdk.emit('test-event', { data: 'test' });

      expect(handler).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should handle start when server already running', async () => {
      // Mock server to be already set
      sdk.server = { stop: vi.fn() };

      const result = await sdk.start();

      expect(mockLogger.warn).toHaveBeenCalledWith('Server already running');
      expect(result).toEqual({
        port: 3000,
        url: 'http://localhost:3000',
      });
    });

    it('should handle stop when no server running', async () => {
      // Server is null by default
      await sdk.stop();

      // Should not throw or try to stop anything
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should throw error when taking screenshot without server', async () => {
      const imageBuffer = Buffer.from('test-image');

      await expect(sdk.screenshot('test', imageBuffer)).rejects.toThrow(
        'Server not running. Call start() first.'
      );
    });

    it('should handle screenshot with custom buildId', async () => {
      // Mock successful server state
      sdk.server = { isRunning: () => true };

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const imageBuffer = Buffer.from('test-image');
      await sdk.screenshot('test-screenshot', imageBuffer, {
        buildId: 'custom-build-123',
        properties: { browser: 'chrome' },
      });

      expect(sdk.currentBuildId).toBe('custom-build-123');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/screenshot',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"buildId":"custom-build-123"'),
        })
      );
    });

    it('should emit screenshot:captured event', async () => {
      sdk.server = { isRunning: () => true };

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const eventSpy = vi.fn();
      sdk.on('screenshot:captured', eventSpy);

      const imageBuffer = Buffer.from('test-image');
      await sdk.screenshot('test-screenshot', imageBuffer, {
        properties: { browser: 'chrome' },
      });

      expect(eventSpy).toHaveBeenCalledWith({
        name: 'test-screenshot',
        buildId: 'default',
        options: { properties: { browser: 'chrome' } },
      });
    });

    it('should handle screenshot server errors', async () => {
      sdk.server = { isRunning: () => true };

      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      const imageBuffer = Buffer.from('test-image');

      await expect(
        sdk.screenshot('test-screenshot', imageBuffer)
      ).rejects.toThrow('Screenshot capture failed: Server error');
    });

    it('should handle fetch errors during screenshot', async () => {
      sdk.server = { isRunning: () => true };

      global.fetch.mockRejectedValue(new Error('Network error'));

      const imageBuffer = Buffer.from('test-image');

      await expect(
        sdk.screenshot('test-screenshot', imageBuffer)
      ).rejects.toThrow('Failed to send screenshot to server: Network error');
    });

    it('should convert image buffer to base64 for transport', async () => {
      sdk.server = { isRunning: () => true };

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const imageBuffer = Buffer.from('test-image-data');
      await sdk.screenshot('test-screenshot', imageBuffer);

      const expectedBase64 = imageBuffer.toString('base64');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/screenshot',
        expect.objectContaining({
          body: expect.stringContaining(`"image":"${expectedBase64}"`),
        })
      );
    });

    it('should use default buildId when none provided', async () => {
      sdk.server = { isRunning: () => true };

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const imageBuffer = Buffer.from('test-image');
      await sdk.screenshot('test-screenshot', imageBuffer);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/screenshot',
        expect.objectContaining({
          body: expect.stringContaining('"buildId":"default"'),
        })
      );

      expect(sdk.currentBuildId).toBe('default');
    });

    it('should persist buildId across screenshots', async () => {
      sdk.server = { isRunning: () => true };

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const imageBuffer = Buffer.from('test-image');

      // First screenshot with custom buildId
      await sdk.screenshot('test1', imageBuffer, {
        buildId: 'persistent-build',
      });
      expect(sdk.currentBuildId).toBe('persistent-build');

      // Second screenshot should use persisted buildId
      await sdk.screenshot('test2', imageBuffer);

      expect(global.fetch).toHaveBeenLastCalledWith(
        'http://localhost:3000/screenshot',
        expect.objectContaining({
          body: expect.stringContaining('"buildId":"persistent-build"'),
        })
      );
    });

    it('should include properties in screenshot data', async () => {
      sdk.server = { isRunning: () => true };

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const imageBuffer = Buffer.from('test-image');
      const properties = { browser: 'chrome', viewport: '1920x1080' };

      await sdk.screenshot('test-screenshot', imageBuffer, { properties });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/screenshot',
        expect.objectContaining({
          body: expect.stringContaining(
            '"properties":{"browser":"chrome","viewport":"1920x1080"}'
          ),
        })
      );
    });
  });

  describe('SDK Error Handling', () => {
    it('should preserve VizzlyError types during screenshot failures', async () => {
      const sdk = new VizzlySDK({}, {}, {});
      sdk.server = { isRunning: () => true };

      const { VizzlyError } = await import('../../src/errors/vizzly-error.js');

      global.fetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ error: 'Validation failed' }),
      });

      const imageBuffer = Buffer.from('test-image');

      try {
        await sdk.screenshot('test-screenshot', imageBuffer);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(VizzlyError);
        expect(error.message).toContain('Screenshot capture failed');
        expect(error.code).toBe('SCREENSHOT_FAILED');
      }
    });
  });
});
