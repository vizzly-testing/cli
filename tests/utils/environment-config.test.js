import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  getAllEnvironmentConfig,
  getApiToken,
  getApiUrl,
  getBuildId,
  getBuildName,
  getLogLevel,
  getParallelId,
  getServerUrl,
  getUserAgent,
  getVizzlyHome,
  isTddMode,
  isVizzlyEnabled,
  setVizzlyEnabled,
} from '../../src/utils/environment-config.js';

describe('utils/environment-config', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear all Vizzly env vars
    let vizzlyVars = [
      'VIZZLY_HOME',
      'VIZZLY_TOKEN',
      'VIZZLY_API_URL',
      'VIZZLY_LOG_LEVEL',
      'VIZZLY_USER_AGENT',
      'VIZZLY_ENABLED',
      'VIZZLY_SERVER_URL',
      'VIZZLY_BUILD_ID',
      'VIZZLY_BUILD_NAME',
      'VIZZLY_PARALLEL_ID',
      'VIZZLY_TDD',
    ];
    for (let v of vizzlyVars) {
      delete process.env[v];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getVizzlyHome', () => {
    it('returns undefined when not set', () => {
      assert.strictEqual(getVizzlyHome(), undefined);
    });

    it('returns VIZZLY_HOME when set', () => {
      process.env.VIZZLY_HOME = '/custom/vizzly/home';

      assert.strictEqual(getVizzlyHome(), '/custom/vizzly/home');
    });
  });

  describe('getApiToken', () => {
    it('returns undefined when not set', () => {
      assert.strictEqual(getApiToken(), undefined);
    });

    it('returns VIZZLY_TOKEN when set', () => {
      process.env.VIZZLY_TOKEN = 'secret-token';

      assert.strictEqual(getApiToken(), 'secret-token');
    });
  });

  describe('getApiUrl', () => {
    it('returns default URL when not set', () => {
      assert.strictEqual(getApiUrl(), 'https://app.vizzly.dev');
    });

    it('returns VIZZLY_API_URL when set', () => {
      process.env.VIZZLY_API_URL = 'http://localhost:3000';

      assert.strictEqual(getApiUrl(), 'http://localhost:3000');
    });
  });

  describe('getLogLevel', () => {
    it('returns default level when not set', () => {
      assert.strictEqual(getLogLevel(), 'info');
    });

    it('returns VIZZLY_LOG_LEVEL when set', () => {
      process.env.VIZZLY_LOG_LEVEL = 'debug';

      assert.strictEqual(getLogLevel(), 'debug');
    });
  });

  describe('getUserAgent', () => {
    it('returns undefined when not set', () => {
      assert.strictEqual(getUserAgent(), undefined);
    });

    it('returns VIZZLY_USER_AGENT when set', () => {
      process.env.VIZZLY_USER_AGENT = 'custom-agent/1.0';

      assert.strictEqual(getUserAgent(), 'custom-agent/1.0');
    });
  });

  describe('isVizzlyEnabled', () => {
    it('returns false when not set', () => {
      assert.strictEqual(isVizzlyEnabled(), false);
    });

    it('returns false for non-true value', () => {
      process.env.VIZZLY_ENABLED = 'false';

      assert.strictEqual(isVizzlyEnabled(), false);
    });

    it('returns true when VIZZLY_ENABLED is true', () => {
      process.env.VIZZLY_ENABLED = 'true';

      assert.strictEqual(isVizzlyEnabled(), true);
    });
  });

  describe('getServerUrl', () => {
    it('returns undefined when not set', () => {
      assert.strictEqual(getServerUrl(), undefined);
    });

    it('returns VIZZLY_SERVER_URL when set', () => {
      process.env.VIZZLY_SERVER_URL = 'http://localhost:47392';

      assert.strictEqual(getServerUrl(), 'http://localhost:47392');
    });
  });

  describe('getBuildId', () => {
    it('returns undefined when not set', () => {
      assert.strictEqual(getBuildId(), undefined);
    });

    it('returns VIZZLY_BUILD_ID when set', () => {
      process.env.VIZZLY_BUILD_ID = 'build-123';

      assert.strictEqual(getBuildId(), 'build-123');
    });
  });

  describe('getParallelId', () => {
    it('returns undefined when not set', () => {
      assert.strictEqual(getParallelId(), undefined);
    });

    it('returns VIZZLY_PARALLEL_ID when set', () => {
      process.env.VIZZLY_PARALLEL_ID = 'parallel-456';

      assert.strictEqual(getParallelId(), 'parallel-456');
    });
  });

  describe('getBuildName', () => {
    it('returns undefined when not set', () => {
      assert.strictEqual(getBuildName(), undefined);
    });

    it('returns VIZZLY_BUILD_NAME when set', () => {
      process.env.VIZZLY_BUILD_NAME = 'My CI Build';

      assert.strictEqual(getBuildName(), 'My CI Build');
    });
  });

  describe('isTddMode', () => {
    it('returns false when not set', () => {
      assert.strictEqual(isTddMode(), false);
    });

    it('returns false for non-true value', () => {
      process.env.VIZZLY_TDD = 'false';

      assert.strictEqual(isTddMode(), false);
    });

    it('returns true when VIZZLY_TDD is true', () => {
      process.env.VIZZLY_TDD = 'true';

      assert.strictEqual(isTddMode(), true);
    });
  });

  describe('setVizzlyEnabled', () => {
    it('sets VIZZLY_ENABLED to true', () => {
      setVizzlyEnabled(true);

      assert.strictEqual(process.env.VIZZLY_ENABLED, 'true');
    });

    it('sets VIZZLY_ENABLED to false', () => {
      setVizzlyEnabled(false);

      assert.strictEqual(process.env.VIZZLY_ENABLED, 'false');
    });

    it('converts truthy values to true', () => {
      setVizzlyEnabled(1);

      assert.strictEqual(process.env.VIZZLY_ENABLED, 'true');
    });

    it('converts falsy values to false', () => {
      setVizzlyEnabled(0);

      assert.strictEqual(process.env.VIZZLY_ENABLED, 'false');
    });
  });

  describe('getAllEnvironmentConfig', () => {
    it('returns all default values when nothing set', () => {
      let config = getAllEnvironmentConfig();

      assert.deepStrictEqual(config, {
        home: undefined,
        apiToken: undefined,
        apiUrl: 'https://app.vizzly.dev',
        logLevel: 'info',
        userAgent: undefined,
        enabled: false,
        serverUrl: undefined,
        buildId: undefined,
        buildName: undefined,
        parallelId: undefined,
        tddMode: false,
      });
    });

    it('returns all configured values', () => {
      process.env.VIZZLY_HOME = '/home';
      process.env.VIZZLY_TOKEN = 'token';
      process.env.VIZZLY_API_URL = 'http://api';
      process.env.VIZZLY_LOG_LEVEL = 'debug';
      process.env.VIZZLY_USER_AGENT = 'agent';
      process.env.VIZZLY_ENABLED = 'true';
      process.env.VIZZLY_SERVER_URL = 'http://server';
      process.env.VIZZLY_BUILD_ID = 'build';
      process.env.VIZZLY_BUILD_NAME = 'My Build';
      process.env.VIZZLY_PARALLEL_ID = 'parallel';
      process.env.VIZZLY_TDD = 'true';

      let config = getAllEnvironmentConfig();

      assert.deepStrictEqual(config, {
        home: '/home',
        apiToken: 'token',
        apiUrl: 'http://api',
        logLevel: 'debug',
        userAgent: 'agent',
        enabled: true,
        serverUrl: 'http://server',
        buildId: 'build',
        buildName: 'My Build',
        parallelId: 'parallel',
        tddMode: true,
      });
    });
  });
});
