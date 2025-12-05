/**
 * Tests for config-loader token resolution priority
 * Priority order: CLI flag > Env var > Project mapping
 * Note: User access tokens (JWTs from login) are NOT used as API keys
 * They are only for user-level operations, not SDK endpoints
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/utils/config-loader.js';
import * as globalConfig from '../../src/utils/global-config.js';

// Mock global-config module
vi.mock('../../src/utils/global-config.js', async () => {
  let mockProjectMapping = null;
  let mockAccessToken = null;

  return {
    getProjectMapping: vi.fn(async () => mockProjectMapping),
    getAccessToken: vi.fn(async () => mockAccessToken),
    __setMockProjectMapping: mapping => {
      mockProjectMapping = mapping;
    },
    __setMockAccessToken: token => {
      mockAccessToken = token;
    },
    __clearMocks: () => {
      mockProjectMapping = null;
      mockAccessToken = null;
    },
  };
});

describe('Config Loader - Token Resolution Priority', () => {
  let originalEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    delete process.env.VIZZLY_TOKEN;
    delete process.env.VIZZLY_API_KEY;

    // Clear mocks
    globalConfig.__clearMocks();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Priority 1: CLI flag (highest)', () => {
    it('should use CLI flag token when provided', async () => {
      const cliToken = 'cli_token_123';

      const config = await loadConfig(null, { token: cliToken });

      expect(config.apiKey).toBe(cliToken);
    });

    it('should prefer CLI flag over environment variable', async () => {
      const cliToken = 'cli_token_123';
      process.env.VIZZLY_TOKEN = 'env_token_456';

      const config = await loadConfig(null, { token: cliToken });

      expect(config.apiKey).toBe(cliToken);
    });

    it('should prefer CLI flag over project mapping', async () => {
      const cliToken = 'cli_token_123';
      globalConfig.__setMockProjectMapping({
        token: 'vzt_project_token_789',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });

      const config = await loadConfig(null, { token: cliToken });

      expect(config.apiKey).toBe(cliToken);
    });

    it('should prefer CLI flag over user access token', async () => {
      const cliToken = 'cli_token_123';
      globalConfig.__setMockAccessToken('user_access_token_abc');

      const config = await loadConfig(null, { token: cliToken });

      expect(config.apiKey).toBe(cliToken);
    });
  });

  describe('Priority 2: Environment variable', () => {
    it('should use VIZZLY_TOKEN when no CLI flag', async () => {
      process.env.VIZZLY_TOKEN = 'env_token_456';

      const config = await loadConfig(null, {});

      expect(config.apiKey).toBe('env_token_456');
    });

    it('should prefer env var over project mapping', async () => {
      process.env.VIZZLY_TOKEN = 'env_token_456';
      globalConfig.__setMockProjectMapping({
        token: 'vzt_project_token_789',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });

      const config = await loadConfig(null, {});

      expect(config.apiKey).toBe('env_token_456');
    });

    it('should prefer env var over user access token', async () => {
      process.env.VIZZLY_TOKEN = 'env_token_456';
      globalConfig.__setMockAccessToken('user_access_token_abc');

      const config = await loadConfig(null, {});

      expect(config.apiKey).toBe('env_token_456');
    });
  });

  describe('Priority 3: Project mapping', () => {
    it('should use project mapping token when no CLI flag or env var', async () => {
      globalConfig.__setMockProjectMapping({
        token: 'vzt_project_token_789',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
        projectName: 'Test Project',
      });

      const config = await loadConfig(null, {});

      expect(config.apiKey).toBe('vzt_project_token_789');
      expect(config.projectSlug).toBe('test-project');
      expect(config.organizationSlug).toBe('test-org');
    });

    it('should prefer project mapping over user access token', async () => {
      globalConfig.__setMockProjectMapping({
        token: 'vzt_project_token_789',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });
      globalConfig.__setMockAccessToken('user_access_token_abc');

      const config = await loadConfig(null, {});

      expect(config.apiKey).toBe('vzt_project_token_789');
    });

    it('should handle project mapping with string token', async () => {
      globalConfig.__setMockProjectMapping({
        token: 'vzt_project_token_string',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });

      const config = await loadConfig(null, {});

      expect(config.apiKey).toBe('vzt_project_token_string');
    });
  });

  describe('User access tokens are NOT used as API keys', () => {
    it('should NOT use user access token as API key (security fix)', async () => {
      // User access tokens (JWTs) should not be used for SDK endpoints
      // They have different format and permissions than project tokens
      globalConfig.__setMockAccessToken('user_access_token_abc');

      const config = await loadConfig(null, {});

      // apiKey should be undefined, NOT the user access token
      expect(config.apiKey).toBeUndefined();
    });

    it('should return undefined apiKey when no token sources available', async () => {
      const config = await loadConfig(null, {});

      expect(config.apiKey).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty CLI overrides object with no tokens', async () => {
      const config = await loadConfig(null, {});

      expect(config.apiKey).toBeUndefined();
    });

    it('should handle null project mapping', async () => {
      globalConfig.__setMockProjectMapping(null);

      const config = await loadConfig(null, {});

      // Without project mapping or env var, apiKey should be undefined
      expect(config.apiKey).toBeUndefined();
    });

    it('should handle project mapping without token field', async () => {
      globalConfig.__setMockProjectMapping({
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });

      const config = await loadConfig(null, {});

      // Project mapping without token should result in undefined apiKey
      expect(config.apiKey).toBeUndefined();
    });

    it('should skip project mapping lookup when CLI token provided', async () => {
      const cliToken = 'cli_token_123';

      await loadConfig(null, { token: cliToken });

      // Project mapping should not be called when CLI token is provided
      expect(globalConfig.getProjectMapping).not.toHaveBeenCalled();
    });
  });
});
