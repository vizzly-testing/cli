import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateBuildName,
  detectBranch,
  detectCommit,
} from '../../src/utils/git.js';

describe('Git Utilities - Simple Tests', () => {
  let originalDateNow;

  beforeEach(() => {
    originalDateNow = Date.now;
    Date.now = vi.fn(() => new Date('2023-01-01T12:00:00Z').getTime());
    Date.prototype.toISOString = vi.fn(() => '2023-01-01T12:00:00.000Z');
  });

  afterEach(() => {
    Date.now = originalDateNow;
    vi.restoreAllMocks();
  });

  describe('generateBuildName', () => {
    it('should generate build name with timestamp', () => {
      const result = generateBuildName();
      expect(result).toBe('Build 2023-01-01T12-00-00-000Z');
    });
  });

  describe('detectBranch', () => {
    it('should return override when provided', async () => {
      const result = await detectBranch('feature-branch');
      expect(result).toBe('feature-branch');
    });

    it('should return unknown when no override and getCurrentBranch fails', async () => {
      // This will test the fallback when git fails
      const result = await detectBranch(null, '/non/existent/path');
      expect(result).toBe('unknown');
    });
  });

  describe('detectCommit', () => {
    it('should return override when provided', async () => {
      const result = await detectCommit('custom-commit-sha');
      expect(result).toBe('custom-commit-sha');
    });

    it('should return null when no override, git fails, and no env vars', async () => {
      // Mock environment to remove any CI-related commit SHA env vars
      const originalEnv = process.env;
      process.env = {};

      try {
        // This will test the fallback when git fails and no env vars are set
        const result = await detectCommit(null, '/non/existent/path');
        expect(result).toBe(null);
      } finally {
        // Restore original environment
        process.env = originalEnv;
      }
    });

    it('should prioritize environment variables over git', async () => {
      // Mock environment with a commit SHA
      const originalEnv = process.env;
      process.env = { ...originalEnv, GITHUB_SHA: 'env-commit-sha' };

      try {
        // This will test that env vars are prioritized even when git might work
        const result = await detectCommit(null, process.cwd());
        expect(result).toBe('env-commit-sha');
      } finally {
        // Restore original environment
        process.env = originalEnv;
      }
    });
  });
});
