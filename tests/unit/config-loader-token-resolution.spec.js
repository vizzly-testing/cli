/**
 * Tests for config-loader token resolution priority
 * Priority order: CLI flag > Env var > Project mapping > User access token
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
      let cliToken = 'cli_token_123';

      let config = await loadConfig(null, { token: cliToken });

      expect(config.apiKey).toBe(cliToken);
    });

    it('should prefer CLI flag over environment variable', async () => {
      let cliToken = 'cli_token_123';
      process.env.VIZZLY_TOKEN = 'env_token_456';

      let config = await loadConfig(null, { token: cliToken });

      expect(config.apiKey).toBe(cliToken);
    });

    it('should prefer CLI flag over project mapping', async () => {
      let cliToken = 'cli_token_123';
      globalConfig.__setMockProjectMapping({
        token: 'vzt_project_token_789',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });

      let config = await loadConfig(null, { token: cliToken });

      expect(config.apiKey).toBe(cliToken);
    });

    it('should prefer CLI flag over user access token', async () => {
      let cliToken = 'cli_token_123';
      globalConfig.__setMockAccessToken('user_access_token_abc');

      let config = await loadConfig(null, { token: cliToken });

      expect(config.apiKey).toBe(cliToken);
    });
  });

  describe('Priority 2: Environment variable', () => {
    it('should use VIZZLY_TOKEN when no CLI flag', async () => {
      process.env.VIZZLY_TOKEN = 'env_token_456';

      let config = await loadConfig(null, {});

      expect(config.apiKey).toBe('env_token_456');
    });

    it('should prefer env var over project mapping', async () => {
      process.env.VIZZLY_TOKEN = 'env_token_456';
      globalConfig.__setMockProjectMapping({
        token: 'vzt_project_token_789',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });

      let config = await loadConfig(null, {});

      expect(config.apiKey).toBe('env_token_456');
    });

    it('should prefer env var over user access token', async () => {
      process.env.VIZZLY_TOKEN = 'env_token_456';
      globalConfig.__setMockAccessToken('user_access_token_abc');

      let config = await loadConfig(null, {});

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

      let config = await loadConfig(null, {});

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

      let config = await loadConfig(null, {});

      expect(config.apiKey).toBe('vzt_project_token_789');
    });

    it('should handle project mapping with string token', async () => {
      globalConfig.__setMockProjectMapping({
        token: 'vzt_project_token_string',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });

      let config = await loadConfig(null, {});

      expect(config.apiKey).toBe('vzt_project_token_string');
    });
  });

  describe('Priority 4: User access token (lowest)', () => {
    it('should use user access token when no other sources', async () => {
      globalConfig.__setMockAccessToken('user_access_token_abc');

      let config = await loadConfig(null, {});

      expect(config.apiKey).toBe('user_access_token_abc');
    });

    it('should return undefined apiKey when no token sources available', async () => {
      let config = await loadConfig(null, {});

      expect(config.apiKey).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty CLI overrides object', async () => {
      globalConfig.__setMockAccessToken('user_access_token_abc');

      let config = await loadConfig(null, {});

      expect(config.apiKey).toBe('user_access_token_abc');
    });

    it('should handle null project mapping', async () => {
      globalConfig.__setMockProjectMapping(null);
      globalConfig.__setMockAccessToken('user_access_token_abc');

      let config = await loadConfig(null, {});

      expect(config.apiKey).toBe('user_access_token_abc');
    });

    it('should handle project mapping without token field', async () => {
      globalConfig.__setMockProjectMapping({
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });
      globalConfig.__setMockAccessToken('user_access_token_abc');

      let config = await loadConfig(null, {});

      expect(config.apiKey).toBe('user_access_token_abc');
    });

    it('should skip project mapping lookup when CLI token provided', async () => {
      let cliToken = 'cli_token_123';

      await loadConfig(null, { token: cliToken });

      // Project mapping should not be called when CLI token is provided
      expect(globalConfig.getProjectMapping).not.toHaveBeenCalled();
    });
  });
});
