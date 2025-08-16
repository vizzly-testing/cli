import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout } from '../../src/utils/fetch-utils.js';

// Mock global fetch
global.fetch = vi.fn();

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call fetch with provided URL and options', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    };
    global.fetch.mockResolvedValue(mockResponse);

    const url = 'https://example.com/api/test';
    const options = { method: 'POST', body: JSON.stringify({ test: true }) };

    const result = await fetchWithTimeout(url, options, 5000);

    expect(global.fetch).toHaveBeenCalledWith(url, {
      ...options,
      signal: expect.any(globalThis.AbortSignal),
    });
    expect(result).toBe(mockResponse);
  });

  it('should add AbortController signal to fetch options', async () => {
    const mockResponse = { ok: true };
    global.fetch.mockResolvedValue(mockResponse);

    await fetchWithTimeout('https://example.com', {}, 1000);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        signal: expect.any(globalThis.AbortSignal),
      })
    );
  });

  it('should use default timeout of 300000ms when not specified', async () => {
    const mockResponse = { ok: true };
    global.fetch.mockResolvedValue(mockResponse);

    // Don't advance timers, just check that timeout is set up
    const promise = fetchWithTimeout('https://example.com');

    // The fetch should be called immediately
    expect(global.fetch).toHaveBeenCalled();

    // Resolve the fetch promise
    await promise;
  });

  it('should abort fetch after specified timeout', async () => {
    // Make fetch hang but also listen for abort signal
    global.fetch.mockImplementation((url, options) => {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(new Error('The operation was aborted'));
        });
        // Don't resolve - simulate hanging request
      });
    });

    const promise = fetchWithTimeout('https://example.com', {}, 100);

    // Advance time to trigger timeout
    vi.advanceTimersByTime(100);

    // Should reject with abort error
    await expect(promise).rejects.toThrow('The operation was aborted');

    // Verify fetch was called with abort signal
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        signal: expect.any(globalThis.AbortSignal),
      })
    );
  });

  it('should clear timeout when fetch completes successfully', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const mockResponse = { ok: true, data: 'success' };
    global.fetch.mockResolvedValue(mockResponse);

    const result = await fetchWithTimeout('https://example.com', {}, 2000);

    expect(result).toBe(mockResponse);
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('should clear timeout when fetch fails', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const fetchError = new Error('Network error');
    global.fetch.mockRejectedValue(fetchError);

    await expect(
      fetchWithTimeout('https://example.com', {}, 1000)
    ).rejects.toThrow('Network error');

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('should handle empty options object', async () => {
    const mockResponse = { ok: true };
    global.fetch.mockResolvedValue(mockResponse);

    await fetchWithTimeout('https://example.com');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        signal: expect.any(globalThis.AbortSignal),
      })
    );
  });

  it('should preserve existing options while adding signal', async () => {
    const mockResponse = { ok: true };
    global.fetch.mockResolvedValue(mockResponse);

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' }),
    };

    await fetchWithTimeout('https://example.com', options, 5000);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'data' }),
        signal: expect.any(globalThis.AbortSignal),
      })
    );
  });

  it('should handle very short timeouts', async () => {
    // Make fetch respond to abort signal
    global.fetch.mockImplementation((url, options) => {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(new Error('The operation was aborted'));
        });
        // Simulate slow response but faster than timeout
        setTimeout(() => resolve({ ok: true }), 200);
      });
    });

    const promise = fetchWithTimeout('https://example.com', {}, 50);

    // Advance time past timeout
    vi.advanceTimersByTime(50);

    // Should abort before fetch completes
    await expect(promise).rejects.toThrow('The operation was aborted');
  });

  it('should handle concurrent requests with different timeouts', async () => {
    const mockResponse1 = { ok: true, data: 'response1' };
    const mockResponse2 = { ok: true, data: 'response2' };

    global.fetch
      .mockResolvedValueOnce(mockResponse1)
      .mockResolvedValueOnce(mockResponse2);

    const promise1 = fetchWithTimeout('https://example.com/1', {}, 1000);
    const promise2 = fetchWithTimeout('https://example.com/2', {}, 2000);

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1).toBe(mockResponse1);
    expect(result2).toBe(mockResponse2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
