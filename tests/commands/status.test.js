import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createBuildInfo,
  createBuildUrl,
  createComparisonStats,
  createStatusData,
  createStatusSuggestedCommands,
  getProcessingProgress,
  normalizeBuildStatus,
  shouldFailStatus,
  statusCommand,
  validateStatusOptions,
} from '../../src/commands/status.js';

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
    warn: msg => calls.push({ method: 'warn', args: [msg] }),
    success: msg => calls.push({ method: 'success', args: [msg] }),
    data: d => calls.push({ method: 'data', args: [d] }),
    startSpinner: msg => calls.push({ method: 'startSpinner', args: [msg] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
    header: (cmd, mode) => calls.push({ method: 'header', args: [cmd, mode] }),
    keyValue: (data, opts) =>
      calls.push({ method: 'keyValue', args: [data, opts] }),
    labelValue: (label, value, opts) =>
      calls.push({ method: 'labelValue', args: [label, value, opts] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
    hint: msg => calls.push({ method: 'hint', args: [msg] }),
    divider: () => calls.push({ method: 'divider', args: [] }),
    print: msg => calls.push({ method: 'print', args: [msg] }),
    progressBar: () => '████████',
    link: (_label, url) => url,
    getColors: () => ({
      brand: {
        success: s => s,
        danger: s => s,
        warning: s => s,
        info: s => s,
        textMuted: s => s,
      },
    }),
  };
}

function createBuild(overrides = {}) {
  return {
    id: 'build-123',
    status: 'completed',
    name: 'Homepage',
    created_at: '2026-05-18T12:00:00.000Z',
    updated_at: '2026-05-18T12:01:00.000Z',
    completed_at: '2026-05-18T12:02:00.000Z',
    environment: 'ci',
    branch: 'main',
    commit_sha: 'abcdef1234567890',
    commit_message: 'Update homepage',
    screenshot_count: 3,
    total_comparisons: 3,
    new_comparisons: 1,
    changed_comparisons: 1,
    identical_comparisons: 1,
    approval_status: 'pending',
    execution_time_ms: 4250,
    is_baseline: false,
    user_agent: 'vizzly-test',
    project_id: 'project-123',
    failed_jobs: 0,
    ...overrides,
  };
}

function createStatusHarness(build = createBuild(), previewInfo = null) {
  let output = createMockOutput();
  let clientConfig = null;
  let exitCode = null;

  return {
    output,
    get clientConfig() {
      return clientConfig;
    },
    get exitCode() {
      return exitCode;
    },
    deps: {
      loadConfig: async () => ({
        apiKey: 'test-token',
        apiUrl: 'https://api.test/api',
      }),
      createApiClient: config => {
        clientConfig = config;
        return { kind: 'client' };
      },
      getBuild: async () => ({ build }),
      getPreviewInfo: async () => previewInfo,
      getApiUrl: () => 'https://app.test/api',
      output,
      exit: code => {
        exitCode = code;
      },
    },
  };
}

describe('commands/status', () => {
  describe('validateStatusOptions', () => {
    it('returns no errors for valid build ID', () => {
      let errors = validateStatusOptions('build-123');
      assert.deepStrictEqual(errors, []);
    });

    it('returns error for empty build ID', () => {
      let errors = validateStatusOptions('');
      assert.deepStrictEqual(errors, ['Build ID is required']);
    });

    it('returns error for whitespace build ID', () => {
      let errors = validateStatusOptions('   ');
      assert.deepStrictEqual(errors, ['Build ID is required']);
    });
  });

  describe('status helpers', () => {
    it('normalizes wrapped and unwrapped build responses', () => {
      let build = createBuild();

      assert.strictEqual(normalizeBuildStatus({ build }), build);
      assert.strictEqual(normalizeBuildStatus(build), build);
    });

    it('creates JSON status data with preview details', () => {
      let data = createStatusData(createBuild(), {
        preview_url: 'https://preview.test',
        status: 'ready',
        file_count: 12,
        expires_at: '2026-05-19T12:00:00.000Z',
      });

      assert.deepStrictEqual(data, {
        buildId: 'build-123',
        status: 'completed',
        name: 'Homepage',
        createdAt: '2026-05-18T12:00:00.000Z',
        updatedAt: '2026-05-18T12:01:00.000Z',
        completedAt: '2026-05-18T12:02:00.000Z',
        environment: 'ci',
        branch: 'main',
        commit: 'abcdef1234567890',
        commitMessage: 'Update homepage',
        screenshotsTotal: 3,
        comparisonsTotal: 3,
        newComparisons: 1,
        changedComparisons: 1,
        identicalComparisons: 1,
        approvalStatus: 'pending',
        executionTime: 4250,
        isBaseline: false,
        userAgent: 'vizzly-test',
        suggestedCommands: [
          {
            label: 'Review build context',
            command: 'vizzly context build build-123',
          },
          {
            label: 'List comparison details',
            command: 'vizzly comparisons --build build-123',
          },
        ],
        preview: {
          url: 'https://preview.test',
          status: 'ready',
          fileCount: 12,
          expiresAt: '2026-05-19T12:00:00.000Z',
        },
      });
    });

    it('creates human build info and comparison stats', () => {
      let build = createBuild();
      let colors = createMockOutput().getColors();

      assert.deepStrictEqual(createBuildInfo(build), {
        Name: 'Homepage',
        Status: 'COMPLETED',
        Environment: 'ci',
        Branch: 'main',
        Commit: 'abcdef12 - Update homepage',
      });
      assert.strictEqual(
        createComparisonStats(build, colors),
        '1 new · 1 changed · 1 identical'
      );
    });

    it('creates build URLs, progress, and failure status', () => {
      assert.strictEqual(
        createBuildUrl('https://app.test/api', createBuild()),
        'https://app.test/projects/project-123/builds/build-123'
      );
      assert.strictEqual(
        createBuildUrl('https://api.test/api/v1', createBuild()),
        'https://api.test/projects/project-123/builds/build-123'
      );
      assert.strictEqual(createBuildUrl(null, createBuild()), null);
      assert.strictEqual(
        getProcessingProgress(
          createBuild({
            status: 'processing',
            completed_jobs: 2,
            failed_jobs: 1,
            processing_screenshots: 1,
          })
        ),
        75
      );
      assert.strictEqual(getProcessingProgress(createBuild()), null);
      assert.strictEqual(
        shouldFailStatus(createBuild({ status: 'failed' })),
        true
      );
      assert.strictEqual(
        shouldFailStatus(createBuild({ failed_jobs: 1 })),
        true
      );
      assert.strictEqual(shouldFailStatus(createBuild()), false);
    });

    it('creates suggested follow-up commands', () => {
      assert.deepStrictEqual(createStatusSuggestedCommands(createBuild()), [
        {
          label: 'Review build context',
          command: 'vizzly context build build-123',
        },
        {
          label: 'List comparison details',
          command: 'vizzly comparisons --build build-123',
        },
      ]);
    });
  });

  describe('statusCommand', () => {
    it('fetches build and preview data for JSON output', async () => {
      let harness = createStatusHarness(createBuild(), {
        preview_url: 'https://preview.test',
        status: 'ready',
        file_count: 4,
        expires_at: '2026-05-19T12:00:00.000Z',
      });

      await statusCommand('build-123', {}, { json: true }, harness.deps);

      assert.deepStrictEqual(harness.clientConfig, {
        baseUrl: 'https://api.test/api',
        token: 'test-token',
        command: 'status',
      });

      let dataCall = harness.output.calls.find(call => call.method === 'data');
      assert.strictEqual(dataCall.args[0].buildId, 'build-123');
      assert.deepStrictEqual(dataCall.args[0].preview, {
        url: 'https://preview.test',
        status: 'ready',
        fileCount: 4,
        expiresAt: '2026-05-19T12:00:00.000Z',
      });
      assert.ok(harness.output.calls.some(call => call.method === 'cleanup'));
    });

    it('prints human-readable status and exits non-zero for failed builds', async () => {
      let harness = createStatusHarness(
        createBuild({ status: 'failed', failed_jobs: 1 }),
        { preview_url: 'https://preview.test' }
      );

      await statusCommand('build-123', {}, {}, harness.deps);

      assert.strictEqual(harness.exitCode, 1);
      assert.ok(
        harness.output.calls.some(
          call => call.method === 'header' && call.args[1] === 'failed'
        )
      );
      assert.ok(
        harness.output.calls.some(
          call => call.method === 'labelValue' && call.args[0] === 'Preview'
        )
      );
      assert.ok(
        harness.output.calls.some(
          call =>
            call.method === 'print' &&
            call.args[0].includes('vizzly context build build-123')
        )
      );
    });

    it('prints processing progress when jobs are active', async () => {
      let harness = createStatusHarness(
        createBuild({
          status: 'processing',
          completed_jobs: 2,
          failed_jobs: 0,
          processing_screenshots: 2,
        })
      );

      await statusCommand('build-123', {}, {}, harness.deps);

      assert.ok(
        harness.output.calls.some(
          call => call.method === 'print' && call.args[0].includes('50%')
        )
      );
    });

    it('does not render NaN average diff in verbose output', async () => {
      let harness = createStatusHarness(
        createBuild({ avg_diff_percentage: undefined })
      );

      await statusCommand('build-123', {}, { verbose: true }, harness.deps);

      let keyValueCalls = harness.output.calls.filter(
        call => call.method === 'keyValue'
      );
      let verboseInfo = keyValueCalls.at(-1).args[0];
      assert.equal(Object.hasOwn(verboseInfo, 'Avg Diff'), false);
    });

    it('cleans up and exits when no API token is configured', async () => {
      let output = createMockOutput();
      let exitCode = null;

      let result = await statusCommand(
        'build-123',
        {},
        {},
        {
          loadConfig: async () => ({ apiUrl: 'https://api.test' }),
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      assert.deepStrictEqual(result, {
        success: false,
        result: { reason: 'missing_token' },
      });
      assert.ok(output.calls.some(call => call.method === 'cleanup'));
    });

    it('does not fail CI when API returns 5xx error', async () => {
      let output = createMockOutput();
      let exitCode = null;

      let apiError = new Error(
        'API request failed: 500 - Internal Server Error'
      );
      apiError.context = { status: 500 };

      let result = await statusCommand(
        'build-123',
        {},
        {},
        {
          loadConfig: async () => ({
            apiKey: 'test-token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuild: async () => {
            throw apiError;
          },
          getPreviewInfo: async () => null,
          getApiUrl: () => 'https://api.test',
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, null);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.result.skipped, true);
      assert.ok(
        output.calls.some(
          c => c.method === 'warn' && c.args[0].includes('API unavailable')
        )
      );
    });

    it('still fails for 4xx client errors', async () => {
      let output = createMockOutput();
      let exitCode = null;

      let apiError = new Error('API request failed: 404 - Not Found');
      apiError.context = { status: 404 };

      await statusCommand(
        'build-123',
        {},
        {},
        {
          loadConfig: async () => ({
            apiKey: 'test-token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuild: async () => {
            throw apiError;
          },
          getPreviewInfo: async () => null,
          getApiUrl: () => 'https://api.test',
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      assert.ok(output.calls.some(c => c.method === 'error'));
      assert.ok(output.calls.some(c => c.method === 'cleanup'));
    });
  });
});
