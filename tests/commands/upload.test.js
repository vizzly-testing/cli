import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  constructBuildUrl,
  uploadCommand,
  validateUploadOptions,
} from '../../src/commands/upload.js';

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
    progress: (msg, cur, tot) =>
      calls.push({ method: 'progress', args: [msg, cur, tot] }),
    startSpinner: msg => calls.push({ method: 'startSpinner', args: [msg] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
    // TUI helpers
    complete: (msg, opts) =>
      calls.push({ method: 'complete', args: [msg, opts] }),
    keyValue: (data, opts) =>
      calls.push({ method: 'keyValue', args: [data, opts] }),
    labelValue: (label, value, opts) =>
      calls.push({ method: 'labelValue', args: [label, value, opts] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
    print: msg => calls.push({ method: 'print', args: [msg] }),
    link: (_label, url) => url, // Return the URL for testing
    getColors: () => ({
      brand: {
        success: s => s,
        danger: s => s,
      },
    }),
  };
}

describe('validateUploadOptions', () => {
  describe('screenshots path validation', () => {
    it('should pass with valid screenshots path', () => {
      let errors = validateUploadOptions('./screenshots', {});
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with missing screenshots path', () => {
      let errors = validateUploadOptions(null, {});
      assert.ok(errors.includes('Screenshots path is required'));
    });

    it('should fail with empty screenshots path', () => {
      let errors = validateUploadOptions('', {});
      assert.ok(errors.includes('Screenshots path is required'));
    });
  });

  describe('metadata validation', () => {
    it('should pass with valid JSON metadata', () => {
      let errors = validateUploadOptions('./screenshots', {
        metadata: '{"version": "1.0.0"}',
      });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid JSON metadata', () => {
      let errors = validateUploadOptions('./screenshots', {
        metadata: 'invalid-json',
      });
      assert.ok(errors.includes('Invalid JSON in --metadata option'));
    });

    it('should pass when metadata is not provided', () => {
      let errors = validateUploadOptions('./screenshots', {});
      assert.strictEqual(errors.length, 0);
    });
  });

  describe('threshold validation', () => {
    it('should pass with valid threshold', () => {
      let errors = validateUploadOptions('./screenshots', {
        threshold: '0.1',
      });
      assert.strictEqual(errors.length, 0);
    });

    it('should pass with threshold of 0', () => {
      let errors = validateUploadOptions('./screenshots', { threshold: '0' });
      assert.strictEqual(errors.length, 0);
    });

    it('should pass with threshold of 1', () => {
      let errors = validateUploadOptions('./screenshots', { threshold: '1' });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid threshold', () => {
      let errors = validateUploadOptions('./screenshots', {
        threshold: 'invalid',
      });
      assert.ok(
        errors.includes(
          'Threshold must be a non-negative number (CIEDE2000 Delta E)'
        )
      );
    });

    it('should fail with threshold below 0', () => {
      let errors = validateUploadOptions('./screenshots', {
        threshold: '-0.1',
      });
      assert.ok(
        errors.includes(
          'Threshold must be a non-negative number (CIEDE2000 Delta E)'
        )
      );
    });

    it('should pass with threshold above 1 (CIEDE2000 allows values > 1)', () => {
      let errors = validateUploadOptions('./screenshots', {
        threshold: '2.0',
      });
      assert.strictEqual(errors.length, 0);
    });
  });

  describe('batch size validation', () => {
    it('should pass with valid batch size', () => {
      let errors = validateUploadOptions('./screenshots', {
        batchSize: '10',
      });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid batch size', () => {
      let errors = validateUploadOptions('./screenshots', {
        batchSize: 'invalid',
      });
      assert.ok(errors.includes('Batch size must be a positive integer'));
    });

    it('should fail with zero batch size', () => {
      let errors = validateUploadOptions('./screenshots', { batchSize: '0' });
      assert.ok(errors.includes('Batch size must be a positive integer'));
    });

    it('should fail with negative batch size', () => {
      let errors = validateUploadOptions('./screenshots', {
        batchSize: '-5',
      });
      assert.ok(errors.includes('Batch size must be a positive integer'));
    });
  });

  describe('upload timeout validation', () => {
    it('should pass with valid upload timeout', () => {
      let errors = validateUploadOptions('./screenshots', {
        uploadTimeout: '30000',
      });
      assert.strictEqual(errors.length, 0);
    });

    it('should fail with invalid upload timeout', () => {
      let errors = validateUploadOptions('./screenshots', {
        uploadTimeout: 'invalid',
      });
      assert.ok(
        errors.includes(
          'Upload timeout must be a positive integer (milliseconds)'
        )
      );
    });

    it('should fail with zero upload timeout', () => {
      let errors = validateUploadOptions('./screenshots', {
        uploadTimeout: '0',
      });
      assert.ok(
        errors.includes(
          'Upload timeout must be a positive integer (milliseconds)'
        )
      );
    });
  });

  describe('multiple validation errors', () => {
    it('should return all validation errors', () => {
      let errors = validateUploadOptions(null, {
        metadata: 'invalid-json',
        threshold: '-1',
        batchSize: '-1',
        uploadTimeout: '0',
      });

      assert.strictEqual(errors.length, 5);
      assert.ok(errors.includes('Screenshots path is required'));
      assert.ok(errors.includes('Invalid JSON in --metadata option'));
      assert.ok(
        errors.includes(
          'Threshold must be a non-negative number (CIEDE2000 Delta E)'
        )
      );
      assert.ok(errors.includes('Batch size must be a positive integer'));
      assert.ok(
        errors.includes(
          'Upload timeout must be a positive integer (milliseconds)'
        )
      );
    });
  });
});

describe('constructBuildUrl', () => {
  it('returns URL with org/project when context is available', async () => {
    let url = await constructBuildUrl(
      'build-123',
      'https://app.vizzly.dev/api',
      'test-token',
      {
        createApiClient: () => ({}),
        getTokenContext: async () => ({
          organization: { slug: 'my-org' },
          project: { slug: 'my-project' },
        }),
        output: createMockOutput(),
      }
    );

    assert.strictEqual(
      url,
      'https://app.vizzly.dev/my-org/my-project/builds/build-123'
    );
  });

  it('returns fallback URL when context fetch fails', async () => {
    let output = createMockOutput();

    let url = await constructBuildUrl(
      'build-123',
      'https://app.vizzly.dev/api',
      'test-token',
      {
        createApiClient: () => ({}),
        getTokenContext: async () => {
          throw new Error('Failed');
        },
        output,
      }
    );

    assert.strictEqual(url, 'https://app.vizzly.dev/builds/build-123');
    assert.ok(output.calls.some(c => c.method === 'debug'));
  });

  it('returns fallback URL when context missing org/project', async () => {
    let url = await constructBuildUrl(
      'build-123',
      'https://app.vizzly.dev/api',
      'test-token',
      {
        createApiClient: () => ({}),
        getTokenContext: async () => ({}),
        output: createMockOutput(),
      }
    );

    assert.strictEqual(url, 'https://app.vizzly.dev/builds/build-123');
  });

  it('strips /api from base URL', async () => {
    let url = await constructBuildUrl(
      'build-123',
      'https://custom.example.com/api/v1',
      'test-token',
      {
        createApiClient: () => ({}),
        getTokenContext: async () => ({}),
        output: createMockOutput(),
      }
    );

    assert.strictEqual(url, 'https://custom.example.com/builds/build-123');
  });
});

describe('uploadCommand', () => {
  it('returns error when no API key', async () => {
    let output = createMockOutput();
    let exitCode = null;

    let result = await uploadCommand(
      './screenshots',
      {},
      {},
      {
        loadConfig: async () => ({
          apiKey: null,
          apiUrl: 'https://api.test',
          build: { environment: 'test' },
          comparison: { threshold: 2.0 },
        }),
        output,
        exit: code => {
          exitCode = code;
        },
      }
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'no-api-key');
    assert.strictEqual(exitCode, 1);
  });

  it('uploads screenshots and finalizes build', async () => {
    let output = createMockOutput();
    let uploadCalled = false;
    let finalizeCalled = false;
    let finalizeSuccess = null;

    let result = await uploadCommand(
      './screenshots',
      {},
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
          build: { environment: 'test' },
          comparison: { threshold: 2.0 },
        }),
        detectBranch: async () => 'main',
        detectCommit: async () => 'abc123',
        detectCommitMessage: async () => 'Test commit',
        detectPullRequestNumber: () => null,
        generateBuildNameWithGit: async () => 'Test Build',
        createUploader: () => ({
          upload: async () => {
            uploadCalled = true;
            return {
              buildId: 'build-123',
              stats: { uploaded: 5, total: 5 },
            };
          },
        }),
        createApiClient: () => ({}),
        finalizeBuild: async (_client, _buildId, success) => {
          finalizeCalled = true;
          finalizeSuccess = success;
        },
        buildUrlConstructor: async () =>
          'https://app.vizzly.dev/builds/build-123',
        output,
        exit: () => {},
      }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(uploadCalled, true);
    assert.strictEqual(finalizeCalled, true);
    assert.strictEqual(finalizeSuccess, true);
    // Now uses output.complete() instead of output.success()
    assert.ok(output.calls.some(c => c.method === 'complete'));
  });

  it('handles upload errors and marks build as failed', async () => {
    let output = createMockOutput();
    let exitCode = null;
    let finalizeSuccess = null;

    let result = await uploadCommand(
      './screenshots',
      {},
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
          build: { environment: 'test' },
          comparison: { threshold: 2.0 },
        }),
        detectBranch: async () => 'main',
        detectCommit: async () => 'abc123',
        detectCommitMessage: async () => 'Test commit',
        detectPullRequestNumber: () => null,
        generateBuildNameWithGit: async () => 'Test Build',
        createUploader: () => ({
          upload: async opts => {
            // Simulate progress callback that sets buildId
            if (opts.onProgress) {
              opts.onProgress({ buildId: 'build-123' });
            }
            throw new Error('Upload failed');
          },
        }),
        createApiClient: () => ({}),
        finalizeBuild: async (_client, _buildId, success) => {
          finalizeSuccess = success;
        },
        output,
        exit: code => {
          exitCode = code;
        },
      }
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(exitCode, 1);
    assert.strictEqual(finalizeSuccess, false);
  });

  it('waits for build completion when wait option is set', async () => {
    let output = createMockOutput();
    let waitForBuildCalled = false;

    let result = await uploadCommand(
      './screenshots',
      { wait: true },
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
          build: { environment: 'test' },
          comparison: { threshold: 2.0 },
        }),
        detectBranch: async () => 'main',
        detectCommit: async () => 'abc123',
        detectCommitMessage: async () => 'Test commit',
        detectPullRequestNumber: () => null,
        generateBuildNameWithGit: async () => 'Test Build',
        createUploader: () => ({
          upload: async () => ({
            buildId: 'build-123',
            stats: { uploaded: 5, total: 5 },
          }),
          waitForBuild: async () => {
            waitForBuildCalled = true;
            return { passedComparisons: 5, failedComparisons: 0 };
          },
        }),
        createApiClient: () => ({}),
        finalizeBuild: async () => {},
        buildUrlConstructor: async () =>
          'https://app.vizzly.dev/builds/build-123',
        output,
        exit: () => {},
      }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(waitForBuildCalled, true);
  });

  it('shows warning when wait returns failed comparisons', async () => {
    let output = createMockOutput();

    await uploadCommand(
      './screenshots',
      { wait: true },
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
          build: { environment: 'test' },
          comparison: { threshold: 2.0 },
        }),
        detectBranch: async () => 'main',
        detectCommit: async () => 'abc123',
        detectCommitMessage: async () => 'Test commit',
        detectPullRequestNumber: () => null,
        generateBuildNameWithGit: async () => 'Test Build',
        createUploader: () => ({
          upload: async () => ({
            buildId: 'build-123',
            stats: { uploaded: 5, total: 5 },
          }),
          waitForBuild: async () => ({
            passedComparisons: 3,
            failedComparisons: 2,
          }),
        }),
        createApiClient: () => ({}),
        finalizeBuild: async () => {},
        buildUrlConstructor: async () =>
          'https://app.vizzly.dev/builds/build-123',
        output,
        exit: () => {},
      }
    );

    // Now uses output.print() with styled text instead of warn
    assert.ok(
      output.calls.some(
        c => c.method === 'print' && c.args[0].includes('failed')
      )
    );
  });

  it('handles finalize error gracefully', async () => {
    let output = createMockOutput();

    let result = await uploadCommand(
      './screenshots',
      {},
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
          build: { environment: 'test' },
          comparison: { threshold: 2.0 },
        }),
        detectBranch: async () => 'main',
        detectCommit: async () => 'abc123',
        detectCommitMessage: async () => 'Test commit',
        detectPullRequestNumber: () => null,
        generateBuildNameWithGit: async () => 'Test Build',
        createUploader: () => ({
          upload: async () => ({
            buildId: 'build-123',
            stats: { uploaded: 5, total: 5 },
          }),
        }),
        createApiClient: () => ({}),
        finalizeBuild: async () => {
          throw new Error('Finalize failed');
        },
        buildUrlConstructor: async () =>
          'https://app.vizzly.dev/builds/build-123',
        output,
        exit: () => {},
      }
    );

    // Should still succeed since upload completed
    assert.strictEqual(result.success, true);
    // Should show warning about finalize failure
    assert.ok(output.calls.some(c => c.method === 'warn'));
  });

  it('uses result.url when provided', async () => {
    let output = createMockOutput();

    await uploadCommand(
      './screenshots',
      {},
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
          build: { environment: 'test' },
          comparison: { threshold: 2.0 },
        }),
        detectBranch: async () => 'main',
        detectCommit: async () => 'abc123',
        detectCommitMessage: async () => 'Test commit',
        detectPullRequestNumber: () => null,
        generateBuildNameWithGit: async () => 'Test Build',
        createUploader: () => ({
          upload: async () => ({
            buildId: 'build-123',
            url: 'https://custom.url/build',
            stats: { uploaded: 5, total: 5 },
          }),
        }),
        createApiClient: () => ({}),
        finalizeBuild: async () => {},
        buildUrlConstructor: async () => {
          throw new Error('Should not be called');
        },
        output,
        exit: () => {},
      }
    );

    // Check that the custom URL was used (now via labelValue)
    assert.ok(
      output.calls.some(
        c =>
          c.method === 'labelValue' && c.args[1] === 'https://custom.url/build'
      )
    );
  });

  it('shows verbose output when verbose flag is set', async () => {
    let output = createMockOutput();

    await uploadCommand(
      './screenshots',
      {},
      { verbose: true },
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
          build: { environment: 'test', name: 'Test' },
          comparison: { threshold: 2.0 },
        }),
        detectBranch: async () => 'main',
        detectCommit: async () => 'abc123',
        detectCommitMessage: async () => 'Test commit',
        detectPullRequestNumber: () => null,
        generateBuildNameWithGit: async () => 'Test Build',
        createUploader: () => ({
          upload: async () => ({
            buildId: 'build-123',
            stats: { uploaded: 5, total: 5 },
          }),
        }),
        createApiClient: () => ({}),
        finalizeBuild: async () => {},
        buildUrlConstructor: async () =>
          'https://app.vizzly.dev/builds/build-123',
        output,
        exit: () => {},
      }
    );

    assert.ok(output.calls.some(c => c.method === 'debug'));
  });

  it('does not fail CI when API returns 5xx error', async () => {
    let output = createMockOutput();
    let exitCode = null;

    let apiError = new Error('API request failed: 503 - Service Unavailable');
    apiError.context = { status: 503 };

    let result = await uploadCommand(
      './screenshots',
      {},
      {},
      {
        loadConfig: async () => ({
          apiKey: 'test-token',
          apiUrl: 'https://api.test',
          build: { environment: 'test' },
          comparison: { threshold: 2.0 },
        }),
        detectBranch: async () => 'main',
        detectCommit: async () => 'abc123',
        detectCommitMessage: async () => 'Test commit',
        detectPullRequestNumber: () => null,
        generateBuildNameWithGit: async () => 'Test Build',
        createUploader: () => ({
          upload: async () => {
            throw apiError;
          },
        }),
        createApiClient: () => ({}),
        finalizeBuild: async () => {},
        output,
        exit: code => {
          exitCode = code;
        },
      }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result.skipped, true);
    assert.strictEqual(exitCode, null);
    assert.ok(
      output.calls.some(
        c => c.method === 'warn' && c.args[0].includes('API unavailable')
      )
    );
  });
});
