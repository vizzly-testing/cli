import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('Client SDK - Request Timeout', () => {
  let testDir;
  let originalFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;

    // Create test directory
    testDir = join(process.cwd(), '.vizzly');
    mkdirSync(testDir, { recursive: true });

    // Mock server.json for auto-discovery
    writeFileSync(
      join(testDir, 'server.json'),
      JSON.stringify({ port: 47392 })
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;

    // Clean up test files
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    vi.resetModules();
    vi.useRealTimers();
  });

  it('should timeout slow requests after 30 seconds', async () => {
    // Mock fetch that respects abort signal
    global.fetch = vi.fn().mockImplementation((url, options) => {
      return new Promise((resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            let error = new Error('This operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }
        // Never resolve - will be aborted by timeout
      });
    });

    const { vizzlyScreenshot } = await import('../../src/client/index.js');

    vi.useFakeTimers();

    let screenshotPromise = vizzlyScreenshot('slow-test', Buffer.from('data'));

    // Fast-forward past the timeout (30 seconds)
    await vi.advanceTimersByTimeAsync(31000);

    let result = await screenshotPromise;

    // Should return null (graceful failure)
    expect(result).toBeNull();
  });

  it('should clear timeout on successful response', async () => {
    let clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

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
    global.fetch = vi.fn().mockImplementation((url, options) => {
      return new Promise((resolve, reject) => {
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            let error = new Error('Aborted');
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

    let firstPromise = vizzlyScreenshot('timeout-test', Buffer.from('data'));
    await vi.advanceTimersByTimeAsync(31000);
    await firstPromise;

    vi.useRealTimers();

    // Client should be disabled after timeout
    let info = getVizzlyInfo();
    expect(info.disabled).toBe(true);

    // Subsequent calls should be skipped silently
    global.fetch.mockClear();
    await vizzlyScreenshot('skipped-test', Buffer.from('data'));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should handle connection refused gracefully', async () => {
    let error = new Error('fetch failed');
    error.code = 'ECONNREFUSED';
    global.fetch = vi.fn().mockRejectedValue(error);

    const { vizzlyScreenshot, getVizzlyInfo } = await import(
      '../../src/client/index.js'
    );

    let result = await vizzlyScreenshot('connection-test', Buffer.from('data'));

    // Should return null (not throw)
    expect(result).toBeNull();

    // Client should be disabled
    let info = getVizzlyInfo();
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
    let result = await vizzlyScreenshot(
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
});
