import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../src/services/api-service.js';

// Mock global fetch
global.fetch = vi.fn();

describe('ApiService - Metadata Handling', () => {
  let apiService;

  beforeEach(() => {
    apiService = new ApiService({ token: 'test-token' });
    global.fetch.mockClear();
  });

  describe('uploadScreenshot metadata handling', () => {
    it('should pass metadata correctly as properties field', async () => {
      const buildId = 'build123';
      const name = 'homepage-desktop';
      const buffer = Buffer.from('fake-image-data', 'base64');
      const metadata = {
        browser: 'chrome',
        browserVersion: '120.0',
        device: 'desktop',
        viewport: { width: 1920, height: 1080 },
        url: 'https://app.example.com',
        selector: 'body',
      };

      // Mock SHA check (no existing)
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ existing: [] }),
      });

      // Mock upload request
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, id: 'screenshot123' }),
      });

      await apiService.uploadScreenshot(buildId, name, buffer, metadata);

      // Verify the upload request has the correct structure (second call after SHA check)
      const secondCall = global.fetch.mock.calls[1];
      expect(secondCall[0]).toBe(
        `https://app.vizzly.dev/api/sdk/builds/${buildId}/screenshots`
      );
      expect(secondCall[1].method).toBe('POST');
      expect(secondCall[1].headers['Content-Type']).toBe('application/json');
      expect(secondCall[1].headers.Authorization).toBe('Bearer test-token');

      const requestBody = JSON.parse(secondCall[1].body);
      expect(requestBody.name).toBe(name);
      expect(requestBody.image_data).toBe(buffer.toString('base64'));
      expect(requestBody.properties).toEqual(metadata);
      expect(requestBody.sha256).toBeDefined();
    });

    it('should handle null metadata gracefully using nullish coalescing', async () => {
      const buildId = 'build123';
      const name = 'homepage-desktop';
      const buffer = Buffer.from('fake-image-data', 'base64');

      // Mock SHA check
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ existing: [] }),
      });

      // Mock upload request
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, id: 'screenshot123' }),
      });

      await apiService.uploadScreenshot(buildId, name, buffer, null);

      // Verify null metadata becomes empty object (second call after SHA check)
      const secondCall = global.fetch.mock.calls[1];
      const requestBody = JSON.parse(secondCall[1].body);
      expect(requestBody.properties).toEqual({}); // null should become empty object
    });

    it('should handle undefined metadata gracefully', async () => {
      const buildId = 'build123';
      const name = 'homepage-desktop';
      const buffer = Buffer.from('fake-image-data', 'base64');

      // Mock SHA check
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ existing: [] }),
      });

      // Mock upload request
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, id: 'screenshot123' }),
      });

      await apiService.uploadScreenshot(buildId, name, buffer, undefined);

      // Verify undefined metadata becomes empty object (second call after SHA check)
      const secondCall = global.fetch.mock.calls[1];
      const requestBody = JSON.parse(secondCall[1].body);
      expect(requestBody.properties).toEqual({}); // undefined should become empty object
    });

    it('should preserve complex metadata structure', async () => {
      const buildId = 'build123';
      const name = 'checkout-form';
      const buffer = Buffer.from('fake-image-data', 'base64');
      const complexMetadata = {
        browser: 'firefox',
        browserVersion: '119.0',
        device: 'mobile',
        viewport: { width: 375, height: 667 },
        url: 'https://shop.example.com/checkout',
        selector: '.checkout-form',
        testSuite: 'e2e-checkout',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        timestamp: '2024-01-01T12:00:00Z',
        environment: 'staging',
        customProperties: {
          theme: 'dark',
          locale: 'en-US',
          featureFlags: ['newCheckout', 'fastPayment'],
        },
      };

      // Mock SHA check
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ existing: [] }),
      });

      // Mock upload request
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, id: 'screenshot123' }),
      });

      await apiService.uploadScreenshot(buildId, name, buffer, complexMetadata);

      // Verify complex metadata is preserved exactly (second call after SHA check)
      const secondCall = global.fetch.mock.calls[1];
      const requestBody = JSON.parse(secondCall[1].body);
      expect(requestBody.properties).toEqual(complexMetadata); // Complex metadata should be preserved
    });
  });
});
