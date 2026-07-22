import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  comparisonsCommand,
  validateComparisonsOptions,
} from '../../src/commands/comparisons.js';

/**
 * Create mock output object that tracks calls
 */
function createMockOutput() {
  let calls = [];
  return {
    calls,
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    error: (msg, err) => calls.push({ method: 'error', args: [msg, err] }),
    startSpinner: msg => calls.push({ method: 'startSpinner', args: [msg] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    header: (cmd, mode) => calls.push({ method: 'header', args: [cmd, mode] }),
    print: msg => calls.push({ method: 'print', args: [msg] }),
    blank: () => calls.push({ method: 'blank', args: [] }),
    hint: msg => calls.push({ method: 'hint', args: [msg] }),
    labelValue: (label, value) =>
      calls.push({ method: 'labelValue', args: [label, value] }),
    keyValue: (data, opts) =>
      calls.push({ method: 'keyValue', args: [data, opts] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
    data: obj => calls.push({ method: 'data', args: [obj] }),
    getColors: () => ({
      bold: s => s,
      dim: s => s,
      brand: {
        success: s => s,
        warning: s => s,
        error: s => s,
        info: s => s,
      },
    }),
  };
}

describe('commands/comparisons', () => {
  describe('validateComparisonsOptions', () => {
    it('returns no errors for valid options', () => {
      let errors = validateComparisonsOptions({ limit: 50, offset: 0 });
      assert.deepStrictEqual(errors, []);
    });

    it('returns error for invalid limit', () => {
      let errors = validateComparisonsOptions({ limit: 500 });
      assert.ok(
        errors.includes('--limit must be an integer between 1 and 250')
      );
    });

    it('returns error for malformed and decimal limits', () => {
      assert.ok(
        validateComparisonsOptions({ limit: Number('20abc') }).includes(
          '--limit must be an integer between 1 and 250'
        )
      );
      assert.ok(
        validateComparisonsOptions({ limit: 20.5 }).includes(
          '--limit must be an integer between 1 and 250'
        )
      );
    });

    it('returns error for negative offset', () => {
      let errors = validateComparisonsOptions({ offset: -1 });
      assert.ok(errors.includes('--offset must be a non-negative integer'));
    });

    it('returns error for malformed and decimal offsets', () => {
      assert.ok(
        validateComparisonsOptions({ offset: Number('1abc') }).includes(
          '--offset must be a non-negative integer'
        )
      );
      assert.ok(
        validateComparisonsOptions({ offset: 1.5 }).includes(
          '--offset must be a non-negative integer'
        )
      );
    });
  });

  describe('comparisonsCommand', () => {
    it('requires API token', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await comparisonsCommand(
        { build: 'test' },
        {},
        {
          loadConfig: async () => ({}),
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      assert.ok(output.calls.some(c => c.method === 'error'));
    });

    it('requires build, id, or name option', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await comparisonsCommand(
        {},
        {},
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      assert.ok(
        output.calls.some(
          c => c.method === 'error' && c.args[0].includes('--build')
        )
      );
    });

    it('fetches comparisons for build with JSON output', async () => {
      let output = createMockOutput();
      let mockBuild = {
        id: 'build-1',
        name: 'Build 1',
        comparisons: [
          { id: 'comp-1', name: 'button-primary', status: 'identical' },
          { id: 'comp-2', name: 'button-secondary', status: 'changed' },
        ],
      };

      await comparisonsCommand(
        { build: 'build-1' },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'test-token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuild: async () => ({ build: mockBuild }),
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].buildId, 'build-1');
      assert.strictEqual(dataCall.args[0].comparisons.length, 2);
      assert.strictEqual(dataCall.args[0].summary.passed, 1);
      assert.strictEqual(dataCall.args[0].summary.failed, 1);
    });

    it('preserves existing JSON fields while exposing current comparison evidence', async () => {
      let output = createMockOutput();
      let mockBuild = {
        id: 'build-1',
        name: 'Build 1',
        comparisons: [
          {
            id: 'comp-1',
            screenshot_name: 'checkout',
            status: 'completed',
            result: 'changed',
            diff_percentage: 0.025,
            approval_status: 'approved',
            visual_review: { state: 'pending', decision: null },
            current_browser: 'chromium',
            current_viewport_width: 1440,
            current_viewport_height: 900,
            baseline_original_url: 'https://cdn.test/baseline.png',
            current_original_url: 'https://cdn.test/current.png',
            diff_image_url: 'https://cdn.test/diff.png',
            analysis_projection: {
              clusters: { count: 3, average_density: 0.81 },
            },
            fingerprint_hash: 'fp-checkout',
          },
        ],
      };

      await comparisonsCommand(
        { build: 'build-1' },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'test-token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuild: async () => ({ build: mockBuild }),
          output,
          exit: () => {},
        }
      );

      let data = output.calls.find(call => call.method === 'data').args[0];
      let comparison = data.comparisons[0];

      assert.strictEqual(data.summary.failed, 1);
      assert.strictEqual(comparison.id, 'comp-1');
      assert.strictEqual(comparison.name, 'checkout');
      assert.strictEqual(comparison.status, 'completed');
      assert.strictEqual(comparison.result, 'changed');
      assert.strictEqual(comparison.approvalStatus, 'approved');
      assert.strictEqual(comparison.reviewState, 'pending');
      assert.deepStrictEqual(comparison.visualReview, {
        state: 'pending',
        decision: null,
      });
      assert.strictEqual(comparison.browser, 'chromium');
      assert.deepStrictEqual(comparison.viewport, {
        width: 1440,
        height: 900,
      });
      assert.deepStrictEqual(comparison.urls, {
        baseline: 'https://cdn.test/baseline.png',
        current: 'https://cdn.test/current.png',
        diff: 'https://cdn.test/diff.png',
      });
      assert.strictEqual(comparison.honeydiff.fingerprintHash, 'fp-checkout');
      assert.strictEqual(comparison.honeydiff.regionCount, 3);
      assert.deepStrictEqual(comparison.honeydiff.projection, {
        clusters: { count: 3, average_density: 0.81 },
      });
    });

    it('passes include as a string to getBuild, not an object', async () => {
      let output = createMockOutput();
      let capturedInclude = null;

      await comparisonsCommand(
        { build: 'build-1' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getBuild: async (_client, _buildId, include) => {
            capturedInclude = include;
            return { build: { id: 'build-1', comparisons: [] } };
          },
          output,
          exit: () => {},
        }
      );

      assert.strictEqual(capturedInclude, 'comparisons');
    });

    it('searches comparisons by name', async () => {
      let output = createMockOutput();
      let capturedName = null;
      let mockComparisons = [
        {
          id: 'comp-1',
          name: 'button-primary',
          status: 'identical',
          build_id: 'b1',
        },
      ];

      await comparisonsCommand(
        { name: 'button-*' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          searchComparisons: async (_client, name) => {
            capturedName = name;
            return {
              comparisons: mockComparisons,
              pagination: { total: 1, hasMore: false },
            };
          },
          output,
          exit: () => {},
        }
      );

      assert.strictEqual(capturedName, 'button-*');
      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].comparisons.length, 1);
    });

    it('filters comparisons by status', async () => {
      let output = createMockOutput();
      let mockBuild = {
        id: 'build-1',
        name: 'Build 1',
        comparisons: [
          { id: 'comp-1', name: 'button-primary', status: 'identical' },
          { id: 'comp-2', name: 'button-secondary', status: 'changed' },
          { id: 'comp-3', name: 'button-tertiary', status: 'identical' },
        ],
      };

      await comparisonsCommand(
        { build: 'build-1', status: 'changed' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getBuild: async () => ({ build: mockBuild }),
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      // Only the 'changed' comparison should be returned
      assert.strictEqual(dataCall.args[0].comparisons.length, 1);
      assert.strictEqual(
        dataCall.args[0].comparisons[0].name,
        'button-secondary'
      );
    });

    it('filters current comparisons by visual result rather than processing status', async () => {
      let output = createMockOutput();
      let mockBuild = {
        id: 'build-1',
        comparisons: [
          { id: 'comp-1', status: 'completed', result: 'identical' },
          { id: 'comp-2', status: 'completed', result: 'changed' },
        ],
      };

      await comparisonsCommand(
        { build: 'build-1', status: 'changed' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getBuild: async () => ({ build: mockBuild }),
          output,
          exit: () => {},
        }
      );

      let comparisons = output.calls.find(call => call.method === 'data')
        .args[0].comparisons;
      assert.deepStrictEqual(
        comparisons.map(comparison => comparison.id),
        ['comp-2']
      );
    });

    it('filters build comparisons with literal regex characters in names', async () => {
      let output = createMockOutput();
      let mockBuild = {
        id: 'build-1',
        name: 'Build 1',
        comparisons: [
          { id: 'comp-1', name: 'card[primary].png', status: 'changed' },
          { id: 'comp-2', name: 'cardp.png', status: 'changed' },
        ],
      };

      await comparisonsCommand(
        { build: 'build-1', name: 'card[primary].png' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getBuild: async () => ({ build: mockBuild }),
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.deepStrictEqual(
        dataCall.args[0].comparisons.map(comparison => comparison.name),
        ['card[primary].png']
      );
    });

    it('passes project filter to search', async () => {
      let output = createMockOutput();
      let capturedFilters = null;

      await comparisonsCommand(
        { name: 'button-*', project: 'my-project' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          searchComparisons: async (_client, _name, filters) => {
            capturedFilters = filters;
            return {
              comparisons: [],
              pagination: { total: 0, hasMore: false },
            };
          },
          output,
          exit: () => {},
        }
      );

      assert.strictEqual(capturedFilters.project, 'my-project');
    });

    it('passes organization filter to search', async () => {
      let output = createMockOutput();
      let capturedFilters = null;

      await comparisonsCommand(
        { name: 'button-*', project: 'storybook', org: 'my-org' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          searchComparisons: async (_client, _name, filters) => {
            capturedFilters = filters;
            return {
              comparisons: [],
              pagination: { total: 0, hasMore: false },
            };
          },
          output,
          exit: () => {},
        }
      );

      assert.strictEqual(capturedFilters.project, 'storybook');
      assert.strictEqual(capturedFilters.organization, 'my-org');
    });

    it('fetches single comparison by ID', async () => {
      let output = createMockOutput();
      let mockComparison = {
        id: 'comp-1',
        name: 'button-primary',
        status: 'changed',
        diff_percentage: 0.05,
      };

      await comparisonsCommand(
        { id: 'comp-1' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getComparison: async () => mockComparison,
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].id, 'comp-1');
      assert.strictEqual(dataCall.args[0].name, 'button-primary');
    });

    it('shows the visual result and canonical review state for current comparisons', async () => {
      let output = createMockOutput();

      await comparisonsCommand(
        { id: 'comp-1' },
        {},
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getComparison: async () => ({
            id: 'comp-1',
            screenshot_name: 'checkout',
            status: 'completed',
            result: 'changed',
            visual_review: { state: 'pending' },
            current_browser: 'chromium',
            current_viewport_width: 1440,
            current_viewport_height: 900,
          }),
          output,
          exit: () => {},
        }
      );

      let header = output.calls.find(call => call.method === 'header');
      let details = output.calls.find(call => call.method === 'keyValue');
      let viewport = output.calls.find(
        call => call.method === 'labelValue' && call.args[0] === 'Viewport'
      );

      assert.deepStrictEqual(header.args, ['comparison', 'changed']);
      assert.deepStrictEqual(details.args[0], {
        Name: 'checkout',
        Status: 'CHANGED',
        'Diff %': 'N/A',
        Review: 'pending',
      });
      assert.strictEqual(viewport.args[1], '1440×900');
    });

    it('includes honeydiff data in JSON output for single comparison', async () => {
      let output = createMockOutput();
      let mockComparison = {
        id: 'comp-1',
        name: 'button-primary',
        status: 'changed',
        diff_percentage: 0.025,
        cluster_metadata: {
          classification: 'minor',
          density: 0.05,
          distribution: 'localized',
        },
        ssim_score: 0.9876,
        gmsd_score: 0.0123,
        fingerprint_hash: 'abc123def456',
        diff_regions: [{ x: 10, y: 20, width: 50, height: 30 }],
        diff_lines: [20, 30, 40],
        fingerprint_data: { hash_components: [1, 2, 3] },
      };

      await comparisonsCommand(
        { id: 'comp-1' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getComparison: async () => mockComparison,
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      let result = dataCall.args[0];
      assert.ok(result.honeydiff, 'Should include honeydiff data');
      assert.strictEqual(result.honeydiff.ssimScore, 0.9876);
      assert.strictEqual(result.honeydiff.gmsdScore, 0.0123);
      assert.strictEqual(result.honeydiff.clusterClassification, 'minor');
      assert.strictEqual(result.honeydiff.fingerprintHash, 'abc123def456');
      assert.deepStrictEqual(result.honeydiff.diffRegions, [
        { x: 10, y: 20, width: 50, height: 30 },
      ]);
      assert.strictEqual(result.honeydiff.regionCount, 1);
      assert.deepStrictEqual(result.honeydiff.diffLines, [20, 30, 40]);
    });

    it('includes honeydiff data from search results (nested in diff_image)', async () => {
      let output = createMockOutput();
      let mockComparisons = [
        {
          id: 'comp-1',
          name: 'button-primary',
          status: 'changed',
          build_id: 'b1',
          diff_image: {
            url: 'https://example.com/diff.png',
            cluster_metadata: {
              classification: 'dynamic_content',
              density: 0.12,
            },
            ssim_score: 0.9521,
            gmsd_score: 0.0345,
            fingerprint_hash: 'search-hash-789',
          },
        },
      ];

      await comparisonsCommand(
        { name: 'button-*' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          searchComparisons: async () => ({
            comparisons: mockComparisons,
            pagination: { total: 1, hasMore: false },
          }),
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      let result = dataCall.args[0].comparisons[0];
      assert.ok(result.honeydiff, 'Should include honeydiff data');
      assert.strictEqual(result.honeydiff.ssimScore, 0.9521);
      assert.strictEqual(result.honeydiff.gmsdScore, 0.0345);
      assert.strictEqual(
        result.honeydiff.clusterClassification,
        'dynamic_content'
      );
      assert.strictEqual(result.honeydiff.fingerprintHash, 'search-hash-789');
    });

    it('sets honeydiff to null when no analysis data present', async () => {
      let output = createMockOutput();
      let mockComparison = {
        id: 'comp-1',
        name: 'button-primary',
        status: 'identical',
      };

      await comparisonsCommand(
        { id: 'comp-1' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getComparison: async () => mockComparison,
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].honeydiff, null);
    });

    it('resolves URLs from flat field names (single comparison endpoint)', async () => {
      let output = createMockOutput();
      let mockComparison = {
        id: 'comp-1',
        name: 'button-primary',
        status: 'changed',
        baseline_screenshot_url: 'https://cdn.example.com/baseline.png',
        current_screenshot_url: 'https://cdn.example.com/current.png',
        diff_url: 'https://cdn.example.com/diff.png',
      };

      await comparisonsCommand(
        { id: 'comp-1' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getComparison: async () => mockComparison,
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      let urls = dataCall.args[0].urls;
      assert.strictEqual(urls.baseline, 'https://cdn.example.com/baseline.png');
      assert.strictEqual(urls.current, 'https://cdn.example.com/current.png');
      assert.strictEqual(urls.diff, 'https://cdn.example.com/diff.png');
    });

    it('resolves URLs from build detail field names (diff_image_url)', async () => {
      let output = createMockOutput();
      let mockBuild = {
        id: 'build-1',
        name: 'Build 1',
        comparisons: [
          {
            id: 'comp-1',
            name: 'button-primary',
            status: 'changed',
            diff_image_url: 'https://cdn.example.com/diff.png',
            baseline_original_url: 'https://cdn.example.com/baseline.png',
            current_original_url: 'https://cdn.example.com/current.png',
          },
        ],
      };

      await comparisonsCommand(
        { build: 'build-1' },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getBuild: async () => ({ build: mockBuild }),
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      let urls = dataCall.args[0].comparisons[0].urls;
      assert.strictEqual(urls.diff, 'https://cdn.example.com/diff.png');
      assert.strictEqual(urls.baseline, 'https://cdn.example.com/baseline.png');
      assert.strictEqual(urls.current, 'https://cdn.example.com/current.png');
    });

    it('shows honeydiff analysis in verbose display', async () => {
      let output = createMockOutput();
      let mockComparison = {
        id: 'comp-1',
        name: 'button-primary',
        status: 'changed',
        diff_percentage: 0.025,
        cluster_metadata: { classification: 'minor' },
        ssim_score: 0.9876,
        gmsd_score: 0.0123,
        fingerprint_hash: 'abc123',
      };

      await comparisonsCommand(
        { id: 'comp-1' },
        { verbose: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getComparison: async () => mockComparison,
          output,
          exit: () => {},
        }
      );

      let labelValues = output.calls
        .filter(c => c.method === 'labelValue')
        .map(c => c.args);
      assert.ok(
        labelValues.some(([label]) => label === 'Classification'),
        'Should show classification'
      );
      assert.ok(
        labelValues.some(([label]) => label === 'SSIM'),
        'Should show SSIM score'
      );
      assert.ok(
        labelValues.some(([label]) => label === 'GMSD'),
        'Should show GMSD score'
      );
      assert.ok(
        labelValues.some(([label]) => label === 'Fingerprint'),
        'Should show fingerprint'
      );
    });
  });
});
