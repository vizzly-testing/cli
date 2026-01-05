import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

let __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Check if the SSR build artifacts exist (required for full tests)
 */
function ssrBuildExists() {
  let ssrPath = join(
    __dirname,
    '..',
    '..',
    'dist',
    'reporter-ssr',
    'ssr-entry.js'
  );
  return existsSync(ssrPath);
}

/**
 * Create a unique temporary directory for each test
 */
function createTempDir() {
  let dir = join(
    tmpdir(),
    `vizzly-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Clean up temp directory
 */
function cleanupTempDir(dir) {
  try {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create mock .vizzly directory structure with test data
 */
function setupMockVizzlyDir(workingDir, options = {}) {
  let vizzlyDir = join(workingDir, '.vizzly');
  mkdirSync(vizzlyDir, { recursive: true });

  // Create report-data.json
  let reportData = options.reportData || {
    comparisons: [
      {
        id: 'test-1',
        name: 'test-screenshot',
        status: 'failed',
        baseline: '/images/baselines/test.png',
        current: '/images/current/test.png',
        diff: '/images/diffs/test.png',
      },
    ],
    timestamp: Date.now(),
  };
  writeFileSync(
    join(vizzlyDir, 'report-data.json'),
    JSON.stringify(reportData)
  );

  // Create image directories with test images
  let imageData = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  mkdirSync(join(vizzlyDir, 'baselines'), { recursive: true });
  mkdirSync(join(vizzlyDir, 'current'), { recursive: true });
  mkdirSync(join(vizzlyDir, 'diffs'), { recursive: true });

  writeFileSync(join(vizzlyDir, 'baselines', 'test.png'), imageData);
  writeFileSync(join(vizzlyDir, 'current', 'test.png'), imageData);
  writeFileSync(join(vizzlyDir, 'diffs', 'test.png'), imageData);

  return vizzlyDir;
}

describe('services/static-report-generator', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('generateStaticReport', () => {
    it('should return error when report data is missing', async () => {
      let { generateStaticReport } = await import(
        '../../src/services/static-report-generator.js'
      );

      let result = await generateStaticReport(tempDir);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.reportPath, null);
      assert.ok(result.error.includes('No report data found'));
    });

    it('should generate HTML report with correct structure', async t => {
      // Skip if SSR build artifacts don't exist (CI runs tests before build)
      if (!ssrBuildExists()) {
        t.skip('SSR build not available - run npm run build first');
        return;
      }

      setupMockVizzlyDir(tempDir);

      let { generateStaticReport } = await import(
        '../../src/services/static-report-generator.js'
      );

      let result = await generateStaticReport(tempDir);

      assert.strictEqual(result.success, true);
      assert.ok(result.reportPath.endsWith('index.html'));
      assert.ok(existsSync(result.reportPath));

      let html = readFileSync(result.reportPath, 'utf8');
      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('<title>Vizzly Visual Test Report</title>'));
      assert.ok(html.includes('<style>'));
    });

    it('should transform image URLs from absolute to relative paths', async t => {
      if (!ssrBuildExists()) {
        t.skip('SSR build not available - run npm run build first');
        return;
      }

      setupMockVizzlyDir(tempDir);

      let { generateStaticReport } = await import(
        '../../src/services/static-report-generator.js'
      );

      let result = await generateStaticReport(tempDir);

      assert.strictEqual(result.success, true);

      let html = readFileSync(result.reportPath, 'utf8');
      // URLs should be transformed from /images/... to ./images/...
      assert.ok(
        html.includes('./images/') || !html.includes('/images/baselines/')
      );
    });

    it('should copy image directories to report folder', async t => {
      if (!ssrBuildExists()) {
        t.skip('SSR build not available - run npm run build first');
        return;
      }

      setupMockVizzlyDir(tempDir);

      let { generateStaticReport } = await import(
        '../../src/services/static-report-generator.js'
      );

      let result = await generateStaticReport(tempDir);

      assert.strictEqual(result.success, true);

      let reportDir = join(tempDir, '.vizzly', 'report');
      assert.ok(existsSync(join(reportDir, 'images', 'baselines', 'test.png')));
      assert.ok(existsSync(join(reportDir, 'images', 'current', 'test.png')));
      assert.ok(existsSync(join(reportDir, 'images', 'diffs', 'test.png')));
    });

    it('should use custom output directory when provided', async t => {
      if (!ssrBuildExists()) {
        t.skip('SSR build not available - run npm run build first');
        return;
      }

      setupMockVizzlyDir(tempDir);
      let customOutputDir = join(tempDir, 'custom-report');

      let { generateStaticReport } = await import(
        '../../src/services/static-report-generator.js'
      );

      let result = await generateStaticReport(tempDir, {
        outputDir: customOutputDir,
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.reportPath.startsWith(customOutputDir));
      assert.ok(existsSync(join(customOutputDir, 'index.html')));
    });

    it('should handle empty comparisons array', async t => {
      if (!ssrBuildExists()) {
        t.skip('SSR build not available - run npm run build first');
        return;
      }

      setupMockVizzlyDir(tempDir, {
        reportData: { comparisons: [], timestamp: Date.now() },
      });

      let { generateStaticReport } = await import(
        '../../src/services/static-report-generator.js'
      );

      let result = await generateStaticReport(tempDir);

      assert.strictEqual(result.success, true);
      assert.ok(existsSync(result.reportPath));
    });

    it('should include baseline metadata when available', async t => {
      if (!ssrBuildExists()) {
        t.skip('SSR build not available - run npm run build first');
        return;
      }

      let vizzlyDir = setupMockVizzlyDir(tempDir);

      // Add baseline metadata
      let metadataDir = join(vizzlyDir, 'baselines');
      writeFileSync(
        join(metadataDir, 'metadata.json'),
        JSON.stringify({ branch: 'main', commit: 'abc123' })
      );

      let { generateStaticReport } = await import(
        '../../src/services/static-report-generator.js'
      );

      let result = await generateStaticReport(tempDir);

      assert.strictEqual(result.success, true);
    });

    it('should return error when SSR module is missing', async t => {
      if (ssrBuildExists()) {
        t.skip('SSR build exists - cannot test missing module error');
        return;
      }

      setupMockVizzlyDir(tempDir);

      let { generateStaticReport } = await import(
        '../../src/services/static-report-generator.js'
      );

      let result = await generateStaticReport(tempDir);

      assert.strictEqual(result.success, false);
      assert.ok(
        result.error.includes('not found') || result.error.includes('build')
      );
    });
  });

  describe('getReportFileUrl', () => {
    it('should return file:// URL for report path', async () => {
      let { getReportFileUrl } = await import(
        '../../src/services/static-report-generator.js'
      );

      let url = getReportFileUrl('/path/to/report/index.html');

      assert.strictEqual(url, 'file:///path/to/report/index.html');
    });
  });
});
