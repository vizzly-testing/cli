import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudAPIProvider } from '../../claude-plugin/mcp/vizzly-server/cloud-api-provider.js';
import { LocalTDDProvider } from '../../claude-plugin/mcp/vizzly-server/local-tdd-provider.js';

describe('Claude Plugin - Cloud API Provider', () => {
  let provider;
  let originalApiUrl;

  beforeEach(() => {
    // Save original env var and clear it for consistent test behavior
    originalApiUrl = process.env.VIZZLY_API_URL;
    delete process.env.VIZZLY_API_URL;

    provider = new CloudAPIProvider();
    // Mock fetch globally
    global.fetch = vi.fn();
  });

  afterEach(() => {
    // Restore original env var
    if (originalApiUrl !== undefined) {
      process.env.VIZZLY_API_URL = originalApiUrl;
    }
  });

  describe('Input Validation', () => {
    it('should validate buildId in getBuildStatus', async () => {
      await expect(provider.getBuildStatus(null, 'token')).rejects.toThrow(
        'buildId is required and must be a non-empty string'
      );
      await expect(provider.getBuildStatus('', 'token')).rejects.toThrow(
        'buildId is required and must be a non-empty string'
      );
      await expect(provider.getBuildStatus(123, 'token')).rejects.toThrow(
        'buildId is required and must be a non-empty string'
      );
    });

    it('should validate comparisonId in getComparison', async () => {
      await expect(provider.getComparison(null, 'token')).rejects.toThrow(
        'comparisonId is required and must be a non-empty string'
      );
      await expect(provider.getComparison('', 'token')).rejects.toThrow(
        'comparisonId is required and must be a non-empty string'
      );
    });

    it('should validate buildId and content in createBuildComment', async () => {
      await expect(
        provider.createBuildComment(null, 'content', 'general', 'token')
      ).rejects.toThrow('buildId is required and must be a non-empty string');
      await expect(
        provider.createBuildComment('build123', null, 'general', 'token')
      ).rejects.toThrow('content is required and must be a non-empty string');
    });

    it('should validate comparisonId and reason in rejectComparison', async () => {
      await expect(
        provider.rejectComparison(null, 'reason', 'token')
      ).rejects.toThrow(
        'comparisonId is required and must be a non-empty string'
      );
      await expect(
        provider.rejectComparison('cmp123', null, 'token')
      ).rejects.toThrow('reason is required and must be a non-empty string');
    });

    it('should validate buildId in downloadBaselines', async () => {
      await expect(
        provider.downloadBaselines(null, [], 'token')
      ).rejects.toThrow('buildId is required and must be a non-empty string');
    });
  });

  describe('API Token Handling', () => {
    it('should throw error when API token is missing', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ build: {} }),
      });

      await expect(provider.makeRequest('/api/test', null)).rejects.toThrow(
        'API token required'
      );
    });

    it('should use default API URL when not provided', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await provider.makeRequest('/api/test', 'token123');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://app.vizzly.dev/api/test',
        expect.any(Object)
      );
    });

    it('should use custom API URL when provided', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await provider.makeRequest(
        '/api/test',
        'token123',
        'https://custom.api.com'
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://custom.api.com/api/test',
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Build not found',
      });

      await expect(
        provider.makeRequest('/api/test', 'token123')
      ).rejects.toThrow('API request failed (404): Build not found');
    });
  });
});

describe('Claude Plugin - Local TDD Provider', () => {
  let provider;

  beforeEach(() => {
    provider = new LocalTDDProvider();
  });

  describe('Directory Finding', () => {
    it('should return null when .vizzly directory does not exist', async () => {
      // Test with a directory that definitely doesn't have .vizzly
      const result = await provider.findVizzlyDir(
        '/tmp/nonexistent-test-dir-12345'
      );

      expect(result).toBeNull();
    });

    it('should find .vizzly directory in current project', async () => {
      // Test with actual project directory
      const result = await provider.findVizzlyDir(process.cwd());

      // Should find it or return null if not in TDD mode
      expect(result === null || result.endsWith('.vizzly')).toBe(true);
    });
  });

  describe('TDD Status', () => {
    it('should return error when no .vizzly directory exists', async () => {
      const result = await provider.getTDDStatus(
        '/tmp/nonexistent-test-dir-12345'
      );

      expect(result.error).toBeDefined();
      expect(result.message).toContain('vizzly tdd');
    });
  });

  describe('Comparison Details', () => {
    it('should return error when screenshot not found', async () => {
      vi.spyOn(provider, 'findVizzlyDir').mockResolvedValue(
        `${process.cwd()}/.vizzly`
      );

      const result = await provider.getComparisonDetails(
        'nonexistent-screenshot-12345'
      );

      expect(result.error || result.availableScreenshots).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when accepting baseline without .vizzly directory', async () => {
      vi.spyOn(provider, 'findVizzlyDir').mockResolvedValue(null);

      await expect(provider.acceptBaseline('test')).rejects.toThrow(
        'No .vizzly directory found'
      );
    });

    it('should throw error when rejecting baseline without .vizzly directory', async () => {
      vi.spyOn(provider, 'findVizzlyDir').mockResolvedValue(null);

      await expect(provider.rejectBaseline('test', 'reason')).rejects.toThrow(
        'No .vizzly directory found'
      );
    });
  });
});
