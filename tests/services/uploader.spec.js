import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Uploader } from '../../src/services/uploader.js';

// Mock dependencies
vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('../../src/services/base-service.js', () => ({
  BaseService: class {
    constructor() {}
  },
}));

vi.mock('../../src/errors/vizzly-error.js', () => ({
  VizzlyError: class extends Error {
    constructor(message, code = 'VIZZLY_ERROR', context = {}) {
      super(message);
      this.name = 'VizzlyError';
      this.code = code;
      this.context = context;
    }
  },
}));

// Mock global fetch
global.fetch = vi.fn();

describe('Uploader Service', () => {
  describe('Uploader class', () => {
    let uploader;
    let mockConfig;

    beforeEach(() => {
      mockConfig = {
        apiUrl: 'https://test.vizzly.com',
        apiKey: 'test-api-key',
      };

      uploader = new Uploader(mockConfig);
      vi.clearAllMocks();
    });

    it('initializes with correct configuration', () => {
      expect(uploader.apiUrl).toBe('https://test.vizzly.com');
      expect(uploader.apiKey).toBe('test-api-key');
    });

    it('identifies screenshot files correctly', () => {
      expect(uploader.isScreenshotFile('test.png')).toBe(true);
      expect(uploader.isScreenshotFile('test.jpg')).toBe(true);
      expect(uploader.isScreenshotFile('test.jpeg')).toBe(true);
      expect(uploader.isScreenshotFile('test.webp')).toBe(true);
      expect(uploader.isScreenshotFile('test.txt')).toBe(false);
      expect(uploader.isScreenshotFile('test.pdf')).toBe(false);
      expect(uploader.isScreenshotFile('README.md')).toBe(false);
    });

    it('generates correct screenshot names', () => {
      const filePath = '/base/path/subdir/screenshot.png';
      const basePath = '/base/path';

      const name = uploader.getScreenshotName(filePath, basePath);
      expect(name).toBe('subdir/screenshot');
    });

    it('handles root level screenshot names', () => {
      const filePath = '/base/path/screenshot.png';
      const basePath = '/base/path';

      const name = uploader.getScreenshotName(filePath, basePath);
      expect(name).toBe('screenshot');
    });

    it('makes authenticated API requests successfully', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: 'test' }),
      });

      const result = await uploader.apiRequest('/test-endpoint');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.vizzly.com/test-endpoint',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
            'User-Agent': expect.stringMatching(
              /^vizzly-cli\/\d+\.\d+\.\d+ \(upload\)$/
            ),
          }),
        })
      );

      expect(result).toEqual({ success: true, data: 'test' });
    });

    it('handles API request failures with proper error', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key'),
      });

      await expect(uploader.apiRequest('/test-endpoint')).rejects.toThrow(
        'API request failed: Unauthorized'
      );
    });

    it('handles network errors during API requests', async () => {
      global.fetch.mockRejectedValue(new Error('Network timeout'));

      await expect(uploader.apiRequest('/test-endpoint')).rejects.toThrow(
        'Network timeout'
      );
    });

    it('finds screenshots in directory structure', async () => {
      const { readdir } = await import('fs/promises');

      // Mock directory structure: root with subdirectory
      readdir.mockImplementation(path => {
        if (path.endsWith('/subdir')) {
          return Promise.resolve([
            { name: 'nested.png', isDirectory: () => false },
            { name: 'another.jpg', isDirectory: () => false },
          ]);
        }
        // Root directory
        return Promise.resolve([
          { name: 'root.png', isDirectory: () => false },
          { name: 'subdir', isDirectory: () => true },
          { name: 'ignored.txt', isDirectory: () => false },
          { name: '.hidden.png', isDirectory: () => false },
        ]);
      });

      const files = await uploader.findScreenshots('/test/dir');

      expect(files).toHaveLength(4); // root.png, .hidden.png, nested.png, another.jpg
      expect(files).toContain('/test/dir/root.png');
      expect(files).toContain('/test/dir/.hidden.png');
      expect(files).toContain('/test/dir/subdir/nested.png');
      expect(files).toContain('/test/dir/subdir/another.jpg');
    });

    it('handles empty directory when finding screenshots', async () => {
      const { readdir } = await import('fs/promises');

      readdir.mockResolvedValue([
        { name: 'file.txt', isDirectory: () => false },
        { name: 'document.pdf', isDirectory: () => false },
      ]);

      const files = await uploader.findScreenshots('/empty/dir');
      expect(files).toEqual([]);
    });

    it('handles readdir errors gracefully', async () => {
      const { readdir } = await import('fs/promises');

      readdir.mockRejectedValue(new Error('Permission denied'));

      await expect(uploader.findScreenshots('/restricted/dir')).rejects.toThrow(
        'Permission denied'
      );
    });

    it('creates build with correct metadata', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'build123',
            name: 'Test Build',
            status: 'created',
          }),
      });

      const options = {
        buildName: 'Test Build',
        environment: 'test',
        branch: 'main',
        commitSha: 'abc123',
        commitMessage: 'Test commit',
        tags: ['test-tag'],
      };

      const result = await uploader.createBuild(options);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.vizzly.com/builds',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
          }),
          body: JSON.stringify({
            name: 'Test Build',
            environment: 'test',
            branch: 'main',
            commitSha: 'abc123',
            commitMessage: 'Test commit',
            tags: ['test-tag'],
          }),
        })
      );

      expect(result).toEqual({
        id: 'build123',
        name: 'Test Build',
        status: 'created',
      });
    });

    it('gets build status correctly', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'build123',
            status: 'completed',
            screenshots: 5,
          }),
      });

      const result = await uploader.getBuildStatus('build123');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.vizzly.com/builds/build123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );

      expect(result).toEqual({
        id: 'build123',
        status: 'completed',
        screenshots: 5,
      });
    });

    it('handles different file extensions correctly', () => {
      const extensions = [
        { file: 'test.png', expected: true },
        { file: 'test.PNG', expected: true },
        { file: 'test.jpg', expected: true },
        { file: 'test.JPG', expected: true },
        { file: 'test.jpeg', expected: true },
        { file: 'test.JPEG', expected: true },
        { file: 'test.webp', expected: true },
        { file: 'test.WEBP', expected: true },
        { file: 'test.gif', expected: false },
        { file: 'test.svg', expected: false },
        { file: 'test.txt', expected: false },
        { file: 'test', expected: false },
      ];

      extensions.forEach(({ file, expected }) => {
        expect(uploader.isScreenshotFile(file)).toBe(expected);
      });
    });
  });
});
