import assert from 'node:assert';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  previewCommand,
  validatePreviewOptions,
} from '../../src/commands/preview.js';

/**
 * Create mock output object that tracks calls
 */
function createMockOutput() {
  let calls = [];
  return {
    calls,
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    info: msg => calls.push({ method: 'info', args: [msg] }),
    debug: (msg, data) => calls.push({ method: 'debug', args: [msg, data] }),
    error: (msg, err) => calls.push({ method: 'error', args: [msg, err] }),
    success: msg => calls.push({ method: 'success', args: [msg] }),
    warn: msg => calls.push({ method: 'warn', args: [msg] }),
    hint: msg => calls.push({ method: 'hint', args: [msg] }),
    progress: (msg, cur, tot) =>
      calls.push({ method: 'progress', args: [msg, cur, tot] }),
    startSpinner: msg => calls.push({ method: 'startSpinner', args: [msg] }),
    updateSpinner: msg => calls.push({ method: 'updateSpinner', args: [msg] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
    complete: (msg, opts) =>
      calls.push({ method: 'complete', args: [msg, opts] }),
    keyValue: (data, opts) =>
      calls.push({ method: 'keyValue', args: [data, opts] }),
    labelValue: (label, value, opts) =>
      calls.push({ method: 'labelValue', args: [label, value, opts] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
    print: msg => calls.push({ method: 'print', args: [msg] }),
    link: (_label, url) => url,
    data: obj => calls.push({ method: 'data', args: [obj] }),
    getColors: () => ({
      brand: {
        textTertiary: s => s,
        success: s => s,
        danger: s => s,
      },
      white: s => s,
      green: s => s,
      cyan: s => s,
      dim: s => s,
      underline: s => s,
    }),
  };
}

describe('validatePreviewOptions', () => {
  it('passes with valid path', () => {
    let errors = validatePreviewOptions('./dist', {});
    assert.strictEqual(errors.length, 0);
  });

  it('fails with missing path', () => {
    let errors = validatePreviewOptions(null, {});
    assert.ok(errors.includes('Path to static files is required'));
  });

  it('fails with empty path', () => {
    let errors = validatePreviewOptions('', {});
    assert.ok(errors.includes('Path to static files is required'));
  });

  it('fails with whitespace-only path', () => {
    let errors = validatePreviewOptions('   ', {});
    assert.ok(errors.includes('Path to static files is required'));
  });
});

describe('previewCommand', () => {
  let testDir;
  let distDir;

  beforeEach(() => {
    testDir = join(tmpdir(), `vizzly-preview-test-${Date.now()}`);
    distDir = join(testDir, 'dist');
    mkdirSync(distDir, { recursive: true });

    // Create some test files
    writeFileSync(join(distDir, 'index.html'), '<html></html>');
    writeFileSync(join(distDir, 'app.js'), 'console.log("hello")');
    mkdirSync(join(distDir, 'assets'));
    writeFileSync(join(distDir, 'assets', 'style.css'), 'body {}');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('fails without API token', async () => {
    let output = createMockOutput();
    let exitCode = null;

    await previewCommand(
      distDir,
      {},
      {},
      {
        loadConfig: async () => ({ apiKey: null }),
        output,
        exit: code => {
          exitCode = code;
        },
      }
    );

    assert.strictEqual(exitCode, 1);
    assert.ok(
      output.calls.some(
        c => c.method === 'error' && c.args[0].includes('API token')
      ),
      'Should show API token error'
    );
  });

  it('fails when path does not exist', async () => {
    let output = createMockOutput();
    let exitCode = null;

    await previewCommand(
      '/nonexistent/path',
      {},
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
        }),
        output,
        exit: code => {
          exitCode = code;
        },
      }
    );

    assert.strictEqual(exitCode, 1);
    assert.ok(
      output.calls.some(
        c => c.method === 'error' && c.args[0].includes('does not exist')
      ),
      'Should show path not found error'
    );
  });

  it('fails when no build ID is found', async () => {
    let output = createMockOutput();
    let exitCode = null;

    await previewCommand(
      distDir,
      {},
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
        }),
        readSession: () => null, // No session
        detectBranch: async () => 'main',
        output,
        exit: code => {
          exitCode = code;
        },
      }
    );

    assert.strictEqual(exitCode, 1);
    assert.ok(
      output.calls.some(
        c => c.method === 'error' && c.args[0].includes('No build found')
      ),
      'Should show no build found error'
    );
  });

  it('uses build ID from session when available', async () => {
    let output = createMockOutput();
    let capturedBuildId = null;

    await previewCommand(
      distDir,
      {},
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
        }),
        readSession: () => ({
          buildId: 'session-build-123',
          source: 'session_file',
          expired: false,
          branchMismatch: false,
          age: 60000,
        }),
        formatSessionAge: () => '1m ago',
        detectBranch: async () => 'main',
        createApiClient: () => ({
          request: async () => ({}),
        }),
        getBuild: async () => ({ project: { isPublic: true } }),
        uploadPreviewZip: async (_client, buildId) => {
          capturedBuildId = buildId;
          return {
            previewUrl: 'https://preview.test',
            uploaded: 3,
            totalBytes: 1000,
            newBytes: 800,
            reusedBlobs: 0,
          };
        },
        output,
        exit: () => {},
      }
    );

    assert.strictEqual(capturedBuildId, 'session-build-123');
  });

  it('uses explicit build ID from options over session', async () => {
    let output = createMockOutput();
    let capturedBuildId = null;

    await previewCommand(
      distDir,
      { build: 'explicit-build-456' },
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
        }),
        readSession: () => ({
          buildId: 'session-build-123',
          source: 'session_file',
          expired: false,
        }),
        detectBranch: async () => 'main',
        createApiClient: () => ({}),
        getBuild: async () => ({ project: { isPublic: true } }),
        uploadPreviewZip: async (_client, buildId) => {
          capturedBuildId = buildId;
          return {
            previewUrl: 'https://preview.test',
            uploaded: 3,
            totalBytes: 1000,
            newBytes: 800,
          };
        },
        output,
        exit: () => {},
      }
    );

    assert.strictEqual(capturedBuildId, 'explicit-build-456');
  });

  it('warns on branch mismatch', async () => {
    let output = createMockOutput();
    let exitCode = null;

    await previewCommand(
      distDir,
      {},
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
        }),
        readSession: () => ({
          buildId: 'build-123',
          branch: 'main',
          source: 'session_file',
          expired: false,
          branchMismatch: true,
        }),
        detectBranch: async () => 'feature-branch',
        output,
        exit: code => {
          exitCode = code;
        },
      }
    );

    assert.strictEqual(exitCode, 1);
    assert.ok(
      output.calls.some(
        c => c.method === 'warn' && c.args[0].includes('different branch')
      ),
      'Should warn about branch mismatch'
    );
  });

  it('outputs JSON when --json flag is set', async () => {
    let output = createMockOutput();

    await previewCommand(
      distDir,
      { build: 'build-123' },
      { json: true },
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
        }),
        createApiClient: () => ({}),
        getBuild: async () => ({ project: { isPublic: true } }),
        uploadPreviewZip: async () => ({
          previewUrl: 'https://preview.test',
          uploaded: 3,
          totalBytes: 1000,
          newBytes: 800,
          deduplicationRatio: 0.2,
        }),
        output,
        exit: () => {},
      }
    );

    let dataCall = output.calls.find(c => c.method === 'data');
    assert.ok(dataCall, 'Should output JSON data');
    assert.strictEqual(dataCall.args[0].success, true);
    assert.strictEqual(dataCall.args[0].previewUrl, 'https://preview.test');
    assert.strictEqual(dataCall.args[0].buildId, 'build-123');
  });

  it('opens browser when --open flag is set', async () => {
    let output = createMockOutput();
    let openedUrl = null;

    await previewCommand(
      distDir,
      { build: 'build-123', open: true },
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
        }),
        createApiClient: () => ({}),
        getBuild: async () => ({ project: { isPublic: true } }),
        uploadPreviewZip: async () => ({
          previewUrl: 'https://preview.test',
          uploaded: 3,
          totalBytes: 1000,
          newBytes: 800,
        }),
        openBrowser: async url => {
          openedUrl = url;
          return true;
        },
        output,
        exit: () => {},
      }
    );

    assert.strictEqual(openedUrl, 'https://preview.test');
  });

  it('dry-run shows files without uploading', async () => {
    let output = createMockOutput();
    let uploadCalled = false;

    let result = await previewCommand(
      distDir,
      { dryRun: true, build: 'build-123' },
      {},
      {
        loadConfig: async () => ({
          apiKey: null, // No API key needed for dry-run
          apiUrl: 'https://api.test',
        }),
        uploadPreviewZip: async () => {
          uploadCalled = true;
          return {};
        },
        output,
        exit: () => {},
      }
    );

    assert.strictEqual(uploadCalled, false, 'Should not upload in dry-run');
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.fileCount, 3); // index.html, app.js, assets/style.css
    assert.ok(result.files.length > 0, 'Should return file list');
  });

  it('dry-run outputs JSON when --json flag is set', async () => {
    let output = createMockOutput();

    await previewCommand(
      distDir,
      { dryRun: true, build: 'build-123' },
      { json: true },
      {
        loadConfig: async () => ({
          apiKey: null,
          apiUrl: 'https://api.test',
        }),
        output,
        exit: () => {},
      }
    );

    let dataCall = output.calls.find(c => c.method === 'data');
    assert.ok(dataCall, 'Should output JSON data');
    assert.strictEqual(dataCall.args[0].dryRun, true);
    assert.ok(dataCall.args[0].files.length > 0);
    assert.ok(Array.isArray(dataCall.args[0].excludedDirs));
    assert.ok(Array.isArray(dataCall.args[0].excludedFiles));
  });

  it('excludes files matching --exclude patterns', async () => {
    let output = createMockOutput();

    let result = await previewCommand(
      distDir,
      { dryRun: true, build: 'build-123', exclude: ['*.js'] },
      {},
      {
        loadConfig: async () => ({
          apiKey: null,
          apiUrl: 'https://api.test',
        }),
        output,
        exit: () => {},
      }
    );

    let filePaths = result.files.map(f => f.path);
    assert.ok(
      !filePaths.some(p => p.endsWith('.js')),
      'Should exclude .js files'
    );
    assert.ok(
      filePaths.some(p => p.endsWith('.html')),
      'Should include .html files'
    );
  });

  it('excludes directories matching --exclude patterns with trailing slash', async () => {
    let output = createMockOutput();

    let result = await previewCommand(
      distDir,
      { dryRun: true, build: 'build-123', exclude: ['assets/'] },
      {},
      {
        loadConfig: async () => ({
          apiKey: null,
          apiUrl: 'https://api.test',
        }),
        output,
        exit: () => {},
      }
    );

    let filePaths = result.files.map(f => f.path);
    assert.ok(
      !filePaths.some(p => p.startsWith('assets/')),
      'Should exclude assets directory'
    );
    assert.ok(
      filePaths.some(p => p === 'index.html'),
      'Should include index.html'
    );
  });

  it('includes files matching --include patterns that override defaults', async () => {
    // Create a package.json file (normally excluded by default)
    writeFileSync(join(distDir, 'package.json'), '{}');

    let output = createMockOutput();

    let result = await previewCommand(
      distDir,
      { dryRun: true, build: 'build-123', include: ['package.json'] },
      {},
      {
        loadConfig: async () => ({
          apiKey: null,
          apiUrl: 'https://api.test',
        }),
        output,
        exit: () => {},
      }
    );

    let filePaths = result.files.map(f => f.path);
    assert.ok(
      filePaths.includes('package.json'),
      'Should include package.json when --include is used'
    );
  });

  it('excludes node_modules by default', async () => {
    // Create a node_modules directory with a file
    mkdirSync(join(distDir, 'node_modules', 'some-package'), {
      recursive: true,
    });
    writeFileSync(
      join(distDir, 'node_modules', 'some-package', 'index.js'),
      'module.exports = {}'
    );

    let output = createMockOutput();

    let result = await previewCommand(
      distDir,
      { dryRun: true, build: 'build-123' },
      {},
      {
        loadConfig: async () => ({
          apiKey: null,
          apiUrl: 'https://api.test',
        }),
        output,
        exit: () => {},
      }
    );

    let filePaths = result.files.map(f => f.path);
    assert.ok(
      !filePaths.some(p => p.includes('node_modules')),
      'Should exclude node_modules by default'
    );
  });

  it('excludes config files by default', async () => {
    // Create config files
    writeFileSync(join(distDir, 'vite.config.js'), 'export default {}');
    writeFileSync(join(distDir, 'tsconfig.json'), '{}');

    let output = createMockOutput();

    let result = await previewCommand(
      distDir,
      { dryRun: true, build: 'build-123' },
      {},
      {
        loadConfig: async () => ({
          apiKey: null,
          apiUrl: 'https://api.test',
        }),
        output,
        exit: () => {},
      }
    );

    let filePaths = result.files.map(f => f.path);
    assert.ok(
      !filePaths.includes('vite.config.js'),
      'Should exclude *.config.js'
    );
    assert.ok(
      !filePaths.includes('tsconfig.json'),
      'Should exclude tsconfig.json'
    );
  });

  it('fails when getBuild returns 404', async () => {
    let output = createMockOutput();
    let exitCode = null;

    let result = await previewCommand(
      distDir,
      { build: 'nonexistent-build' },
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
        }),
        createApiClient: () => ({}),
        getBuild: async () => {
          let error = new Error('Not found');
          error.status = 404;
          throw error;
        },
        output,
        exit: code => {
          exitCode = code;
        },
      }
    );

    assert.strictEqual(exitCode, 1);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'build-fetch-failed');
    assert.ok(
      output.calls.some(
        c => c.method === 'error' && c.args[0].includes('Build not found')
      ),
      'Should show build not found error'
    );
  });

  it('fails when getBuild throws network error', async () => {
    let output = createMockOutput();
    let exitCode = null;

    let result = await previewCommand(
      distDir,
      { build: 'build-123' },
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
        }),
        createApiClient: () => ({}),
        getBuild: async () => {
          throw new Error('Network error');
        },
        output,
        exit: code => {
          exitCode = code;
        },
      }
    );

    assert.strictEqual(exitCode, 1);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'build-fetch-failed');
    assert.ok(
      output.calls.some(
        c =>
          c.method === 'error' &&
          c.args[0].includes('Failed to verify project visibility')
      ),
      'Should show visibility check error'
    );
  });

  it('fails for private project without --public-link flag', async () => {
    let output = createMockOutput();
    let exitCode = null;

    let result = await previewCommand(
      distDir,
      { build: 'build-123' },
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
        }),
        createApiClient: () => ({}),
        getBuild: async () => ({
          id: 'build-123',
          project: { id: 'proj-1', name: 'Test Project', isPublic: false },
        }),
        uploadPreviewZip: async () => {
          throw new Error('Should not reach upload');
        },
        output,
        exit: code => {
          exitCode = code;
        },
      }
    );

    assert.strictEqual(exitCode, 1);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'private-project-no-flag');
    assert.ok(
      output.calls.some(
        c => c.method === 'error' && c.args[0].includes('private')
      ),
      'Should show private project error'
    );
    assert.ok(
      output.calls.some(
        c => c.method === 'print' && c.args[0].includes('--public-link')
      ),
      'Should mention --public-link flag in output'
    );
  });

  it('succeeds for private project with --public-link flag', async () => {
    let output = createMockOutput();
    let uploadCalled = false;

    let result = await previewCommand(
      distDir,
      { build: 'build-123', publicLink: true },
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
        }),
        createApiClient: () => ({}),
        getBuild: async () => ({
          id: 'build-123',
          project: { id: 'proj-1', name: 'Test Project', isPublic: false },
        }),
        uploadPreviewZip: async () => {
          uploadCalled = true;
          return {
            previewUrl: 'https://preview.test',
            uploaded: 3,
            totalBytes: 1000,
            newBytes: 800,
          };
        },
        output,
        exit: () => {},
      }
    );

    assert.strictEqual(uploadCalled, true, 'Should call upload');
    assert.strictEqual(result.success, true);
  });

  it('succeeds for public project without --public-link flag', async () => {
    let output = createMockOutput();
    let uploadCalled = false;

    let result = await previewCommand(
      distDir,
      { build: 'build-123' },
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
        }),
        createApiClient: () => ({}),
        getBuild: async () => ({
          id: 'build-123',
          project: { id: 'proj-1', name: 'Test Project', isPublic: true },
        }),
        uploadPreviewZip: async () => {
          uploadCalled = true;
          return {
            previewUrl: 'https://preview.test',
            uploaded: 3,
            totalBytes: 1000,
            newBytes: 800,
          };
        },
        output,
        exit: () => {},
      }
    );

    assert.strictEqual(uploadCalled, true, 'Should call upload');
    assert.strictEqual(result.success, true);
  });
});
