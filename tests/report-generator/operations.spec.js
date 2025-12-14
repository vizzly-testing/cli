import { describe, expect, it, vi } from 'vitest';
import {
  checkBundlesExist,
  copyBundles,
  ensureDirectory,
  generateReport,
  writeHtmlFile,
} from '../../src/report-generator/operations.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockOutput() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('report-generator/operations', () => {
  describe('ensureDirectory', () => {
    it('calls mkdir with recursive option', async () => {
      let mkdir = vi.fn().mockResolvedValue(undefined);

      await ensureDirectory({
        path: '/home/user/project/.vizzly/report',
        deps: { mkdir },
      });

      expect(mkdir).toHaveBeenCalledWith('/home/user/project/.vizzly/report', {
        recursive: true,
      });
    });
  });

  describe('checkBundlesExist', () => {
    it('returns true when both bundles exist', () => {
      let existsSync = vi.fn().mockReturnValue(true);

      let result = checkBundlesExist({
        projectRoot: '/project',
        deps: { existsSync },
      });

      expect(result.bundleExists).toBe(true);
      expect(result.cssExists).toBe(true);
      expect(existsSync).toHaveBeenCalledTimes(2);
    });

    it('returns false when bundle missing', () => {
      let existsSync = vi
        .fn()
        .mockReturnValueOnce(false) // bundle
        .mockReturnValueOnce(true); // css

      let result = checkBundlesExist({
        projectRoot: '/project',
        deps: { existsSync },
      });

      expect(result.bundleExists).toBe(false);
      expect(result.cssExists).toBe(true);
    });

    it('returns false when css missing', () => {
      let existsSync = vi
        .fn()
        .mockReturnValueOnce(true) // bundle
        .mockReturnValueOnce(false); // css

      let result = checkBundlesExist({
        projectRoot: '/project',
        deps: { existsSync },
      });

      expect(result.bundleExists).toBe(true);
      expect(result.cssExists).toBe(false);
    });

    it('returns correct paths', () => {
      let existsSync = vi.fn().mockReturnValue(true);

      let result = checkBundlesExist({
        projectRoot: '/my/project',
        deps: { existsSync },
      });

      expect(result.bundlePath).toBe(
        '/my/project/dist/reporter/reporter-bundle.iife.js'
      );
      expect(result.cssPath).toBe(
        '/my/project/dist/reporter/reporter-bundle.css'
      );
    });
  });

  describe('copyBundles', () => {
    it('copies both bundle files', async () => {
      let copyFile = vi.fn().mockResolvedValue(undefined);

      await copyBundles({
        bundlePath: '/src/bundle.js',
        cssPath: '/src/style.css',
        reportDir: '/dest/report',
        deps: { copyFile },
      });

      expect(copyFile).toHaveBeenCalledTimes(2);
      expect(copyFile).toHaveBeenCalledWith(
        '/src/bundle.js',
        '/dest/report/reporter-bundle.js'
      );
      expect(copyFile).toHaveBeenCalledWith(
        '/src/style.css',
        '/dest/report/reporter-bundle.css'
      );
    });
  });

  describe('writeHtmlFile', () => {
    it('writes content to file', async () => {
      let writeFile = vi.fn().mockResolvedValue(undefined);

      await writeHtmlFile({
        path: '/dest/index.html',
        content: '<html></html>',
        deps: { writeFile },
      });

      expect(writeFile).toHaveBeenCalledWith(
        '/dest/index.html',
        '<html></html>',
        'utf8'
      );
    });
  });

  describe('generateReport', () => {
    it('generates report successfully', async () => {
      let mkdir = vi.fn().mockResolvedValue(undefined);
      let existsSync = vi.fn().mockReturnValue(true);
      let copyFile = vi.fn().mockResolvedValue(undefined);
      let writeFile = vi.fn().mockResolvedValue(undefined);
      let output = createMockOutput();
      let getDate = () => new Date('2024-01-01T12:00:00.000Z');

      let result = await generateReport({
        reportData: { summary: { total: 5 } },
        workingDir: '/home/user/project',
        projectRoot: '/home/user/project',
        deps: { mkdir, existsSync, copyFile, writeFile, output, getDate },
      });

      expect(result).toBe('/home/user/project/.vizzly/report/index.html');
      expect(mkdir).toHaveBeenCalled();
      expect(copyFile).toHaveBeenCalledTimes(2);
      expect(writeFile).toHaveBeenCalled();
      expect(output.debug).toHaveBeenCalledWith(
        'report',
        'generated static report'
      );
    });

    it('throws on invalid report data', async () => {
      let output = createMockOutput();

      await expect(
        generateReport({
          reportData: null,
          workingDir: '/project',
          projectRoot: '/project',
          deps: {
            mkdir: vi.fn(),
            existsSync: vi.fn(),
            copyFile: vi.fn(),
            writeFile: vi.fn(),
            output,
            getDate: () => new Date(),
          },
        })
      ).rejects.toThrow('Invalid report data provided');
    });

    it('throws when bundles not found', async () => {
      let mkdir = vi.fn().mockResolvedValue(undefined);
      let existsSync = vi.fn().mockReturnValue(false);
      let output = createMockOutput();

      await expect(
        generateReport({
          reportData: { summary: {} },
          workingDir: '/project',
          projectRoot: '/project',
          deps: {
            mkdir,
            existsSync,
            copyFile: vi.fn(),
            writeFile: vi.fn(),
            output,
            getDate: () => new Date(),
          },
        })
      ).rejects.toThrow('Reporter bundles not found');

      expect(output.error).toHaveBeenCalled();
    });

    it('throws when mkdir fails', async () => {
      let mkdir = vi.fn().mockRejectedValue(new Error('Permission denied'));
      let output = createMockOutput();

      await expect(
        generateReport({
          reportData: { summary: {} },
          workingDir: '/project',
          projectRoot: '/project',
          deps: {
            mkdir,
            existsSync: vi.fn(),
            copyFile: vi.fn(),
            writeFile: vi.fn(),
            output,
            getDate: () => new Date(),
          },
        })
      ).rejects.toThrow('Permission denied');
    });

    it('throws when copyFile fails', async () => {
      let mkdir = vi.fn().mockResolvedValue(undefined);
      let existsSync = vi.fn().mockReturnValue(true);
      let copyFile = vi.fn().mockRejectedValue(new Error('Copy failed'));
      let output = createMockOutput();

      await expect(
        generateReport({
          reportData: { summary: {} },
          workingDir: '/project',
          projectRoot: '/project',
          deps: {
            mkdir,
            existsSync,
            copyFile,
            writeFile: vi.fn(),
            output,
            getDate: () => new Date(),
          },
        })
      ).rejects.toThrow('Copy failed');
    });

    it('throws when writeFile fails', async () => {
      let mkdir = vi.fn().mockResolvedValue(undefined);
      let existsSync = vi.fn().mockReturnValue(true);
      let copyFile = vi.fn().mockResolvedValue(undefined);
      let writeFile = vi.fn().mockRejectedValue(new Error('Write failed'));
      let output = createMockOutput();

      await expect(
        generateReport({
          reportData: { summary: {} },
          workingDir: '/project',
          projectRoot: '/project',
          deps: {
            mkdir,
            existsSync,
            copyFile,
            writeFile,
            output,
            getDate: () => new Date(),
          },
        })
      ).rejects.toThrow('Write failed');
    });

    it('generates correct HTML content', async () => {
      let mkdir = vi.fn().mockResolvedValue(undefined);
      let existsSync = vi.fn().mockReturnValue(true);
      let copyFile = vi.fn().mockResolvedValue(undefined);
      let writeFile = vi.fn().mockResolvedValue(undefined);
      let output = createMockOutput();
      let getDate = () => new Date('2024-01-01T12:00:00.000Z');

      await generateReport({
        reportData: { summary: { total: 10, passed: 8, failed: 2 } },
        workingDir: '/project',
        projectRoot: '/project',
        deps: { mkdir, existsSync, copyFile, writeFile, output, getDate },
      });

      let htmlContent = writeFile.mock.calls[0][1];
      expect(htmlContent).toContain('<!DOCTYPE html>');
      expect(htmlContent).toContain('window.VIZZLY_REPORTER_DATA');
      expect(htmlContent).toContain('"total":10');
      expect(htmlContent).toContain('"passed":8');
      expect(htmlContent).toContain('"failed":2');
      expect(htmlContent).toContain('2024-01-01T12:00:00.000Z');
    });
  });
});
