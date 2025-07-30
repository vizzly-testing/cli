import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createApiService,
  ApiService,
} from '../../src/services/api-service.js';
import { VizzlyError } from '../../src/errors/vizzly-error.js';

// Mock global fetch
global.fetch = vi.fn();

describe('ApiService', () => {
  let apiService;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Reset fetch mock
    global.fetch.mockClear();
  });

  afterEach(() => {
    if (apiService && apiService.cleanup) {
      apiService.cleanup();
    }
  });

  describe('createApiService', () => {
    it('creates service with default configuration', () => {
      apiService = createApiService();

      expect(apiService).toBeDefined();
      expect(apiService.baseUrl).toBe('https://vizzly.dev');
      expect(apiService.hasApiKey).toBe(false);
    });

    it('creates service with custom configuration', () => {
      const config = {
        baseUrl: 'https://custom.api.com',
        apiKey: 'test-key',
        timeout: 5000,
      };

      apiService = createApiService(config);

      expect(apiService.baseUrl).toBe('https://custom.api.com');
      expect(apiService.hasApiKey).toBe(true);
    });

    it('uses environment variables for configuration', () => {
      const originalBaseUrl = process.env.VIZZLY_BASE_URL;
      const originalApiKey = process.env.VIZZLY_API_KEY;

      process.env.VIZZLY_BASE_URL = 'https://env.api.com';
      process.env.VIZZLY_API_KEY = 'env-key';

      apiService = createApiService();

      expect(apiService.baseUrl).toBe('https://env.api.com');
      expect(apiService.hasApiKey).toBe(true);

      // Restore
      if (originalBaseUrl) process.env.VIZZLY_BASE_URL = originalBaseUrl;
      else delete process.env.VIZZLY_BASE_URL;
      if (originalApiKey) process.env.VIZZLY_API_KEY = originalApiKey;
      else delete process.env.VIZZLY_API_KEY;
    });
  });

  describe('makeRequest', () => {
    beforeEach(() => {
      apiService = createApiService(
        {
          baseUrl: 'https://test.api.com',
          apiKey: 'test-key',
        },
        { logger: mockLogger }
      );
    });

    it('makes successful GET request', async () => {
      const mockData = { success: true, data: 'test' };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await apiService.makeRequest('/test');

      expect(global.fetch).toHaveBeenCalledWith('https://test.api.com/test', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'vizzly-cli',
          Authorization: 'Bearer test-key',
        },
        timeout: 10000,
      });
      expect(result).toEqual(mockData);
    });

    it('makes successful POST request with body', async () => {
      const requestBody = { name: 'test' };
      const mockData = { id: '123' };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await apiService.makeRequest('/create', {
        method: 'POST',
        body: requestBody,
      });

      expect(global.fetch).toHaveBeenCalledWith('https://test.api.com/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'vizzly-cli',
          Authorization: 'Bearer test-key',
        },
        timeout: 10000,
        body: JSON.stringify(requestBody),
      });
      expect(result).toEqual(mockData);
    });

    it('handles HTTP errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(apiService.makeRequest('/notfound')).rejects.toThrow(
        'HTTP 404: Not Found'
      );
    });

    it('handles network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(apiService.makeRequest('/test')).rejects.toThrow(
        'Network error'
      );
    });

    it('includes custom headers', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await apiService.makeRequest('/test', {
        headers: { 'X-Custom': 'value' },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'value',
          }),
        })
      );
    });
  });

  describe('getStatus', () => {
    beforeEach(() => {
      apiService = createApiService({}, { logger: mockLogger });
    });

    it('returns healthy status on success', async () => {
      const mockHealthData = { version: '1.0.0' };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHealthData),
      });

      const result = await apiService.getStatus();

      expect(result).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        version: '1.0.0',
      });
    });

    it('returns unhealthy status on error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Service unavailable'));

      const result = await apiService.getStatus();

      expect(result).toEqual({
        status: 'unhealthy',
        error: expect.stringContaining('Service unavailable'),
        timestamp: expect.any(String),
      });
    });
  });

  describe('resource methods', () => {
    beforeEach(() => {
      apiService = createApiService({
        baseUrl: 'https://test.api.com',
        apiKey: 'test-key',
      });
    });

    it('getProject makes correct request', async () => {
      const mockProject = { id: 'proj123', name: 'Test Project' };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProject),
      });

      const result = await apiService.getProject('proj123');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.api.com/projects/proj123',
        expect.any(Object)
      );
      expect(result).toEqual(mockProject);
    });

    it('getBuild makes correct request with include parameter', async () => {
      const mockBuild = { id: 'build123', screenshots: [] };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBuild),
      });

      const result = await apiService.getBuild('build123', 'screenshots');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.api.com/builds/build123?include=screenshots',
        expect.any(Object)
      );
      expect(result).toEqual(mockBuild);
    });

    it('createBuild makes POST request', async () => {
      const buildData = { name: 'Test Build', branch: 'main' };
      const mockBuild = { id: 'build123', ...buildData };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBuild),
      });

      const result = await apiService.createBuild(buildData);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.api.com/api/sdk/builds',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(buildData),
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json',
            'User-Agent': 'vizzly-cli',
          }),
        })
      );
      expect(result).toEqual(mockBuild);
    });

    it('getBuilds handles project ID parameter', async () => {
      const mockBuilds = { builds: [{ id: 'build1' }] };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBuilds),
      });

      const result = await apiService.getBuilds('proj123', { limit: 10 });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.api.com/projects/proj123/builds?limit=10',
        expect.any(Object)
      );
      expect(result).toEqual([{ id: 'build1' }]);
    });

    it('getBuilds handles filters-only parameter (TDD mode)', async () => {
      const mockBuilds = { data: [{ id: 'build1' }] };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBuilds),
      });

      const result = await apiService.getBuilds({
        environment: 'test',
        branch: 'main',
        status: 'passed',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.api.com/builds?environment=test&branch=main&status=passed',
        expect.any(Object)
      );
      expect(result).toEqual([{ id: 'build1' }]);
    });
  });

  describe('testConnection', () => {
    beforeEach(() => {
      apiService = createApiService({}, { logger: mockLogger });
    });

    it('returns success on successful ping', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pong: true }),
      });

      const result = await apiService.testConnection();

      expect(result).toEqual({
        success: true,
        duration: expect.any(Number),
        timestamp: expect.any(String),
      });
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('returns failure on ping error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Connection timeout'));

      const result = await apiService.testConnection();

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Connection timeout'),
        duration: expect.any(Number),
        timestamp: expect.any(String),
      });
    });
  });

  describe('ApiService class', () => {
    it('throws error without token', () => {
      expect(() => new ApiService()).toThrow('No API token provided');
    });

    it('creates instance with token', () => {
      const service = new ApiService({
        baseUrl: 'https://test.api.com',
        token: 'test-token',
      });

      expect(service.baseUrl).toBe('https://test.api.com');
      expect(service.token).toBe('test-token');
    });

    it('makes authenticated request', async () => {
      const service = new ApiService({ token: 'test-token' });
      const mockData = { success: true };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await service.request('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://vizzly.dev/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(result).toEqual(mockData);
    });

    it('throws VizzlyError on API failure', async () => {
      const service = new ApiService({ token: 'test-token' });

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(service.request('/test')).rejects.toThrow(VizzlyError);
    });

    it('creates build with metadata', async () => {
      const service = new ApiService({ token: 'test-token' });
      const metadata = { name: 'Test Build', branch: 'main' };
      const mockBuild = { id: 'build123', ...metadata };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBuild),
      });

      const result = await service.createBuild(metadata);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://vizzly.dev/api/sdk/builds',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(metadata),
        })
      );
      expect(result).toEqual(mockBuild);
    });
  });

  describe('event handling', () => {
    it('supports event listeners', () => {
      apiService = createApiService();
      const callback = vi.fn();

      apiService.on('test', callback);
      apiService.off('test', callback);
      apiService.once('test', callback);

      // Just verify methods exist and don't throw
      expect(typeof apiService.on).toBe('function');
      expect(typeof apiService.off).toBe('function');
      expect(typeof apiService.once).toBe('function');
    });
  });
});
