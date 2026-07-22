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

    it('rejects invalid compact agent include values', () => {
      let errors = validateContextBuildOptions({ include: 'screenshots,logs' });
      assert.ok(
        errors.includes(
          '--include must contain only: screenshots, diffs, comments'
        )
      );
    });

    it('rejects out-of-range comparison context limits', () => {
      let errors = validateContextComparisonOptions({ similarLimit: 51 });
      assert.ok(
        errors.includes('--similar-limit must be an integer between 1 and 50')
      );
    });

    it('rejects malformed and decimal comparison context limits', () => {
      assert.ok(
        validateContextComparisonOptions({
          similarLimit: Number('10abc'),
        }).includes('--similar-limit must be an integer between 1 and 50')
      );
      assert.ok(
        validateContextComparisonOptions({ recentLimit: 4.5 }).includes(
          '--recent-limit must be an integer between 1 and 50'
        )
      );
      assert.ok(
        validateContextComparisonOptions({ windowSize: 2.5 }).includes(
          '--window-size must be an integer between 1 and 50'
        )
      );
    });

    it('requires project when org is provided for screenshot context', () => {
      let errors = validateContextScreenshotOptions({ org: 'acme' });
      assert.ok(errors.includes('--org requires --project'));
    });

    it('rejects out-of-range similar limit', () => {
      let errors = validateContextSimilarOptions({ limit: 0 });
      assert.ok(errors.includes('--limit must be an integer between 1 and 50'));
    });

    it('rejects negative review queue offsets', () => {
      let errors = validateContextReviewQueueOptions({ offset: -1 });
      assert.ok(errors.includes('--offset must be a non-negative integer'));
    });

    it('rejects malformed and decimal review queue pagination', () => {
      assert.ok(
        validateContextReviewQueueOptions({ limit: Number('20abc') }).includes(
          '--limit must be an integer between 1 and 100'
        )
      );
      assert.ok(
        validateContextReviewQueueOptions({ offset: 1.5 }).includes(
          '--offset must be a non-negative integer'
        )
      );
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
      let capturedQuery = 'not-called';
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
          getBuildContext: async (_client, _buildId, query) => {
            capturedQuery = query;
            return context;
          },
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(call => call.method === 'data');
      assert.ok(dataCall);
      assert.strictEqual(dataCall.args[0].resource, 'build_context');
      assert.strictEqual(dataCall.args[0].build.id, 'build-1');
      assert.strictEqual(dataCall.args[0], context);
      assert.strictEqual(capturedQuery, undefined);
    });

    it('returns compact agent JSON by default instead of the full context payload', async () => {
      let output = createMockOutput();

      await contextBuildCommand(
        'build-1',
        { agent: true },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuildContext: async () => ({
            resource: 'build_context',
            source: 'cloud',
            scope: {
              organization: { slug: 'acme', name: 'Acme' },
              project: { slug: 'web', name: 'Web', visibility: 'private' },
            },
            build: {
              id: 'build-1',
              name: 'main-abc123',
              status: 'completed',
              approval_status: 'pending',
            },
            baseline: {
              selected: {
                id: 'baseline-1',
                name: 'Approved Main',
                approval_status: 'approved',
              },
              selection_reason: 'latest approved build',
            },
            status: {
              needs_review: true,
              reasons: ['comparisons_need_review'],
              pending_comparisons: 2,
              unresolved_comments: 0,
            },
            summary: {
              comparisons: { total: 2, changed: 1, new: 1, identical: 0 },
            },
            screenshots: [{ id: 'ss-1', name: 'Dashboard' }],
            comparisons: [
              {
                id: 'cmp-1',
                screenshot_name: 'Dashboard',
                result: 'changed',
                visual_review: { state: 'pending', reviewer: null },
                needs_review: true,
                diff: {
                  percentage: 1.23,
                  changed_pixels: 123,
                  total_pixels: 10000,
                  threshold: 2,
                  image_url: 'https://cdn.test/diff.png',
                  regions: [{ pixelCount: 50 }],
                  fingerprint_hash: 'fp-dashboard',
                  projection: {
                    clusters: { count: 1 },
                    distribution: 'header',
                  },
                },
                screenshot: {
                  id: 'ss-1',
                  browser: 'chrome',
                  device: 'desktop',
                  viewport: { width: 1440, height: 900 },
                  bitmap: { width: 2880, height: 1800 },
                  metadata: { locale: 'en-US' },
                  signature: 'Dashboard|1440|chrome',
                  original_url: 'https://cdn.test/current.png',
                },
                baseline: {
                  id: 'base-ss-1',
                  build_id: 'baseline-1',
                  browser: 'chrome',
                  viewport: { width: 1440, height: 900 },
                  bitmap: { width: 2880, height: 1800 },
                  original_url: 'https://cdn.test/baseline.png',
                },
              },
              {
                id: 'cmp-2',
                screenshot_name: 'Settings',
                result: 'new',
                needs_review: true,
              },
            ],
            comments: {
              build: [{ id: 'comment-1', message: 'looks risky' }],
            },
            links: { build_url: 'https://app.test/acme/web/builds/build-1' },
          }),
          output,
          exit: () => {},
        }
      );

      let dataCall = output.calls.find(call => call.method === 'data');
      let payload = dataCall.args[0];

      assert.strictEqual(payload.resource, 'build_agent_context');
      assert.strictEqual(payload.project.organization, 'acme');
      assert.strictEqual(payload.build.id, 'build-1');
      assert.strictEqual(payload.baseline.selected.name, 'Approved Main');
      assert.strictEqual(payload.status.needs_review, true);
      assert.strictEqual(payload.evidence.length, 2);
      assert.strictEqual(payload.evidence_limit, 10);
      assert.strictEqual(payload.evidence_returned, 2);
      assert.strictEqual(payload.evidence_truncated, false);
      assert.strictEqual(payload.evidence[0].name, 'Dashboard');
      assert.strictEqual(payload.evidence[0].diff.region_count, 1);
      assert.deepStrictEqual(payload.evidence[0].diff.projection, {
        clusters: { count: 1 },
        distribution: 'header',
      });
      assert.strictEqual(payload.evidence[0].review_state, 'pending');
      assert.strictEqual(payload.evidence[0].screenshot.browser, 'chrome');
      assert.deepStrictEqual(payload.evidence[0].screenshot.viewport, {
        width: 1440,
        height: 900,
      });
      assert.strictEqual(
        payload.evidence[0].screenshot.url,
        'https://cdn.test/current.png'
      );
      assert.strictEqual(
        payload.evidence[0].baseline.url,
        'https://cdn.test/baseline.png'
      );
      assert.ok(!payload.evidence[0].diff.regions);
      assert.ok(!payload.screenshots);
      assert.ok(!payload.comments);
      assert.ok(!payload.groups);
      assert.ok(!payload.next_actions);
      assert.deepStrictEqual(
        payload.suggested_commands.map(item => item.command),
        [
          'vizzly --json context comparison cmp-1 --source cloud',
          'vizzly --json context screenshot Dashboard --source cloud',
          'vizzly --json context build build-1 --agent --include diffs --source cloud',
        ]
      );
    });

    it('keeps one bounded breadth-first evidence queue in API order', async () => {
      let output = createMockOutput();
      let groups = Array.from({ length: 6 }, (_, groupIndex) => ({
        name: `Group ${groupIndex + 1}`,
        variant_count: 2,
        aggregate_status: {
          needs_review: true,
          needs_review_count: 2,
        },
        variants: Array.from({ length: 2 }, (_, variantIndex) => ({
          id: `cmp-${groupIndex + 1}-${variantIndex + 1}`,
          result: 'changed',
          needs_review: true,
        })),
      }));

      await contextBuildCommand(
        'build-1',
        { agent: true },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuildContext: async () => ({
            build: { id: 'build-1' },
            groups,
          }),
          output,
          exit: () => {},
        }
      );

      let payload = output.calls.find(call => call.method === 'data').args[0];
      assert.strictEqual(payload.evidence_returned, 10);
      assert.strictEqual(payload.evidence_truncated, true);
      assert.deepStrictEqual(
        payload.evidence.map(item => item.id),
        [
          'cmp-1-1',
          'cmp-2-1',
          'cmp-3-1',
          'cmp-4-1',
          'cmp-5-1',
          'cmp-6-1',
          'cmp-1-2',
          'cmp-2-2',
          'cmp-3-2',
          'cmp-4-2',
        ]
      );
      assert.ok(
        payload.suggested_commands.some(item =>
          item.command.endsWith('--agent --full --source cloud')
        )
      );
    });

    it('returns no compact evidence when the API marks every group reviewed', async () => {
      let output = createMockOutput();

      await contextBuildCommand(
        'build-1',
        { agent: true },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuildContext: async () => ({
            build: { id: 'build-1' },
            groups: [
              {
                name: 'Dashboard',
                aggregate_status: { needs_review: false },
                variants: [
                  {
                    id: 'cmp-approved',
                    result: 'changed',
                    needs_review: true,
                  },
                ],
              },
            ],
          }),
          output,
          exit: () => {},
        }
      );

      let payload = output.calls.find(call => call.method === 'data').args[0];
      assert.strictEqual(payload.status, null);
      assert.strictEqual(payload.summary, null);
      assert.strictEqual(payload.evidence_returned, 0);
      assert.deepStrictEqual(payload.evidence, []);
      assert.deepStrictEqual(payload.suggested_commands, []);
    });

    it('keeps failed captures actionable without inventing comparison IDs', async () => {
      let output = createMockOutput();

      await contextBuildCommand(
        'build-1',
        { agent: true },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuildContext: async () => ({
            build: { id: 'build-1' },
            screenshots: [
              {
                id: 'failed-screenshot',
                name: 'Settings page',
                status: 'failed',
                error_message: 'Browser render failed',
                url: 'https://cdn.test/failed.png',
              },
            ],
          }),
          output,
          exit: () => {},
        }
      );

      let payload = output.calls.find(call => call.method === 'data').args[0];
      assert.strictEqual(payload.evidence[0].kind, 'failed_capture');
      assert.strictEqual(payload.evidence[0].id, null);
      assert.strictEqual(
        payload.evidence[0].screenshot.id,
        'failed-screenshot'
      );
      assert.strictEqual(
        payload.evidence[0].error_message,
        'Browser render failed'
      );
      assert.ok(
        payload.suggested_commands.every(
          item => !item.command.includes('context comparison')
        )
      );
      assert.ok(
        payload.suggested_commands.some(item =>
          item.command.includes("context screenshot 'Settings page'")
        )
      );
    });

    it('allows compact agent JSON to include requested detail', async () => {
      let output = createMockOutput();

      await contextBuildCommand(
        'build-1',
        { agent: true, include: 'screenshots,diffs,comments' },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuildContext: async () => ({
            resource: 'build_context',
            scope: {
              organization: { slug: 'acme' },
              project: { slug: 'web' },
            },
            build: { id: 'build-1' },
            status: { needs_review: true, pending_comparisons: 1 },
            screenshots: [{ id: 'ss-1', name: 'Dashboard' }],
            comparisons: [
              {
                id: 'cmp-1',
                screenshot_name: 'Dashboard',
                result: 'changed',
                diff: {
                  regions: [{ pixelCount: 50 }],
                  cluster_metadata: { clusterCount: 1 },
                },
              },
            ],
            comments: { build: [{ id: 'comment-1' }] },
          }),
          output,
          exit: () => {},
        }
      );

      let payload = output.calls.find(call => call.method === 'data').args[0];
      assert.deepStrictEqual(payload.screenshots, [
        { id: 'ss-1', name: 'Dashboard' },
      ]);
      assert.deepStrictEqual(payload.comments, {
        build: [{ id: 'comment-1' }],
      });
      assert.deepStrictEqual(payload.evidence[0].diff.regions, [
        { pixelCount: 50 },
      ]);
      assert.deepStrictEqual(payload.evidence[0].diff.cluster_metadata, {
        clusterCount: 1,
      });
    });

    it('returns the full payload when agent JSON asks for full context', async () => {
      let output = createMockOutput();
      let capturedQuery = 'not-called';
      let context = {
        resource: 'build_context',
        build: { id: 'build-1' },
        screenshots: [{ id: 'ss-1' }],
      };

      await contextBuildCommand(
        'build-1',
        { agent: true, full: true },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuildContext: async (_client, _buildId, query) => {
            capturedQuery = query;
            return context;
          },
          output,
          exit: () => {},
        }
      );

      let payload = output.calls.find(call => call.method === 'data').args[0];
      assert.strictEqual(payload.resource, 'build_context');
      assert.deepStrictEqual(payload.screenshots, [{ id: 'ss-1' }]);
      assert.strictEqual(capturedQuery, undefined);
    });

    it('resolves cloud current builds from the active run session', async () => {
      let output = createMockOutput();
      let capturedBuildId = null;

      await contextBuildCommand(
        'current',
        { source: 'cloud', agent: true },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          readSession: () => ({
            buildId: 'build-from-session',
            source: 'session_file',
          }),
          getBuildContext: async (_client, buildId) => {
            capturedBuildId = buildId;
            return {
              resource: 'build_context',
              build: { id: buildId },
              comparisons: [],
            };
          },
          output,
          exit: () => {},
        }
      );

      assert.strictEqual(capturedBuildId, 'build-from-session');
      let payload = output.calls.find(call => call.method === 'data').args[0];
      assert.strictEqual(payload.build.id, 'build-from-session');
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

    it('renders canonical build context from the app without legacy review fields', async () => {
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
            resource: 'build_context',
            scope: {
              organization: { slug: 'acme' },
              project: { slug: 'storybook' },
            },
            build: {
              id: 'build-1',
              name: 'Context Store Build',
              status: 'completed',
            },
            baseline: {
              selected: {
                id: 'baseline-build',
                name: 'Approved Main',
                approval_status: 'approved',
              },
              selection_reason: 'common_ancestor',
            },
            status: {
              needs_review: true,
              pending_comparisons: 1,
              unresolved_comments: 2,
            },
            summary: {
              review: { pending: 1, approved: 4, rejected: 0 },
              comments: { build: 1, screenshot: 2 },
            },
            preview: { status: 'ready', url: 'https://preview.test' },
            screenshots: [{ id: 'ss-1', name: 'Dashboard' }],
            comparisons: [
              {
                id: 'cmp-1',
                screenshot_name: 'Dashboard',
                result: 'changed',
                needs_review: true,
                diff: {
                  percentage: 0.42,
                  fingerprint_hash: 'fp-dashboard',
                },
              },
            ],
            comments: {
              build: [{ id: 'comment-1' }],
              screenshot_count: 2,
            },
            links: { build_url: 'https://app.test/acme/storybook/builds/1' },
          }),
          output,
          exit: () => {},
        }
      );

      let labels = output.calls.filter(call => call.method === 'labelValue');
      assert.ok(
        labels.some(
          call =>
            call.args[0] === 'Baseline' &&
            call.args[1].includes('Approved Main')
        )
      );
      assert.ok(
        labels.some(
          call =>
            call.args[0] === 'Needs Review' && call.args[1].includes('yes')
        )
      );

      let printLines = output.calls
        .filter(call => call.method === 'print')
        .map(call => call.args[0]);
      assert.ok(printLines.some(line => line.includes('Dashboard CHANGED')));
      assert.ok(printLines.some(line => line.includes('needs review')));
    });

    it('renders grouped review facts and failed captures without replacing server aggregates', async () => {
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
            resource: 'build_context',
            scope: {
              organization: { slug: 'acme' },
              project: { slug: 'checkout' },
            },
            build: {
              id: 'build-1',
              name: 'Grouped Review Build',
              status: 'completed',
            },
            groups: [
              {
                name: 'Checkout',
                variant_count: 8,
                aggregate_status: {
                  has_changes: false,
                  has_new: false,
                  all_approved: true,
                  needs_review: false,
                  needs_review_count: 0,
                  failed_count: 0,
                  max_diff_percentage: 0,
                },
                variants: [
                  {
                    id: 'partial-variant',
                    result: 'changed',
                    visual_review: { state: 'pending' },
                    browser: 'chromium',
                    viewport: { width: 375, height: 667 },
                  },
                ],
              },
              {
                name: 'Payment',
                variant_count: 6,
                aggregate_status: {
                  needs_review: true,
                  needs_review_count: 3,
                  failed_count: 2,
                },
                variants: [],
              },
            ],
            screenshots: [
              {
                id: 'failed-capture',
                name: 'Settings',
                status: 'failed',
                error_message: 'Browser render failed',
                browser: 'webkit',
                viewport: { width: 1280, height: 720 },
                url: 'https://cdn.test/failed-current.png',
              },
            ],
          }),
          output,
          exit: () => {},
        }
      );

      let lines = output.calls
        .filter(call => call.method === 'print')
        .map(call => call.args[0]);
      let checkoutIndex = lines.findIndex(line =>
        line.includes('Checkout APPROVED')
      );
      let paymentIndex = lines.findIndex(line =>
        line.includes('Payment FAILED')
      );

      assert.ok(lines.some(line => line.includes('Screenshot groups')));
      assert.ok(checkoutIndex >= 0);
      assert.ok(paymentIndex > checkoutIndex);
      assert.ok(
        lines.some(line => line.includes('8 variants · 0 needs review'))
      );
      assert.ok(
        lines.some(line =>
          line.includes('6 variants · 3 needs review · 2 failed')
        )
      );
      assert.ok(lines.some(line => line.includes('Failed captures')));
      assert.ok(lines.some(line => line.includes('Settings FAILED')));
      assert.ok(
        lines.some(
          line =>
            line.includes('Browser render failed') &&
            line.includes('https://cdn.test/failed-current.png')
        )
      );
    });

    it('prints compact agent context for local and cloud build handoff', async () => {
      let output = createMockOutput();

      await contextBuildCommand(
        'current',
        { source: 'local', agent: true },
        {},
        {
          loadConfig: async () => ({
            apiUrl: 'https://api.test',
          }),
          resolveContextSource: () => 'local',
          createLocalWorkspaceContextProvider: () => ({
            getBuildContext: async () => ({
              resource: 'build_context',
              source: 'local_workspace',
              scope: {
                organization: { slug: 'local' },
                project: { slug: 'web' },
              },
              build: {
                id: 'local-build',
                name: 'local-build',
                status: 'completed',
              },
              baseline: {
                selected: {
                  id: 'baseline-build',
                  name: 'Approved Main',
                  approval_status: 'approved',
                },
              },
              status: { needs_review: true, pending_comparisons: 1 },
              links: {
                report_url:
                  'file:///tmp/vizzly-local-workspace/.vizzly/report/index.html',
              },
              comparisons: [
                {
                  screenshot_name: 'Dashboard',
                  result: 'changed',
                  diff: {
                    percentage: 1.2,
                    image_url: '/images/diffs/dashboard.png',
                  },
                },
              ],
            }),
          }),
          output,
          exit: () => {},
        }
      );

      let agentOutput = output.calls
        .filter(call => call.method === 'print')
        .map(call => call.args[0])
        .join('\n');

      assert.ok(agentOutput.includes('Vizzly Visual Context'));
      assert.ok(agentOutput.includes('Approved baseline: Approved Main'));
      assert.ok(agentOutput.includes('Report: file:///tmp/vizzly-local'));
      assert.ok(agentOutput.includes('Dashboard: changed'));
      assert.ok(agentOutput.includes('approved baselines as visual truth'));
    });

    it('prints reviewed screenshot names for all-green agent context', async () => {
      let output = createMockOutput();

      await contextBuildCommand(
        'current',
        { source: 'local', agent: true },
        {},
        {
          loadConfig: async () => ({
            apiUrl: 'https://api.test',
          }),
          resolveContextSource: () => 'local',
          createLocalWorkspaceContextProvider: () => ({
            getBuildContext: async () => ({
              resource: 'build_context',
              source: 'local_workspace',
              scope: {
                organization: { slug: 'local' },
                project: { slug: 'web' },
              },
              build: {
                id: 'local-build',
                name: 'local-build',
                status: 'completed',
              },
              baseline: {
                selected: {
                  id: 'baseline-build',
                  name: 'Approved Main',
                  approval_status: 'approved',
                },
              },
              status: { needs_review: false, pending_comparisons: 0 },
              comparisons: [
                {
                  screenshot_name: 'Dashboard',
                  result: 'identical',
                  approval_status: 'approved',
                },
                {
                  screenshot_name: 'Settings',
                  result: 'identical',
                  approval_status: 'approved',
                },
              ],
            }),
          }),
          output,
          exit: () => {},
        }
      );

      let agentOutput = output.calls
        .filter(call => call.method === 'print')
        .map(call => call.args[0])
        .join('\n');

      assert.ok(agentOutput.includes('## Reviewed Screenshots'));
      assert.ok(agentOutput.includes('Dashboard: identical'));
      assert.ok(agentOutput.includes('Settings: identical'));
    });

    it('includes status-only failed comparisons in agent evidence', async () => {
      let output = createMockOutput();

      await contextBuildCommand(
        'build-1',
        { agent: true },
        {},
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          createApiClient: () => ({}),
          getBuildContext: async () => ({
            resource: 'build_context',
            scope: {
              organization: { slug: 'acme' },
              project: { slug: 'web' },
            },
            build: {
              id: 'build-1',
              name: 'build-1',
              status: 'completed',
            },
            status: { needs_review: true, pending_comparisons: 1 },
            comparisons: [
              {
                screenshot_name: 'Checkout',
                status: 'failed',
                needs_review: true,
                diff_percentage: 0.8,
              },
            ],
          }),
          output,
          exit: () => {},
        }
      );

      let agentOutput = output.calls
        .filter(call => call.method === 'print')
        .map(call => call.args[0])
        .join('\n');

      assert.ok(agentOutput.includes('## Evidence To Inspect'));
      assert.ok(agentOutput.includes('Checkout: failed'));
      assert.ok(agentOutput.includes('0.8% diff'));
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
    it('uses cloud in auto mode when project scope is explicit', async () => {
      let output = createMockOutput();
      let capturedRuntimeOptions = null;

      await contextReviewQueueCommand(
        { org: 'acme', project: 'storybook', limit: 5 },
        { json: true },
        {
          loadConfig: async () => ({
            apiKey: 'token',
            apiUrl: 'https://api.test',
          }),
          resolveContextSource: runtimeOptions => {
            capturedRuntimeOptions = runtimeOptions;
            return 'cloud';
          },
          createLocalWorkspaceContextProvider: () => ({
            isAvailable: () => true,
            canHandle: () => true,
          }),
          createApiClient: () => ({}),
          getReviewQueueContext: async () => ({
            resource: 'review_queue_context',
            source: 'cloud',
            scope: {
              organization: { slug: 'acme' },
              project: { slug: 'storybook' },
            },
            summary: { total: 0, changed: 0, new: 0, builds: 0 },
            comparisons: [],
          }),
          output,
          exit: () => {},
        }
      );

      assert.strictEqual(capturedRuntimeOptions.hasCloudScope, true);
      let dataCall = output.calls.find(call => call.method === 'data');
      assert.strictEqual(dataCall.args[0].source, 'cloud');
    });

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
