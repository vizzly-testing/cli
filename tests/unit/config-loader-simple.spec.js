import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getScreenshotPaths } from '../../src/utils/config-loader.js';

// Mock path.resolve
vi.mock('path', () => ({
  resolve: vi.fn((...paths) => paths.join('/')),
}));

describe('Config Loader - Simple Tests', () => {
  let originalEnv;
  let originalCwd;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalCwd = process.cwd;
    process.cwd = vi.fn(() => '/current/working/dir');
  });

  afterEach(() => {
    process.env = originalEnv;
    process.cwd = originalCwd;
    vi.clearAllMocks();
  });

  describe('getScreenshotPaths', () => {
    it('should return default screenshot path when not configured', () => {
      const config = {};
      const paths = getScreenshotPaths(config);

      expect(paths).toEqual(['/current/working/dir/./screenshots']);
    });

    it('should return configured screenshot directory', () => {
      const config = {
        upload: {
          screenshotsDir: './custom-screenshots',
        },
      };
      const paths = getScreenshotPaths(config);

      expect(paths).toEqual(['/current/working/dir/./custom-screenshots']);
    });

    it('should handle array of screenshot directories', () => {
      const config = {
        upload: {
          screenshotsDir: [
            './screenshots1',
            './screenshots2',
            './screenshots3',
          ],
        },
      };
      const paths = getScreenshotPaths(config);

      expect(paths).toEqual([
        '/current/working/dir/./screenshots1',
        '/current/working/dir/./screenshots2',
        '/current/working/dir/./screenshots3',
      ]);
    });
  });
});
