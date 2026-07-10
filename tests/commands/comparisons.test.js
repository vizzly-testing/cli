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
      let clientOptions;
      let mockBuild = {
        id: 'build-1',
        name: 'Build 1',
        comparisons: [
          {
            id: 'comp-1',
            name: 'button-primary',
            status: 'completed',
            result: 'identical',
          },
          {
            id: 'comp-2',
            name: 'button-secondary',
            status: 'completed',
            result: 'changed',
          },
          {
            id: 'comp-3',
            name: 'button-new',
            status: 'completed',
            result: 'new',
            current_browser: 'Chromium',
            current_viewport_width: 1920,
            current_viewport_height: 1080,
          },
        ],
      };

      await comparisonsCommand(
        { build: 'build-1' },
        { json: true },
        {
          loadConfig: async () => ({
            userToken: 'user-token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: options => {
            clientOptions = options;
            return {};
          },
          getBuild: async () => ({ build: mockBuild }),
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(c => c.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(clientOptions.token, 'user-token');
      assert.strictEqual(dataCall.args[0].buildId, 'build-1');
      assert.strictEqual(dataCall.args[0].comparisons.length, 3);
      assert.strictEqual(dataCall.args[0].summary.identical, 1);
      assert.strictEqual(dataCall.args[0].summary.changed, 1);
      assert.strictEqual(dataCall.args[0].summary.new, 1);
      assert.strictEqual(dataCall.args[0].comparisons[2].status, 'new');
      assert.strictEqual(
        dataCall.args[0].comparisons[2].processingStatus,
        'completed'
      );
      assert.strictEqual(dataCall.args[0].comparisons[2].browser, 'Chromium');
      assert.deepStrictEqual(dataCall.args[0].comparisons[2].viewport, {
        width: 1920,
        height: 1080,
      });
      assert.deepStrictEqual(dataCall.args[0].pagination, {
        total: 3,
        limit: 50,
        offset: 0,
        hasMore: false,
      });
    });

    it('paginates comparisons for a build after applying filters', async () => {
      let output = createMockOutput();
      let mockBuild = {
        id: 'build-1',
        comparisons: [
          { id: 'comp-1', name: 'one', status: 'completed', result: 'changed' },
          {
            id: 'comp-2',
            name: 'two',
            status: 'completed',
            result: 'identical',
          },
          {
            id: 'comp-3',
            name: 'three',
            status: 'completed',
            result: 'changed',
          },
        ],
      };

      await comparisonsCommand(
        { build: 'build-1', limit: 1, offset: 1 },
        { json: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getBuild: async () => ({ build: mockBuild }),
          output,
          exit: () => {},
        }
      );

      let result = output.calls.find(c => c.method === 'data').args[0];
      assert.deepStrictEqual(
        result.comparisons.map(comparison => comparison.id),
        ['comp-2']
      );
      assert.deepStrictEqual(result.summary, {
        total: 3,
        identical: 1,
        changed: 2,
        new: 0,
      });
      assert.deepStrictEqual(result.pagination, {
        total: 3,
        limit: 1,
        offset: 1,
        hasMore: true,
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
          {
            id: 'comp-1',
            name: 'button-primary',
            status: 'completed',
            result: 'identical',
          },
          {
            id: 'comp-2',
            name: 'button-secondary',
            status: 'completed',
            result: 'changed',
          },
          {
            id: 'comp-3',
            name: 'button-tertiary',
            status: 'completed',
            result: 'identical',
          },
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

    it('keeps honeydiff summaries compact in JSON output by default', async () => {
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
      assert.strictEqual(result.honeydiff.diffRegions, undefined);
      assert.strictEqual(result.honeydiff.diffLines, undefined);
      assert.strictEqual(result.honeydiff.fingerprintData, undefined);
    });

    it('includes raw honeydiff geometry in verbose JSON output', async () => {
      let output = createMockOutput();
      let mockComparison = {
        id: 'comp-1',
        name: 'button-primary',
        status: 'completed',
        result: 'changed',
        fingerprint_hash: 'abc123def456',
        diff_regions: [{ x: 10, y: 20, width: 50, height: 30 }],
        diff_lines: [20, 30, 40],
        fingerprint_data: { hash_components: [1, 2, 3] },
      };

      await comparisonsCommand(
        { id: 'comp-1' },
        { json: true, verbose: true },
        {
          loadConfig: async () => ({ apiKey: 'test-token' }),
          createApiClient: () => ({}),
          getComparison: async () => mockComparison,
          output,
          exit: () => {},
        }
      );

      let result = output.calls.find(c => c.method === 'data').args[0];
      assert.deepStrictEqual(result.honeydiff.diffRegions, [
        { x: 10, y: 20, width: 50, height: 30 },
      ]);
      assert.deepStrictEqual(result.honeydiff.diffLines, [20, 30, 40]);
      assert.deepStrictEqual(result.honeydiff.fingerprintData, {
        hash_components: [1, 2, 3],
      });
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
