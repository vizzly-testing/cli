import { describe, expect, it } from 'vitest';
import {
  buildClientOptions,
  buildServerInfo,
  buildServerInterface,
  buildServerJsonPaths,
  buildServicesWithExtras,
  DEFAULT_PORT,
  determineHandlerMode,
  getPort,
  hasApiKey,
} from '../../src/server-manager/core.js';

describe('server-manager/core', () => {
  describe('DEFAULT_PORT', () => {
    it('has expected default value', () => {
      expect(DEFAULT_PORT).toBe(47392);
    });
  });

  describe('getPort', () => {
    it('returns port from config', () => {
      let config = { server: { port: 8080 } };
      expect(getPort(config)).toBe(8080);
    });

    it('returns default port when server config is missing', () => {
      let config = { apiKey: 'test' };
      expect(getPort(config)).toBe(47392);
    });

    it('returns default port when port is missing', () => {
      let config = { server: { timeout: 1000 } };
      expect(getPort(config)).toBe(47392);
    });

    it('returns default port for undefined config', () => {
      expect(getPort(undefined)).toBe(47392);
    });

    it('returns default port for null config', () => {
      expect(getPort(null)).toBe(47392);
    });
  });

  describe('hasApiKey', () => {
    it('returns true when apiKey exists', () => {
      let config = { apiKey: 'test-key' };
      expect(hasApiKey(config)).toBe(true);
    });

    it('returns false when apiKey is missing', () => {
      let config = { server: { port: 8080 } };
      expect(hasApiKey(config)).toBe(false);
    });

    it('returns false when apiKey is empty string', () => {
      let config = { apiKey: '' };
      expect(hasApiKey(config)).toBe(false);
    });

    it('returns false when apiKey is null', () => {
      let config = { apiKey: null };
      expect(hasApiKey(config)).toBe(false);
    });

    it('returns false for undefined config', () => {
      expect(hasApiKey(undefined)).toBe(false);
    });
  });

  describe('buildServerInfo', () => {
    it('builds info without buildId', () => {
      let info = buildServerInfo({
        port: 8080,
        pid: 12345,
        startTime: 1699999999999,
      });

      expect(info).toEqual({
        port: '8080',
        pid: 12345,
        startTime: 1699999999999,
      });
    });

    it('builds info with buildId', () => {
      let info = buildServerInfo({
        port: 8080,
        pid: 12345,
        startTime: 1699999999999,
        buildId: 'build-123',
      });

      expect(info).toEqual({
        port: '8080',
        pid: 12345,
        startTime: 1699999999999,
        buildId: 'build-123',
      });
    });

    it('excludes buildId when null', () => {
      let info = buildServerInfo({
        port: 8080,
        pid: 12345,
        startTime: 1699999999999,
        buildId: null,
      });

      expect(info).not.toHaveProperty('buildId');
    });

    it('converts port to string', () => {
      let info = buildServerInfo({
        port: 47392,
        pid: 1,
        startTime: 0,
      });

      expect(typeof info.port).toBe('string');
      expect(info.port).toBe('47392');
    });
  });

  describe('buildServicesWithExtras', () => {
    it('builds services with defaults', () => {
      let result = buildServicesWithExtras({});

      expect(result).toEqual({
        buildId: null,
        tddService: null,
      });
    });

    it('merges base services', () => {
      let services = { configService: {}, authService: {} };
      let result = buildServicesWithExtras({ services });

      expect(result).toHaveProperty('configService');
      expect(result).toHaveProperty('authService');
      expect(result.buildId).toBeNull();
      expect(result.tddService).toBeNull();
    });

    it('includes buildId', () => {
      let result = buildServicesWithExtras({ buildId: 'build-abc' });

      expect(result.buildId).toBe('build-abc');
    });

    it('includes tddService', () => {
      let tddService = { getResults: () => {} };
      let result = buildServicesWithExtras({ tddService });

      expect(result.tddService).toBe(tddService);
    });

    it('does not mutate original services', () => {
      let services = { original: true };
      let result = buildServicesWithExtras({
        services,
        buildId: 'build-123',
      });

      expect(services).toEqual({ original: true });
      expect(result).toHaveProperty('buildId');
    });
  });

  describe('buildClientOptions', () => {
    it('builds options from config', () => {
      let config = {
        apiKey: 'test-key',
        apiUrl: 'https://api.example.com',
      };

      let options = buildClientOptions(config);

      expect(options).toEqual({
        baseUrl: 'https://api.example.com',
        token: 'test-key',
        command: 'run',
      });
    });

    it('returns null when no apiKey', () => {
      let config = { apiUrl: 'https://api.example.com' };

      expect(buildClientOptions(config)).toBeNull();
    });

    it('returns null for empty apiKey', () => {
      let config = { apiKey: '', apiUrl: 'https://api.example.com' };

      expect(buildClientOptions(config)).toBeNull();
    });
  });

  describe('buildServerInterface', () => {
    it('builds interface with handler methods', () => {
      let handler = {
        getScreenshotCount: () => 42,
      };
      let httpServer = {
        finishBuild: () => ({ id: 'build-123' }),
      };

      let iface = buildServerInterface({ handler, httpServer });

      expect(iface.getScreenshotCount('any')).toBe(42);
      expect(iface.finishBuild('build-123')).toEqual({ id: 'build-123' });
    });

    it('returns 0 for getScreenshotCount when handler is null', () => {
      let iface = buildServerInterface({ handler: null, httpServer: null });

      expect(iface.getScreenshotCount('build-123')).toBe(0);
    });

    it('returns 0 when handler lacks getScreenshotCount', () => {
      let handler = {};
      let iface = buildServerInterface({ handler, httpServer: null });

      expect(iface.getScreenshotCount('build-123')).toBe(0);
    });

    it('returns undefined for finishBuild when httpServer is null', () => {
      let iface = buildServerInterface({ handler: null, httpServer: null });

      expect(iface.finishBuild('build-123')).toBeUndefined();
    });

    it('returns undefined when httpServer lacks finishBuild', () => {
      let httpServer = {};
      let iface = buildServerInterface({ handler: null, httpServer });

      expect(iface.finishBuild('build-123')).toBeUndefined();
    });
  });

  describe('determineHandlerMode', () => {
    it('returns TDD mode config when tddMode is true', () => {
      let config = {
        baselineBuildId: 'baseline-123',
        baselineComparisonId: 'comparison-456',
      };

      let result = determineHandlerMode({
        tddMode: true,
        config,
        setBaseline: false,
      });

      expect(result.mode).toBe('tdd');
      expect(result.tddConfig).toEqual({
        config,
        baselineBuildId: 'baseline-123',
        baselineComparisonId: 'comparison-456',
        setBaseline: false,
      });
      expect(result.clientOptions).toBeNull();
    });

    it('returns TDD mode with setBaseline true', () => {
      let config = {};

      let result = determineHandlerMode({
        tddMode: true,
        config,
        setBaseline: true,
      });

      expect(result.tddConfig.setBaseline).toBe(true);
    });

    it('returns API mode config when tddMode is false', () => {
      let config = {
        apiKey: 'test-key',
        apiUrl: 'https://api.example.com',
      };

      let result = determineHandlerMode({
        tddMode: false,
        config,
        setBaseline: false,
      });

      expect(result.mode).toBe('api');
      expect(result.tddConfig).toBeNull();
      expect(result.clientOptions).toEqual({
        baseUrl: 'https://api.example.com',
        token: 'test-key',
        command: 'run',
      });
    });

    it('returns null clientOptions when no apiKey in API mode', () => {
      let config = { apiUrl: 'https://api.example.com' };

      let result = determineHandlerMode({
        tddMode: false,
        config,
        setBaseline: false,
      });

      expect(result.mode).toBe('api');
      expect(result.clientOptions).toBeNull();
    });

    it('handles missing baseline config', () => {
      let config = {};

      let result = determineHandlerMode({
        tddMode: true,
        config,
        setBaseline: false,
      });

      expect(result.tddConfig.baselineBuildId).toBeUndefined();
      expect(result.tddConfig.baselineComparisonId).toBeUndefined();
    });
  });

  describe('buildServerJsonPaths', () => {
    it('builds paths from project root', () => {
      let paths = buildServerJsonPaths('/path/to/project');

      expect(paths.dir).toBe('/path/to/project/.vizzly');
      expect(paths.file).toBe('/path/to/project/.vizzly/server.json');
    });

    it('handles trailing slash in project root', () => {
      let paths = buildServerJsonPaths('/path/to/project/');

      expect(paths.dir).toBe('/path/to/project//.vizzly');
      expect(paths.file).toBe('/path/to/project//.vizzly/server.json');
    });

    it('handles relative paths', () => {
      let paths = buildServerJsonPaths('.');

      expect(paths.dir).toBe('./.vizzly');
      expect(paths.file).toBe('./.vizzly/server.json');
    });
  });
});
