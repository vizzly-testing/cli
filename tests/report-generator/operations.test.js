import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  checkBundlesExist,
  copyBundles,
  ensureDirectory,
  generateReport,
  writeHtmlFile,
} from '../../src/report-generator/operations.js';

describe('report-generator/operations', () => {
  describe('ensureDirectory', () => {
    it('creates directory with recursive option', async () => {
      let createdPath = null;
      let createdOpts = null;

      let mockMkdir = async (path, opts) => {
        createdPath = path;
        createdOpts = opts;
      };

      await ensureDirectory({
        path: '/reports/tdd',
        deps: { mkdir: mockMkdir },
      });

      assert.strictEqual(createdPath, '/reports/tdd');
      assert.deepStrictEqual(createdOpts, { recursive: true });
    });
  });

  describe('checkBundlesExist', () => {
    it('returns true when both bundles exist', () => {
      let mockExistsSync = () => true;

      let result = checkBundlesExist({
        projectRoot: '/project',
        deps: { existsSync: mockExistsSync },
      });

      assert.strictEqual(result.bundleExists, true);
      assert.strictEqual(result.cssExists, true);
      assert.ok(result.bundlePath.includes('reporter-bundle'));
      assert.ok(result.cssPath.includes('reporter-bundle.css'));
    });

    it('returns false when bundles do not exist', () => {
      let mockExistsSync = () => false;

      let result = checkBundlesExist({
        projectRoot: '/project',
        deps: { existsSync: mockExistsSync },
      });

      assert.strictEqual(result.bundleExists, false);
      assert.strictEqual(result.cssExists, false);
    });

    it('handles mixed existence', () => {
      let calls = 0;
      let mockExistsSync = () => {
        calls++;
        return calls === 1; // First call (bundle) true, second (css) false
      };

      let result = checkBundlesExist({
        projectRoot: '/project',
        deps: { existsSync: mockExistsSync },
      });

      assert.strictEqual(result.bundleExists, true);
      assert.strictEqual(result.cssExists, false);
    });
  });

  describe('copyBundles', () => {
    it('copies bundle and css files to report directory', async () => {
      let copiedFiles = [];

      let mockCopyFile = async (src, dest) => {
        copiedFiles.push({ src, dest });
      };

      await copyBundles({
        bundlePath: '/src/reporter.js',
        cssPath: '/src/reporter.css',
        reportDir: '/reports/tdd',
        deps: { copyFile: mockCopyFile },
      });

      assert.strictEqual(copiedFiles.length, 2);
      assert.strictEqual(copiedFiles[0].src, '/src/reporter.js');
      assert.ok(copiedFiles[0].dest.includes('reporter-bundle.js'));
      assert.strictEqual(copiedFiles[1].src, '/src/reporter.css');
      assert.ok(copiedFiles[1].dest.includes('reporter-bundle.css'));
    });
  });

  describe('writeHtmlFile', () => {
    it('writes content to file with utf8 encoding', async () => {
      let writtenPath = null;
      let writtenContent = null;
      let writtenEncoding = null;

      let mockWriteFile = async (path, content, encoding) => {
        writtenPath = path;
        writtenContent = content;
        writtenEncoding = encoding;
      };

      await writeHtmlFile({
        path: '/reports/index.html',
        content: '<html></html>',
        deps: { writeFile: mockWriteFile },
      });

      assert.strictEqual(writtenPath, '/reports/index.html');
      assert.strictEqual(writtenContent, '<html></html>');
      assert.strictEqual(writtenEncoding, 'utf8');
    });
  });

  describe('generateReport', () => {
    it('generates complete report with valid data', async () => {
      let mkdirCalled = false;
      let copyFileCalled = 0;
      let writeFilePath = null;
      let writeFileContent = null;

      let deps = {
        mkdir: async () => {
          mkdirCalled = true;
        },
        existsSync: () => true,
        copyFile: async () => {
          copyFileCalled++;
        },
        writeFile: async (path, content) => {
          writeFilePath = path;
          writeFileContent = content;
        },
        output: {
          debug: () => {},
          error: () => {},
        },
        getDate: () => new Date('2024-01-15T12:00:00Z'),
      };

      let reportData = {
        comparisons: [{ name: 'test', status: 'passed' }],
        summary: { total: 1, passed: 1 },
      };

      let result = await generateReport({
        reportData,
        workingDir: '/project/.vizzly',
        projectRoot: '/project',
        deps,
      });

      assert.strictEqual(mkdirCalled, true);
      assert.strictEqual(copyFileCalled, 2); // bundle + css
      assert.ok(writeFilePath.includes('index.html'));
      assert.ok(writeFileContent.includes('<!DOCTYPE html>'));
      assert.ok(writeFileContent.includes('window.VIZZLY_REPORTER_DATA'));
      assert.ok(result.includes('index.html'));
    });

    it('throws error for invalid report data', async () => {
      let deps = {
        mkdir: async () => {},
        existsSync: () => true,
        copyFile: async () => {},
        writeFile: async () => {},
        output: {
          debug: () => {},
          error: () => {},
        },
        getDate: () => new Date(),
      };

      await assert.rejects(
        () =>
          generateReport({
            reportData: null,
            workingDir: '/project/.vizzly',
            projectRoot: '/project',
            deps,
          }),
        error => {
          assert.ok(error.message.includes('Invalid report data'));
          return true;
        }
      );
    });

    it('throws error when bundles do not exist', async () => {
      let deps = {
        mkdir: async () => {},
        existsSync: () => false,
        copyFile: async () => {},
        writeFile: async () => {},
        output: {
          debug: () => {},
          error: () => {},
        },
        getDate: () => new Date(),
      };

      let reportData = {
        comparisons: [],
        summary: { total: 0 },
      };

      await assert.rejects(
        () =>
          generateReport({
            reportData,
            workingDir: '/project/.vizzly',
            projectRoot: '/project',
            deps,
          }),
        error => {
          assert.ok(error.message.includes('Report generation failed'));
          return true;
        }
      );
    });

    it('logs and wraps errors from file operations', async () => {
      let errorLogged = false;

      let deps = {
        mkdir: async () => {
          throw new Error('Permission denied');
        },
        existsSync: () => true,
        copyFile: async () => {},
        writeFile: async () => {},
        output: {
          debug: () => {},
          error: () => {
            errorLogged = true;
          },
        },
        getDate: () => new Date(),
      };

      let reportData = {
        comparisons: [],
        summary: { total: 0 },
      };

      await assert.rejects(
        () =>
          generateReport({
            reportData,
            workingDir: '/project/.vizzly',
            projectRoot: '/project',
            deps,
          }),
        error => {
          assert.ok(error.message.includes('Report generation failed'));
          assert.ok(error.message.includes('Permission denied'));
          return true;
        }
      );

      assert.strictEqual(errorLogged, true);
    });
  });
});
