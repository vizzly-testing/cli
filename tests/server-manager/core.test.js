import assert from 'node:assert';
import { describe, it } from 'node:test';
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
      assert.strictEqual(DEFAULT_PORT, 47392);
    });
  });

  describe('getPort', () => {
    it('returns port from config', () => {
      let config = { server: { port: 8080 } };
      assert.strictEqual(getPort(config), 8080);
    });

    it('returns default port when server config is missing', () => {
      let config = { apiKey: 'test' };
      assert.strictEqual(getPort(config), 47392);
    });

    it('returns default port when port is missing', () => {
      let config = { server: { timeout: 1000 } };
      assert.strictEqual(getPort(config), 47392);
    });

    it('returns default port for undefined config', () => {
      assert.strictEqual(getPort(undefined), 47392);
    });

    it('returns default port for null config', () => {
      assert.strictEqual(getPort(null), 47392);
    });
  });

  describe('hasApiKey', () => {
    it('returns true when apiKey exists', () => {
      let config = { apiKey: 'test-key' };
      assert.strictEqual(hasApiKey(config), true);
    });

    it('returns false when apiKey is missing', () => {
      let config = { server: { port: 8080 } };
      assert.strictEqual(hasApiKey(config), false);
    });

    it('returns false when apiKey is empty string', () => {
      let config = { apiKey: '' };
      assert.strictEqual(hasApiKey(config), false);
    });

    it('returns false when apiKey is null', () => {
      let config = { apiKey: null };
      assert.strictEqual(hasApiKey(config), false);
    });

    it('returns false for undefined config', () => {
      assert.strictEqual(hasApiKey(undefined), false);
    });
  });

  describe('buildServerInfo', () => {
    it('builds info without buildId', () => {
      let info = buildServerInfo({
        port: 8080,
        pid: 12345,
        startTime: 1699999999999,
      });

      assert.deepStrictEqual(info, {
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

      assert.deepStrictEqual(info, {
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

      assert.strictEqual('buildId' in info, false);
    });

    it('converts port to string', () => {
      let info = buildServerInfo({
        port: 47392,
        pid: 1,
        startTime: 0,
      });

      assert.strictEqual(typeof info.port, 'string');
      assert.strictEqual(info.port, '47392');
    });
  });

  describe('buildServicesWithExtras', () => {
    it('builds services with defaults', () => {
      let result = buildServicesWithExtras({});

      assert.deepStrictEqual(result, {
        buildId: null,
        tddService: null,
        workingDir: null,
      });
    });

    it('merges base services', () => {
      let services = { configService: {}, authService: {} };
      let result = buildServicesWithExtras({ services });

      assert.ok('configService' in result);
      assert.ok('authService' in result);
      assert.strictEqual(result.buildId, null);
      assert.strictEqual(result.tddService, null);
    });

    it('includes buildId', () => {
      let result = buildServicesWithExtras({ buildId: 'build-abc' });

      assert.strictEqual(result.buildId, 'build-abc');
    });

    it('includes tddService', () => {
      let tddService = { getResults: () => {} };
      let result = buildServicesWithExtras({ tddService });

      assert.strictEqual(result.tddService, tddService);
    });

    it('does not mutate original services', () => {
      let services = { original: true };
      let result = buildServicesWithExtras({
        services,
        buildId: 'build-123',
      });

      assert.deepStrictEqual(services, { original: true });
      assert.ok('buildId' in result);
    });
  });

  describe('buildClientOptions', () => {
    it('builds options from config', () => {
      let config = {
        apiKey: 'test-key',
        apiUrl: 'https://api.example.com',
      };

      let options = buildClientOptions(config);

      assert.deepStrictEqual(options, {
        baseUrl: 'https://api.example.com',
        token: 'test-key',
        command: 'run',
      });
    });

    it('returns null when no apiKey', () => {
      let config = { apiUrl: 'https://api.example.com' };

      assert.strictEqual(buildClientOptions(config), null);
    });

    it('returns null for empty apiKey', () => {
      let config = { apiKey: '', apiUrl: 'https://api.example.com' };

      assert.strictEqual(buildClientOptions(config), null);
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

      assert.strictEqual(iface.getScreenshotCount('any'), 42);
      assert.deepStrictEqual(iface.finishBuild('build-123'), {
        id: 'build-123',
      });
    });

    it('returns 0 for getScreenshotCount when handler is null', () => {
      let iface = buildServerInterface({ handler: null, httpServer: null });

      assert.strictEqual(iface.getScreenshotCount('build-123'), 0);
    });

    it('returns 0 when handler lacks getScreenshotCount', () => {
      let handler = {};
      let iface = buildServerInterface({ handler, httpServer: null });

      assert.strictEqual(iface.getScreenshotCount('build-123'), 0);
    });

    it('returns undefined for finishBuild when httpServer is null', () => {
      let iface = buildServerInterface({ handler: null, httpServer: null });

      assert.strictEqual(iface.finishBuild('build-123'), undefined);
    });

    it('returns undefined when httpServer lacks finishBuild', () => {
      let httpServer = {};
      let iface = buildServerInterface({ handler: null, httpServer });

      assert.strictEqual(iface.finishBuild('build-123'), undefined);
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

      assert.strictEqual(result.mode, 'tdd');
      assert.deepStrictEqual(result.tddConfig, {
        config,
        baselineBuildId: 'baseline-123',
        baselineComparisonId: 'comparison-456',
        setBaseline: false,
      });
      assert.strictEqual(result.clientOptions, null);
    });

    it('returns TDD mode with setBaseline true', () => {
      let config = {};

      let result = determineHandlerMode({
        tddMode: true,
        config,
        setBaseline: true,
      });

      assert.strictEqual(result.tddConfig.setBaseline, true);
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

      assert.strictEqual(result.mode, 'api');
      assert.strictEqual(result.tddConfig, null);
      assert.deepStrictEqual(result.clientOptions, {
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

      assert.strictEqual(result.mode, 'api');
      assert.strictEqual(result.clientOptions, null);
    });

    it('handles missing baseline config', () => {
      let config = {};

      let result = determineHandlerMode({
        tddMode: true,
        config,
        setBaseline: false,
      });

      assert.strictEqual(result.tddConfig.baselineBuildId, undefined);
      assert.strictEqual(result.tddConfig.baselineComparisonId, undefined);
    });
  });

  describe('buildServerJsonPaths', () => {
    it('builds paths from project root', () => {
      let paths = buildServerJsonPaths('/path/to/project');

      assert.strictEqual(paths.dir, '/path/to/project/.vizzly');
      assert.strictEqual(paths.file, '/path/to/project/.vizzly/server.json');
    });

    it('handles trailing slash in project root', () => {
      let paths = buildServerJsonPaths('/path/to/project/');

      assert.strictEqual(paths.dir, '/path/to/project//.vizzly');
      assert.strictEqual(paths.file, '/path/to/project//.vizzly/server.json');
    });

    it('handles relative paths', () => {
      let paths = buildServerJsonPaths('.');

      assert.strictEqual(paths.dir, './.vizzly');
      assert.strictEqual(paths.file, './.vizzly/server.json');
    });
  });
});
