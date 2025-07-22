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

    it('should return null when no override and git fails', async () => {
      // This will test the fallback when git fails
      const result = await detectCommit(null, '/non/existent/path');
      expect(result).toBe(null);
    });
  });
});
