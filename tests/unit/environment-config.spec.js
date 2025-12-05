import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getAllEnvironmentConfig,
  getParallelId,
} from '../../src/utils/environment-config.js';

describe('Environment Config - Parallel Build Support', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getParallelId', () => {
    it('should return VIZZLY_PARALLEL_ID when set', () => {
      process.env.VIZZLY_PARALLEL_ID = 'test-parallel-id-123';
      expect(getParallelId()).toBe('test-parallel-id-123');
    });

    it('should return undefined when VIZZLY_PARALLEL_ID is not set', () => {
      delete process.env.VIZZLY_PARALLEL_ID;
      expect(getParallelId()).toBeUndefined();
    });

    it('should return undefined when VIZZLY_PARALLEL_ID is empty string', () => {
      process.env.VIZZLY_PARALLEL_ID = '';
      expect(getParallelId()).toBe('');
    });

    it('should handle whitespace-only values', () => {
      process.env.VIZZLY_PARALLEL_ID = '   ';
      expect(getParallelId()).toBe('   ');
    });
  });

  describe('getAllEnvironmentConfig', () => {
    it('should include parallelId in config object', () => {
      process.env.VIZZLY_PARALLEL_ID = 'ci-run-456';
      process.env.VIZZLY_TOKEN = 'test-token';
      process.env.VIZZLY_API_URL = 'https://test.api.com';

      const config = getAllEnvironmentConfig();

      expect(config).toMatchObject({
        parallelId: 'ci-run-456',
        apiToken: 'test-token',
        apiUrl: 'https://test.api.com',
      });
    });

    it('should include undefined parallelId when not set', () => {
      delete process.env.VIZZLY_PARALLEL_ID;

      const config = getAllEnvironmentConfig();

      expect(config).toHaveProperty('parallelId');
      expect(config.parallelId).toBeUndefined();
    });

    it('should handle all environment variables together', () => {
      process.env.VIZZLY_TOKEN = 'token-123';
      process.env.VIZZLY_API_URL = 'https://custom.api.com';
      process.env.VIZZLY_LOG_LEVEL = 'debug';
      process.env.VIZZLY_PARALLEL_ID = 'parallel-789';
      process.env.VIZZLY_BUILD_ID = 'build-101';
      process.env.VIZZLY_ENABLED = 'true';
      process.env.VIZZLY_TDD = 'true';

      const config = getAllEnvironmentConfig();

      expect(config).toEqual({
        apiToken: 'token-123',
        apiUrl: 'https://custom.api.com',
        logLevel: 'debug',
        userAgent: undefined,
        enabled: true,
        serverUrl: undefined,
        buildId: 'build-101',
        parallelId: 'parallel-789',
        tddMode: true,
      });
    });
  });
});
