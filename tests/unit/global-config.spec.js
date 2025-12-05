/**
 * Tests for global config utilities
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearAuthTokens,
  clearGlobalConfig,
  deleteProjectMapping,
  getAccessToken,
  getAuthTokens,
  getGlobalConfigDir,
  getGlobalConfigPath,
  getProjectMapping,
  getProjectMappings,
  hasValidTokens,
  loadGlobalConfig,
  saveAuthTokens,
  saveGlobalConfig,
  saveProjectMapping,
} from '../../src/utils/global-config.js';

describe('Global Config Utilities', () => {
  beforeEach(async () => {
    // Clear any existing global config before each test
    await clearGlobalConfig();
  });

  afterEach(async () => {
    // Clean up after each test
    await clearGlobalConfig();
  });

  describe('getGlobalConfigDir', () => {
    it('should return path to ~/.vizzly directory', () => {
      const configDir = getGlobalConfigDir();
      expect(configDir).toContain('.vizzly');
      expect(configDir).toBeTruthy();
    });
  });

  describe('getGlobalConfigPath', () => {
    it('should return path to ~/.vizzly/config.json', () => {
      const configPath = getGlobalConfigPath();
      expect(configPath).toContain('.vizzly');
      expect(configPath).toContain('config.json');
    });
  });

  describe('loadGlobalConfig', () => {
    it('should return empty object if config does not exist', async () => {
      const config = await loadGlobalConfig();
      expect(config).toEqual({});
    });

    it('should load existing config', async () => {
      const testConfig = { test: 'value', nested: { key: 'data' } };
      await saveGlobalConfig(testConfig);

      const config = await loadGlobalConfig();
      expect(config).toEqual(testConfig);
    });

    it('should handle corrupted config file gracefully', async () => {
      // Write invalid JSON to config file
      const configDir = getGlobalConfigDir();
      const configPath = getGlobalConfigPath();

      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      writeFileSync(configPath, 'invalid json {');

      // Should not throw, should return empty object
      const config = await loadGlobalConfig();
      expect(config).toEqual({});
    });
  });

  describe('saveGlobalConfig', () => {
    it('should save config to file', async () => {
      const testConfig = { test: 'value', number: 42 };
      await saveGlobalConfig(testConfig);

      const config = await loadGlobalConfig();
      expect(config).toEqual(testConfig);
    });

    it('should overwrite existing config', async () => {
      await saveGlobalConfig({ old: 'value' });
      await saveGlobalConfig({ new: 'value' });

      const config = await loadGlobalConfig();
      expect(config).toEqual({ new: 'value' });
      expect(config.old).toBeUndefined();
    });
  });

  describe('clearGlobalConfig', () => {
    it('should clear all config data', async () => {
      await saveGlobalConfig({ test: 'value', nested: { key: 'data' } });

      await clearGlobalConfig();

      const config = await loadGlobalConfig();
      expect(config).toEqual({});
    });
  });

  describe('Auth token management', () => {
    let mockAuth;

    beforeEach(() => {
      mockAuth = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString(), // 30 days from now
        user: {
          id: 'user-123',
          name: 'Test User',
          email: 'test@example.com',
        },
      };
    });

    describe('getAuthTokens', () => {
      it('should return null if no auth tokens exist', async () => {
        const auth = await getAuthTokens();
        expect(auth).toBeNull();
      });

      it('should return auth tokens if they exist', async () => {
        await saveAuthTokens(mockAuth);

        const auth = await getAuthTokens();
        expect(auth).toEqual(mockAuth);
      });
    });

    describe('saveAuthTokens', () => {
      it('should save auth tokens to global config', async () => {
        await saveAuthTokens(mockAuth);

        const config = await loadGlobalConfig();
        expect(config.auth).toEqual(mockAuth);
      });

      it('should preserve other config data', async () => {
        await saveGlobalConfig({ other: 'data' });
        await saveAuthTokens(mockAuth);

        const config = await loadGlobalConfig();
        expect(config.other).toBe('data');
        expect(config.auth).toEqual(mockAuth);
      });
    });

    describe('clearAuthTokens', () => {
      it('should clear auth tokens from global config', async () => {
        await saveAuthTokens(mockAuth);
        await clearAuthTokens();

        const auth = await getAuthTokens();
        expect(auth).toBeNull();
      });

      it('should preserve other config data', async () => {
        await saveGlobalConfig({ other: 'data' });
        await saveAuthTokens(mockAuth);
        await clearAuthTokens();

        const config = await loadGlobalConfig();
        expect(config.other).toBe('data');
        expect(config.auth).toBeUndefined();
      });
    });

    describe('hasValidTokens', () => {
      it('should return false if no tokens exist', async () => {
        const isValid = await hasValidTokens();
        expect(isValid).toBe(false);
      });

      it('should return true if valid tokens exist', async () => {
        await saveAuthTokens(mockAuth);

        const isValid = await hasValidTokens();
        expect(isValid).toBe(true);
      });

      it('should return false if tokens are expired', async () => {
        const expiredAuth = {
          ...mockAuth,
          expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired 1 second ago
        };

        await saveAuthTokens(expiredAuth);

        const isValid = await hasValidTokens();
        expect(isValid).toBe(false);
      });

      it('should return false if tokens expire within 5 minutes', async () => {
        const almostExpiredAuth = {
          ...mockAuth,
          expiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(), // Expires in 4 minutes
        };

        await saveAuthTokens(almostExpiredAuth);

        const isValid = await hasValidTokens();
        expect(isValid).toBe(false);
      });
    });

    describe('getAccessToken', () => {
      it('should return null if no tokens exist', async () => {
        const token = await getAccessToken();
        expect(token).toBeNull();
      });

      it('should return access token if it exists', async () => {
        await saveAuthTokens(mockAuth);

        const token = await getAccessToken();
        expect(token).toBe('test-access-token');
      });
    });
  });

  describe('Project mapping management', () => {
    let testProjectPath;
    let testProjectData;

    beforeEach(() => {
      testProjectPath = '/path/to/project';
      testProjectData = {
        token: 'vzt_test_project_token_123',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
        projectName: 'Test Project',
      };
    });

    describe('getProjectMapping', () => {
      it('should return null if no mapping exists', async () => {
        const mapping = await getProjectMapping(testProjectPath);
        expect(mapping).toBeNull();
      });

      it('should return project data if mapping exists', async () => {
        await saveProjectMapping(testProjectPath, testProjectData);

        const mapping = await getProjectMapping(testProjectPath);
        expect(mapping.token).toBe(testProjectData.token);
        expect(mapping.projectSlug).toBe(testProjectData.projectSlug);
        expect(mapping.organizationSlug).toBe(testProjectData.organizationSlug);
        expect(mapping.projectName).toBe(testProjectData.projectName);
        expect(mapping.createdAt).toBeDefined();
      });
    });

    describe('saveProjectMapping', () => {
      it('should save project mapping to global config', async () => {
        await saveProjectMapping(testProjectPath, testProjectData);

        const config = await loadGlobalConfig();
        expect(config.projects).toBeDefined();
        expect(config.projects[testProjectPath].token).toBe(
          testProjectData.token
        );
        expect(config.projects[testProjectPath].createdAt).toBeDefined();
      });

      it('should preserve other config data', async () => {
        await saveGlobalConfig({ other: 'data' });
        await saveProjectMapping(testProjectPath, testProjectData);

        const config = await loadGlobalConfig();
        expect(config.other).toBe('data');
        expect(config.projects[testProjectPath].token).toBe(
          testProjectData.token
        );
      });
    });

    describe('deleteProjectMapping', () => {
      it('should delete project mapping from global config', async () => {
        await saveProjectMapping(testProjectPath, testProjectData);
        await deleteProjectMapping(testProjectPath);

        const mapping = await getProjectMapping(testProjectPath);
        expect(mapping).toBeNull();
      });

      it('should preserve other mappings', async () => {
        const otherPath = '/path/to/other';
        const otherData = { ...testProjectData, token: 'vzt_other_token' };

        await saveProjectMapping(testProjectPath, testProjectData);
        await saveProjectMapping(otherPath, otherData);
        await deleteProjectMapping(testProjectPath);

        const deletedMapping = await getProjectMapping(testProjectPath);
        const otherMapping = await getProjectMapping(otherPath);

        expect(deletedMapping).toBeNull();
        expect(otherMapping.token).toBe(otherData.token);
      });
    });

    describe('getProjectMappings', () => {
      it('should return empty object if no mappings exist', async () => {
        const mappings = await getProjectMappings();
        expect(mappings).toEqual({});
      });

      it('should return all project mappings', async () => {
        const path1 = '/path/to/project1';
        const path2 = '/path/to/project2';
        const data1 = { ...testProjectData, token: 'vzt_token1' };
        const data2 = { ...testProjectData, token: 'vzt_token2' };

        await saveProjectMapping(path1, data1);
        await saveProjectMapping(path2, data2);

        const mappings = await getProjectMappings();
        expect(Object.keys(mappings)).toHaveLength(2);
        expect(mappings[path1].token).toBe(data1.token);
        expect(mappings[path2].token).toBe(data2.token);
      });
    });
  });
});
