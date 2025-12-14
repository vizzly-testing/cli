import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

describe('Client SDK - Request Timeout', () => {
  let baseDir;
  let testDir;
  let originalFetch;
  let testCounter = 0;

  beforeAll(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'vizzly-client-reliability-'));
  });

  afterAll(() => {
    try {
      rmSync(baseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;

    // Create isolated test directory
    testCounter++;
    testDir = join(baseDir, `test-${testCounter}`, '.vizzly');
    mkdirSync(testDir, { recursive: true });

    // Mock server.json for auto-discovery
    writeFileSync(
      join(testDir, 'server.json'),
      JSON.stringify({ port: 47392 })
    );

    // Change working directory for auto-discovery
    process.chdir(join(baseDir, `test-${testCounter}`));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.resetModules();
    vi.useRealTimers();
  });

  it('should timeout slow requests after 30 seconds', async () => {
    // Mock fetch that respects abort signal
    global.fetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            const error = new Error('This operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }
        // Never resolve - will be aborted by timeout
      });
    });

    const { vizzlyScreenshot } = await import('../../src/client/index.js');

    vi.useFakeTimers();

    const screenshotPromise = vizzlyScreenshot(
      'slow-test',
      Buffer.from('data')
    );

    // Fast-forward past the timeout (30 seconds)
    await vi.advanceTimersByTimeAsync(31000);

    const result = await screenshotPromise;

    // Should return null (graceful failure)
    expect(result).toBeNull();
  });

  it('should clear timeout on successful response', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { vizzlyScreenshot } = await import('../../src/client/index.js');

    await vizzlyScreenshot('fast-test', Buffer.from('data'));

    // Timeout should be cleared after successful response
    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
  });

  it('should disable client after timeout to prevent blocking further tests', async () => {
    global.fetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }
      });
    });

    const { vizzlyScreenshot, getVizzlyInfo } = await import(
      '../../src/client/index.js'
    );

    vi.useFakeTimers();

    const firstPromise = vizzlyScreenshot('timeout-test', Buffer.from('data'));
    await vi.advanceTimersByTimeAsync(31000);
    await firstPromise;

    vi.useRealTimers();

    // Client should be disabled after timeout
    const info = getVizzlyInfo();
    expect(info.disabled).toBe(true);

    // Subsequent calls should be skipped silently
    global.fetch.mockClear();
    await vizzlyScreenshot('skipped-test', Buffer.from('data'));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should handle connection refused gracefully', async () => {
    const error = new Error('fetch failed');
    error.code = 'ECONNREFUSED';
    global.fetch = vi.fn().mockRejectedValue(error);

    const { vizzlyScreenshot, getVizzlyInfo } = await import(
      '../../src/client/index.js'
    );

    const result = await vizzlyScreenshot(
      'connection-test',
      Buffer.from('data')
    );

    // Should return null on error (graceful failure)
    // Note: returns undefined if client was never initialized, null if error occurred
    expect(result).toBeFalsy();

    // Client should be disabled
    const info = getVizzlyInfo();
    expect(info.disabled).toBe(true);
  });

  it('should handle TDD mode visual diffs without disabling', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: () =>
        Promise.resolve({
          tddMode: true,
          comparison: {
            name: 'test-visual',
            diffPercentage: 5.5,
          },
        }),
    });

    const { vizzlyScreenshot } = await import('../../src/client/index.js');

    // TDD mode visual diffs should return result (not throw, not disable)
    const result = await vizzlyScreenshot(
      'visual-diff-test',
      Buffer.from('data')
    );

    expect(result).toEqual({
      success: true,
      status: 'failed',
      name: 'test-visual',
      diffPercentage: 5.5,
    });
  });

  it('should send threshold and minClusterSize in properties when provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { vizzlyScreenshot } = await import('../../src/client/index.js');

    await vizzlyScreenshot('override-test', Buffer.from('data'), {
      threshold: 5.0,
      minClusterSize: 10,
      viewport: { width: 1920, height: 1080 },
    });

    // Verify fetch was called with threshold and minClusterSize in properties
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:47392/screenshot',
      expect.objectContaining({
        method: 'POST',
      })
    );

    // Parse the body to verify structure
    const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody.properties).toMatchObject({
      threshold: 5.0,
      minClusterSize: 10,
      viewport: { width: 1920, height: 1080 },
    });
  });

  it('should handle threshold: 0 for exact match requirement', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { vizzlyScreenshot } = await import('../../src/client/index.js');

    await vizzlyScreenshot('exact-match-test', Buffer.from('data'), {
      threshold: 0,
      minClusterSize: 1,
    });

    const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody.properties.threshold).toBe(0);
    expect(callBody.properties.minClusterSize).toBe(1);
  });
});
