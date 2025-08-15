import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiService } from '../../src/services/api-service.js';
import { VizzlyError } from '../../src/errors/vizzly-error.js';
// Mock global fetch
global.fetch = vi.fn();

describe('ApiService', () => {
  beforeEach(() => {
    // Reset fetch mock
    global.fetch.mockClear();
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

    it('uploads screenshot with metadata', async () => {
      const service = new ApiService({ token: 'test-token' });
      const buildId = 'build123';
      const name = 'test-screenshot';
      const buffer = Buffer.from('fake-image-data', 'base64');
      const sha256 = require('crypto')
        .createHash('sha256')
        .update(buffer)
        .digest('hex');
      const metadata = {
        browser: 'chrome',
        viewport: '1920x1080',
        device: 'desktop',
      };
      const mockResponse = { success: true, id: 'screenshot123' };

      // Mock the enhanced SHA check request (no existing files)
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            existing: [],
            missing: [sha256],
            summary: {
              total_checked: 1,
              existing_count: 0,
              missing_count: 1,
              screenshots_created: 0,
            },
            screenshots: [],
          }),
      });

      // Mock the upload request
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.uploadScreenshot(
        buildId,
        name,
        buffer,
        metadata
      );

      // Check that SHA check was called first with buildId
      const firstCall = global.fetch.mock.calls[0];
      expect(firstCall[0]).toBe('https://vizzly.dev/api/sdk/check-shas');
      expect(firstCall[1].method).toBe('POST');
      const firstRequestBody = JSON.parse(firstCall[1].body);
      expect(firstRequestBody.buildId).toBe(buildId);
      expect(firstRequestBody.shas).toEqual([sha256]);

      // Check that upload was called with correct data (second call)
      const secondCall = global.fetch.mock.calls[1];
      expect(secondCall[0]).toBe(
        `https://vizzly.dev/api/sdk/builds/${buildId}/screenshots`
      );
      const uploadBody = JSON.parse(secondCall[1].body);
      expect(uploadBody.properties).toEqual(metadata);
      expect(result).toEqual(mockResponse);
    });

    it('uploads screenshot with empty metadata when none provided', async () => {
      const service = new ApiService({ token: 'test-token' });
      const buildId = 'build123';
      const name = 'test-screenshot';
      const buffer = Buffer.from('fake-image-data', 'base64');
      const sha256 = require('crypto')
        .createHash('sha256')
        .update(buffer)
        .digest('hex');
      const mockResponse = { success: true, id: 'screenshot123' };

      // Mock the enhanced SHA check request (no existing files)
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            existing: [],
            missing: [sha256],
            summary: {
              total_checked: 1,
              existing_count: 0,
              missing_count: 1,
              screenshots_created: 0,
            },
            screenshots: [],
          }),
      });

      // Mock the upload request
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await service.uploadScreenshot(buildId, name, buffer);

      // Check that SHA check was called with buildId
      const firstCall = global.fetch.mock.calls[0];
      const firstRequestBody = JSON.parse(firstCall[1].body);
      expect(firstRequestBody.buildId).toBe(buildId);
      expect(firstRequestBody.shas).toEqual([sha256]);

      // Check that upload was called with empty properties (second call)
      const secondCall = global.fetch.mock.calls[1];
      const uploadBody = JSON.parse(secondCall[1].body);
      expect(uploadBody.properties).toEqual({});
      expect(result).toEqual(mockResponse);
    });

    it('skips upload when SHA already exists', async () => {
      const service = new ApiService({ token: 'test-token' });
      const buildId = 'build123';
      const name = 'test-screenshot';
      const buffer = Buffer.from('fake-image-data', 'base64');
      const sha256 = require('crypto')
        .createHash('sha256')
        .update(buffer)
        .digest('hex');

      // Mock the enhanced SHA check response with screenshots array
      const mockScreenshot = {
        id: 'screenshot-uuid',
        name: 'test-screenshot',
        sha256,
        fromExisting: true,
        alreadyExisted: false,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            existing: [sha256],
            missing: [],
            summary: {
              total_checked: 1,
              existing_count: 1,
              missing_count: 0,
              screenshots_created: 1,
            },
            screenshots: [mockScreenshot],
          }),
      });

      const result = await service.uploadScreenshot(buildId, name, buffer);

      // Should only call SHA check, not upload
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Verify the request included buildId
      const firstCall = global.fetch.mock.calls[0];
      expect(firstCall[0]).toBe('https://vizzly.dev/api/sdk/check-shas');
      const requestBody = JSON.parse(firstCall[1].body);
      expect(requestBody.buildId).toBe(buildId);
      expect(requestBody.shas).toEqual([sha256]);

      expect(result).toEqual({
        message: 'Screenshot already exists, skipped upload',
        sha256,
        skipped: true,
        screenshot: mockScreenshot,
        fromExisting: true,
      });
    });
  });
});
