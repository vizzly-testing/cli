/**
 * Tests for ApiService backwards compatibility wrapper
 *
 * The actual API logic is tested in tests/api/*.spec.js.
 * This file just verifies the class interface works correctly.
 */

import { describe, expect, it } from 'vitest';
import { ApiService } from '../../src/services/api-service.js';

describe('ApiService', () => {
  describe('constructor', () => {
    it('throws error without token', () => {
      expect(() => new ApiService()).toThrow('No API token provided');
    });

    it('allows no token with allowNoToken option', () => {
      let service = new ApiService({ allowNoToken: true });
      expect(service.token).toBeNull();
    });

    it('creates instance with token', () => {
      let service = new ApiService({ token: 'test-token' });
      expect(service.token).toBe('test-token');
    });

    it('accepts apiKey as alias for token', () => {
      let service = new ApiService({ apiKey: 'my-api-key' });
      expect(service.token).toBe('my-api-key');
    });

    it('uses default baseUrl', () => {
      let service = new ApiService({ token: 'test' });
      expect(service.baseUrl).toBe('https://app.vizzly.dev');
    });

    it('accepts custom baseUrl', () => {
      let service = new ApiService({
        token: 'test',
        baseUrl: 'https://custom.vizzly.dev',
      });
      expect(service.baseUrl).toBe('https://custom.vizzly.dev');
    });

    it('accepts apiUrl as alias for baseUrl', () => {
      let service = new ApiService({
        token: 'test',
        apiUrl: 'https://staging.vizzly.dev',
      });
      expect(service.baseUrl).toBe('https://staging.vizzly.dev');
    });

    it('builds userAgent with command', () => {
      let service = new ApiService({ token: 'test', command: 'upload' });
      expect(service.userAgent).toMatch(/vizzly-cli\/[\d.]+ \(upload\)/);
    });
  });

  describe('methods exist', () => {
    let service;

    beforeAll(() => {
      service = new ApiService({ token: 'test' });
    });

    it('has request method', () => {
      expect(typeof service.request).toBe('function');
    });

    it('has getBuild method', () => {
      expect(typeof service.getBuild).toBe('function');
    });

    it('has createBuild method', () => {
      expect(typeof service.createBuild).toBe('function');
    });

    it('has uploadScreenshot method', () => {
      expect(typeof service.uploadScreenshot).toBe('function');
    });

    it('has checkShas method', () => {
      expect(typeof service.checkShas).toBe('function');
    });

    it('has finalizeBuild method', () => {
      expect(typeof service.finalizeBuild).toBe('function');
    });

    it('has getTokenContext method', () => {
      expect(typeof service.getTokenContext).toBe('function');
    });

    it('has searchComparisons method', () => {
      expect(typeof service.searchComparisons).toBe('function');
    });

    it('has getScreenshotHotspots method', () => {
      expect(typeof service.getScreenshotHotspots).toBe('function');
    });

    it('has getBatchHotspots method', () => {
      expect(typeof service.getBatchHotspots).toBe('function');
    });
  });
});
