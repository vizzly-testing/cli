import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  contextBuildCommand,
  contextComparisonCommand,
  contextReviewQueueCommand,
  contextScreenshotCommand,
  contextSimilarCommand,
  validateContextBuildOptions,
  validateContextComparisonOptions,
  validateContextReviewQueueOptions,
  validateContextScreenshotOptions,
  validateContextSimilarOptions,
} from '../../src/commands/context.js';

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

describe('commands/context', () => {
  describe('validation', () => {
    it('rejects invalid source values', () => {
      let errors = validateContextBuildOptions({ source: 'moon' });
      assert.ok(errors.includes('--source must be one of: auto, cloud, local'));
    });

    it('rejects out-of-range comparison context limits', () => {
      let errors = validateContextComparisonOptions({ similarLimit: 51 });
      assert.ok(
        errors.includes('--similar-limit must be a number between 1 and 50')
      );
    });

    it('requires project when org is provided for screenshot context', () => {
      let errors = validateContextScreenshotOptions({ org: 'acme' });
      assert.ok(errors.includes('--org requires --project'));
    });

    it('rejects out-of-range similar limit', () => {
      let errors = validateContextSimilarOptions({ limit: 0 });
      assert.ok(errors.includes('--limit must be a number between 1 and 50'));
    });

    it('rejects negative review queue offsets', () => {
      let errors = validateContextReviewQueueOptions({ offset: -1 });
      assert.ok(errors.includes('--offset must be a non-negative number'));
    });
  });

  describe('contextBuildCommand', () => {
    it('requires authentication', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await contextBuildCommand(
        'build-1',
        {},
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
      assert.ok(output.calls.some(call => call.method === 'error'));
    });

    it('returns build context in JSON mode', async () => {
      let output = createMockOutput();
      let context = {
        resource: 'build_context',
        build: { id: 'build-1' },
        summary: { comparisons: { changed: 1 } },
      };

      await contextBuildCommand(
        'build-1',
        {},
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuildContext: async () => context,
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(call => call.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].resource, 'build_context');
      assert.strictEqual(dataCall.args[0].build.id, 'build-1');
    });

    it('uses local workspace context without requiring authentication', async () => {
      let output = createMockOutput();

      await contextBuildCommand(
        'current',
        { source: 'local' },
        { json: true },
        {
          loadConfig: async () => ({
            apiUrl: 'https://api.test',
          }),
          resolveContextSource: () => 'local',
          createLocalWorkspaceContextProvider: () => ({
            getBuildContext: async () => ({
              resource: 'build_context',
              source: 'local_workspace',
              build: { id: 'local-build' },
            }),
          }),
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(call => call.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].source, 'local_workspace');
      assert.strictEqual(dataCall.args[0].build.id, 'local-build');
    });

    it('uses comparison results in human output instead of completed status', async () => {
      let output = createMockOutput();

      await contextBuildCommand(
        'build-1',
        {},
        {},
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuildContext: async () => ({
            build: {
              id: 'build-1',
              name: 'Context Build',
              status: 'completed',
            },
            scope: {
              organization: { slug: 'acme' },
              project: { slug: 'storybook' },
            },
            summary: { review: { pending: 1, approved: 0, rejected: 0 } },
            review: { comments: [], assignments: [] },
            comparisons: [
              {
                screenshot: { name: 'Dashboard' },
                status: 'completed',
                result: 'changed',
                diff_percentage: 1.5,
                analysis: { fingerprint_hash: 'fp-dashboard' },
              },
              {
                screenshot: { name: 'Settings' },
                status: 'completed',
                result: 'new',
                diff_percentage: 4.25,
                analysis: { fingerprint_hash: 'fp-settings' },
              },
            ],
            links: {},
          }),
          output,
          exit: () => {},
        }
      );

      let printLines = output.calls
        .filter(call => call.method === 'print')
        .map(call => call.args[0]);
      assert.ok(printLines.some(line => line.includes('Dashboard CHANGED')));
      assert.ok(printLines.some(line => line.includes('Settings NEW')));
    });
  });

  describe('contextComparisonCommand', () => {
    it('passes similarity and history limits through to the API helper', async () => {
      let output = createMockOutput();
      let capturedQuery = null;

      await contextComparisonCommand(
        'comparison-1',
        { similarLimit: 5, recentLimit: 4, windowSize: 12 },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getComparisonContext: async (_client, _id, query) => {
            capturedQuery = query;
            return {
              resource: 'comparison_context',
              comparison: { id: 'comparison-1' },
            };
          },
          output,
          exit: () => {},
        }
      );

      assert.deepStrictEqual(capturedQuery, {
        similarLimit: 5,
        recentLimit: 4,
        windowSize: 12,
      });
    });

    it('shows known region labels in human output', async () => {
      let output = createMockOutput();

      await contextComparisonCommand(
        'comparison-1',
        {},
        {},
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getComparisonContext: async () => ({
            scope: {
              organization: { slug: 'acme' },
              project: { slug: 'storybook' },
            },
            comparison: {
              id: 'comparison-1',
              result: 'changed',
              status: 'completed',
              screenshot: { name: 'Dashboard' },
              analysis: {
                fingerprint_hash: 'fp-dashboard',
                diff_image_url: 'https://cdn.test/diff.png',
              },
            },
            history: {
              similar_by_fingerprint: [],
              recent_by_name: [],
              confirmed_regions: [{ label: 'Known header copy band' }],
            },
            review: {
              build_comments: [],
              screenshot_comments: [],
            },
            links: {},
          }),
          output,
          exit: () => {},
        }
      );

      let knownRegionsCall = output.calls.find(
        call => call.method === 'labelValue' && call.args[0] === 'Known Regions'
      );
      assert.ok(knownRegionsCall);
      assert.strictEqual(knownRegionsCall.args[1], 'Known header copy band');
    });
  });

  describe('contextScreenshotCommand', () => {
    it('passes project scope and history options to screenshot context', async () => {
      let output = createMockOutput();
      let capturedQuery = null;

      await contextScreenshotCommand(
        'Dashboard',
        { project: 'storybook', org: 'acme', recentLimit: 3, windowSize: 11 },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getScreenshotContext: async (_client, _name, query) => {
            capturedQuery = query;
            return {
              resource: 'screenshot_context',
              screenshot: { name: 'Dashboard' },
            };
          },
          output,
          exit: () => {},
        }
      );

      assert.deepStrictEqual(capturedQuery, {
        project: 'storybook',
        organization: 'acme',
        recentLimit: 3,
        windowSize: 11,
      });
    });

    it('shows confirmed region labels in human output', async () => {
      let output = createMockOutput();

      await contextScreenshotCommand(
        'Dashboard',
        { project: 'storybook', org: 'acme' },
        {},
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getScreenshotContext: async () => ({
            scope: {
              organization: { slug: 'acme' },
              project: { slug: 'storybook' },
            },
            screenshot: { name: 'Dashboard' },
            hotspot_analysis: {
              total_builds_analyzed: 2,
              confidence: 'high',
            },
            confirmed_regions: [{ label: 'Known header copy band' }],
            history: { recent_comparisons: [] },
          }),
          output,
          exit: () => {},
        }
      );

      let knownRegionsCall = output.calls.find(
        call => call.method === 'labelValue' && call.args[0] === 'Known Regions'
      );
      assert.ok(knownRegionsCall);
      assert.strictEqual(knownRegionsCall.args[1], 'Known header copy band');
    });
  });

  describe('contextSimilarCommand', () => {
    it('passes project-scoped fingerprint search options', async () => {
      let output = createMockOutput();
      let capturedQuery = null;

      await contextSimilarCommand(
        'fp-dashboard',
        { project: 'storybook', org: 'acme', limit: 7 },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getSimilarFingerprintContext: async (_client, _hash, query) => {
            capturedQuery = query;
            return { resource: 'fingerprint_context', comparisons: [] };
          },
          output,
          exit: () => {},
        }
      );

      assert.deepStrictEqual(capturedQuery, {
        project: 'storybook',
        organization: 'acme',
        limit: 7,
      });
    });

    it('fails clearly when local fingerprint similarity is unavailable', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await contextSimilarCommand(
        'fp-dashboard',
        { source: 'local' },
        {},
        {
          loadConfig: async () => ({
            apiUrl: 'https://api.test',
          }),
          resolveContextSource: () => 'local',
          createLocalWorkspaceContextProvider: () => ({
            getSimilarFingerprintContext: async () => {
              throw new Error(
                'Local workspace context does not support fingerprint similarity yet. Use --source cloud for this query.'
              );
            },
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
          call =>
            call.method === 'error' &&
            call.args[0] === 'Failed to fetch similar visual context'
        )
      );
    });

    it('explains the local similarity gap before an auth error in auto mode', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await contextSimilarCommand(
        'fp-dashboard',
        {},
        {},
        {
          loadConfig: async () => ({
            apiUrl: 'https://api.test',
          }),
          createLocalWorkspaceContextProvider: () => ({
            isAvailable: () => true,
            canHandle: () => false,
          }),
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      let errorCall = output.calls.find(call => call.method === 'error');
      assert.ok(errorCall);
      assert.strictEqual(
        errorCall.args[1]?.message,
        'Local workspace context does not support fingerprint similarity yet. Use --source cloud for this query.'
      );
    });

    it('renders nested fingerprint hashes in human output', async () => {
      let output = createMockOutput();

      await contextSimilarCommand(
        'fp-dashboard',
        { project: 'storybook', org: 'acme' },
        {},
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getSimilarFingerprintContext: async () => ({
            scope: {
              organization: { slug: 'acme' },
              project: { slug: 'storybook' },
            },
            fingerprint: { hash: 'fp-dashboard' },
            matches: [],
          }),
          output,
          exit: () => {},
        }
      );

      assert.ok(
        output.calls.some(
          call =>
            call.method === 'print' && call.args[0].includes('fp-dashboard')
        )
      );
    });
  });

  describe('contextReviewQueueCommand', () => {
    it('passes review queue scope and pagination to the API helper', async () => {
      let output = createMockOutput();
      let capturedQuery = null;

      await contextReviewQueueCommand(
        {
          project: 'storybook',
          org: 'acme',
          limit: 15,
          offset: 30,
          source: 'cloud',
        },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getReviewQueueContext: async (_client, query) => {
            capturedQuery = query;
            return { resource: 'review_queue_context', comparisons: [] };
          },
          output,
          exit: () => {},
        }
      );

      assert.deepStrictEqual(capturedQuery, {
        project: 'storybook',
        organization: 'acme',
        limit: 15,
        offset: 30,
      });
    });
  });
});
