/**
 * Tests for API client factory
 *
 * Tests the client creation and configuration.
 * Integration tests for actual HTTP calls are in tests/api/integration/
 */

import { describe, expect, it } from 'vitest';
import { createApiClient, DEFAULT_API_URL } from '../../src/api/client.js';

describe('api/client', () => {
  describe('createApiClient', () => {
    it('creates client with token', () => {
      let client = createApiClient({
        token: 'test-token',
        command: 'test',
      });

      expect(client.getToken()).toBe('test-token');
      expect(client.getBaseUrl()).toBe(DEFAULT_API_URL);
    });

    it('accepts apiKey as alias for token', () => {
      let client = createApiClient({
        apiKey: 'my-api-key',
        command: 'upload',
      });

      expect(client.getToken()).toBe('my-api-key');
    });

    it('uses custom baseUrl', () => {
      let client = createApiClient({
        baseUrl: 'https://custom.vizzly.dev',
        token: 'test',
      });

      expect(client.getBaseUrl()).toBe('https://custom.vizzly.dev');
    });

    it('accepts apiUrl as alias for baseUrl', () => {
      let client = createApiClient({
        apiUrl: 'https://staging.vizzly.dev',
        token: 'test',
      });

      expect(client.getBaseUrl()).toBe('https://staging.vizzly.dev');
    });

    it('builds user agent with command', () => {
      let client = createApiClient({
        token: 'test',
        command: 'upload',
      });

      expect(client.getUserAgent()).toMatch(/vizzly-cli\/[\d.]+ \(upload\)/);
    });

    it('throws without token when not allowed', () => {
      expect(() => createApiClient({ command: 'test' })).toThrow(
        'No API token provided'
      );
    });

    it('allows no token when allowNoToken is true', () => {
      let client = createApiClient({
        command: 'test',
        allowNoToken: true,
      });

      expect(client.getToken()).toBeNull();
    });
  });
});
