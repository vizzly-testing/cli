import assert from 'node:assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseJSONOutput, runCLI } from '../helpers/cli-runner.js';

function createDynamicRegionResolutionContext() {
  return {
    systemResolution: {
      type: 'dynamic_region_containment',
      contractVersion: 'dynamic-region-containment-v1',
      evidence: {
        id: 'c5b6c137-39d7-4c8b-a7c0-b3a5e41d85da',
        diffImageId: '64b2873e-3f76-43a1-9ff4-577c7f312ce2',
        maskDigest: `sha256:${'a'.repeat(64)}`,
        captureIdentityHash: `capture:v2:${'b'.repeat(64)}`,
        analysisContractHash: `diff-mask-analysis-v1:${'c'.repeat(64)}`,
        renderProfileHash: `render-profile:v2:${'d'.repeat(64)}`,
        componentCount: 20,
        containedComponentCount: 20,
      },
      policies: [
        {
          id: 'cf919da4-a9d0-4f7e-8c09-99c9f47138ce',
          revision: 3,
          revisionEvent: {
            id: '9c2a7037-2a69-4ccb-bd4f-7b497bc23fca',
            type: 'region.revised',
            occurredAt: '2026-07-25T12:00:00.000Z',
          },
          geometry: {
            anchorX: 'right',
            anchorY: 'bottom',
            coordinateSpaceVersion: 'bitmap-anchor-v1',
            width: 361,
            height: 15,
            insetX: 352,
            insetY: 49,
          },
          assignment: {
            id: '2f07a9a1-b0c6-4bd6-a1dc-ac63812703c9',
            captureIdentityHash: `capture:v2:${'b'.repeat(64)}`,
            analysisContractHash: `diff-mask-analysis-v1:${'c'.repeat(64)}`,
            screenshotName: 'Screenshot 1',
            assignedAt: '2026-07-25T11:00:00.000Z',
          },
        },
      ],
      resolvedAt: '2026-07-25T12:05:00.000Z',
    },
  };
}

function createWorkspaceFixture() {
  let cwd = join(
    tmpdir(),
    `vizzly-context-local-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  let vizzlyDir = join(cwd, '.vizzly');
  let baselinesDir = join(vizzlyDir, 'baselines');

  mkdirSync(baselinesDir, { recursive: true });

  writeFileSync(
    join(vizzlyDir, 'server.json'),
    JSON.stringify({
      port: 4821,
      pid: 999,
      startTime: Date.now(),
      buildId: 'local-build-1',
    })
  );
  writeFileSync(
    join(vizzlyDir, 'session.json'),
    JSON.stringify({
      buildId: 'local-build-1',
      branch: 'feature/local-context',
      commit: 'abc1234',
      createdAt: '2026-04-29T00:00:00.000Z',
    })
  );
  writeFileSync(
    join(vizzlyDir, 'report-data.json'),
    JSON.stringify({
      timestamp: Date.now(),
      summary: {
        total: 2,
        passed: 0,
        failed: 1,
        rejected: 0,
        errors: 0,
      },
      comparisons: [
        {
          id: 'comp-settings',
          name: 'Settings Panel',
          originalName: 'Settings Panel',
          signature: 'Settings Panel|1440|chrome',
          status: 'failed',
          current: '/images/current/settings-panel.png',
          baseline: '/images/baselines/settings-panel.png',
          diff: '/images/diffs/settings-panel.png',
          properties: {
            browser: 'chrome',
            viewport_width: 1440,
            viewport_height: 900,
          },
          diffPercentage: 1.37,
          diffCount: 245,
          totalPixels: 921600,
        },
        {
          id: 'comp-dashboard',
          name: 'Dashboard',
          originalName: 'Dashboard',
          signature: 'Dashboard|1440|chrome',
          status: 'new',
          current: '/images/current/dashboard.png',
          baseline: null,
          diff: null,
          properties: {
            browser: 'chrome',
            viewport_width: 1440,
            viewport_height: 900,
          },
          diffPercentage: null,
          diffCount: null,
          totalPixels: 921600,
        },
      ],
    })
  );
  writeFileSync(
    join(vizzlyDir, 'comparison-details.json'),
    JSON.stringify({
      'comp-settings': {
        diffClusters: [{ x: 120, y: 96, width: 520, height: 164 }],
        confirmedRegions: [
          {
            id: 'region-1',
            label: 'Known settings header band',
            x1: 120,
            y1: 96,
            x2: 640,
            y2: 260,
          },
        ],
        hotspotAnalysis: { confidence: 'high', confidenceScore: 92 },
      },
    })
  );
  writeFileSync(
    join(vizzlyDir, 'hotspots.json'),
    JSON.stringify({
      summary: { total_regions: 1 },
      hotspots: {
        'Settings Panel': {
          regions: [{ y1: 96, y2: 260 }],
          confidence: 'high',
        },
      },
    })
  );
  writeFileSync(
    join(vizzlyDir, 'regions.json'),
    JSON.stringify({
      summary: { total_regions: 1 },
      regions: {
        'Settings Panel': {
          confirmed: [
            {
              id: 'region-1',
              label: 'Known settings header band',
              x1: 120,
              y1: 96,
              x2: 640,
              y2: 260,
            },
          ],
          candidates: [],
        },
      },
    })
  );

  return cwd;
}

async function withBuildContextApi(callback) {
  let requests = [];
  let completeDynamicRegions = {
    proposals: {
      selection: {
        requestedBuild: {
          selectedCount: 11,
          excludedCount: 90,
        },
      },
      exclusions: [
        {
          buildId: 'build-123',
          comparisonId: 'comparison-complete-only',
          reason: 'complete_only',
          source: 'requested_build',
        },
        {
          buildId: 'build-123',
          comparisonId: 'comparison-diagnostic',
          reason: 'diagnostic',
          source: 'requested_build',
        },
      ],
    },
  };
  let diagnosticDynamicRegions = {
    ...completeDynamicRegions,
    proposals: {
      ...completeDynamicRegions.proposals,
      exclusions: [completeDynamicRegions.proposals.exclusions[1]],
    },
  };
  let comparisons = Array.from({ length: 11 }, (_, index) => ({
    id: `comparison-${index + 1}`,
    screenshot_name: `Screenshot ${index + 1}`,
    result: 'changed',
    needs_review: true,
    visual_review: { state: 'pending' },
    is_flaky: false,
    screenshot: {
      id: `current-${index + 1}`,
      name: `Screenshot ${index + 1}`,
      browser: 'chrome',
      viewport: { width: 1440, height: 900 },
      bitmap: { width: 2880, height: 1800 },
      metadata: { locale: 'en-US' },
      signature: `Screenshot ${index + 1}|1440|chrome`,
      url: `https://cdn.test/current-${index + 1}.png`,
      baseline: {
        id: `baseline-${index + 1}`,
        build_id: 'baseline-build',
        name: `Screenshot ${index + 1}`,
        url: `https://cdn.test/baseline-${index + 1}.png`,
      },
    },
    diff: {
      percentage: index + 0.5,
      changed_pixels: index + 10,
      total_pixels: 5184000,
      image_url: `https://cdn.test/diff-${index + 1}.png`,
      fingerprint_hash: `fingerprint-${index + 1}`,
      details: { clusters: { count: 1 } },
      artifacts: {
        analysis: {
          available: true,
          schema_version: 2,
          size_bytes: 1024,
          content_encoding: 'gzip',
        },
        diff_mask: {
          evidence_status: 'complete',
          available: true,
          complete: true,
          download_url: `/api/sdk/context/comparisons/comparison-${index + 1}/diff-mask`,
          digest: `sha256:${'a'.repeat(64)}`,
          width: 2880,
          height: 1800,
          pixel_count: index + 10,
          size_bytes: 2048,
          mime_type: 'image/png',
          honeydiff_version: '0.14.0',
          mask_semantics_version: 'diff-mask-v1',
          capture_identity_hash: `capture:v2:${index + 1}`,
          render_profile_hash: 'render-profile:v2:shared',
          analysis_contract_hash: 'analysis-contract:v1:shared',
          coordinate_space_version: 'bitmap-top-left-v1',
        },
      },
      regions: [{ x: 10, y: 20, width: 30, height: 40 }],
    },
  }));
  let groups = Array.from({ length: 11 }, (_, index) => ({
    name: `Screenshot ${index + 1}`,
    variant_count: 1,
    aggregate_status: {
      needs_review: true,
      needs_review_count: 1,
      max_diff_percentage: index + 0.5,
    },
    variants: [
      {
        id: `comparison-${index + 1}`,
        result: 'changed',
        status: 'completed',
        needs_review: true,
        visual_review: { state: 'pending' },
        diff_percentage: index + 0.5,
      },
    ],
  }));
  let server = createServer((req, res) => {
    requests.push(req.url);
    res.setHeader('content-type', 'application/json');

    if (req.url.startsWith('/api/sdk/context/builds/oversized')) {
      res.end(
        JSON.stringify({
          resource: 'build_context',
          build: { id: 'oversized' },
          evidence: {
            items: [],
            page: {
              limit: 10,
              returned: 0,
              total: 0,
              has_more: false,
              next_cursor: null,
            },
          },
          padding: 'x'.repeat(70 * 1024),
        })
      );
      return;
    }

    if (req.url.startsWith('/api/sdk/context/builds/near-limit')) {
      let payload = {
        resource: 'build_context',
        build: { id: 'near-limit' },
        evidence: {
          items: [],
          page: {
            limit: 10,
            returned: 0,
            total: 0,
            has_more: false,
            next_cursor: null,
          },
        },
        padding: '',
      };
      let remainingBytes =
        64 * 1024 - Buffer.byteLength(JSON.stringify(payload)) - 16;
      payload.padding = 'x'.repeat(remainingBytes);
      res.end(JSON.stringify(payload));
      return;
    }

    if (req.url.startsWith('/api/sdk/context/builds/invalid')) {
      res.end(JSON.stringify({ resource: 'build_context' }));
      return;
    }

    if (req.url.startsWith('/api/sdk/context/comparisons/partial')) {
      res.end(
        JSON.stringify({
          resource: 'comparison_context',
          comparison: { id: 'partial' },
          history: {
            similar_by_fingerprint: {
              items: [],
              page: {
                limit: 10,
                returned: 0,
                total: 0,
                has_more: false,
                next_cursor: null,
              },
            },
            recent_by_name: {
              items: [],
              page: {
                limit: 10,
                returned: 0,
                total: null,
                has_more: false,
                next_cursor: null,
              },
            },
          },
        })
      );
      return;
    }

    if (req.url.startsWith('/api/sdk/context/comparisons/')) {
      let comparison = {
        ...comparisons[0],
        diff: undefined,
        analysis: comparisons[0].diff,
      };
      let url = new URL(req.url, 'http://127.0.0.1');
      let compact = url.searchParams.has('details');

      res.end(
        JSON.stringify({
          resource: 'comparison_context',
          scope: {
            organization: { slug: 'acme' },
            project: { slug: 'web', name: 'Web' },
          },
          build: { id: 'build-123', status: 'completed' },
          comparison,
          dynamic_regions: createDynamicRegionResolutionContext(),
          history: compact
            ? {
                similar_by_fingerprint: {
                  items: [comparisons[1]],
                  page: {
                    limit: 10,
                    returned: 1,
                    total: 2,
                    has_more: true,
                    next_cursor: 'similar-page-2',
                  },
                },
                recent_by_name: {
                  items: [comparisons[2]],
                  page: {
                    limit: 10,
                    returned: 1,
                    total: 1,
                    has_more: false,
                    next_cursor: null,
                  },
                },
              }
            : undefined,
        })
      );
      return;
    }

    if (req.url.startsWith('/api/sdk/context/screenshots/')) {
      res.end(
        JSON.stringify({
          resource: 'screenshot_context',
          scope: {
            organization: { slug: 'acme' },
            project: { slug: 'web', name: 'Web' },
          },
          screenshot: { name: 'Screenshot 1' },
          history: { recent_comparisons: [] },
        })
      );
      return;
    }

    if (req.url.startsWith('/api/sdk/context/fingerprints/')) {
      res.end(
        JSON.stringify({
          resource: 'fingerprint_context',
          fingerprint: { hash: 'fingerprint-1' },
          matches: [],
        })
      );
      return;
    }

    if (req.url.startsWith('/api/sdk/context/review-queue')) {
      res.end(
        JSON.stringify({
          resource: 'review_queue_context',
          comparisons: [],
        })
      );
      return;
    }

    let url = new URL(req.url, 'http://127.0.0.1');
    let details = url.searchParams.get('details');
    let cursor = url.searchParams.get('cursor');
    let pageComparisons = cursor
      ? comparisons.slice(10)
      : comparisons.slice(0, 10);
    let evidence = pageComparisons.map(comparison => ({
      ...comparison,
      type: 'comparison',
      diff: {
        ...comparison.diff,
        regions: details === 'diffs' ? comparison.diff.regions : undefined,
      },
    }));

    res.end(
      JSON.stringify({
        resource: 'build_context',
        source: 'local_workspace',
        scope: {
          organization: { slug: 'acme' },
          project: { slug: 'web', name: 'Web' },
        },
        build: { id: 'build-123', status: 'completed' },
        status: { needs_review: true, pending_comparisons: 11 },
        summary: { comparisons: { total: 11, changed: 11 } },
        dynamic_regions: details
          ? diagnosticDynamicRegions
          : completeDynamicRegions,
        evidence: details
          ? {
              items: evidence,
              page: {
                limit: 10,
                returned: evidence.length,
                total: comparisons.length,
                has_more: !cursor,
                next_cursor: cursor ? null : 'build-page-2',
              },
            }
          : undefined,
        groups: details ? undefined : groups,
        comparisons: details ? undefined : comparisons,
      })
    );
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    let address = server.address();
    await callback({
      apiUrl: `http://127.0.0.1:${address.port}`,
      completeDynamicRegions,
      diagnosticDynamicRegions,
      requests,
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

describe('context CLI integration', () => {
  it('reports the resolved API origin when cloud context is unreachable', async () => {
    let server = createServer(request => request.socket.destroy());
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    try {
      let address = server.address();
      let apiUrl = `http://127.0.0.1:${address.port}`;
      let result = await runCLI(
        ['--json', 'context', 'build', 'build-123', '--source', 'cloud'],
        {
          cwd: mkdtempSync(join(tmpdir(), 'vizzly-context-network-')),
          env: {
            VIZZLY_API_URL: apiUrl,
            VIZZLY_TOKEN: 'vzt_test_token',
          },
        }
      );

      assert.strictEqual(result.code, 1);
      let messages = parseJSONOutput(result.stderr);
      assert.ok(
        messages.some(
          message =>
            message.status === 'error' &&
            message.error?.message.includes(
              `Unable to reach Vizzly at ${apiUrl}`
            )
        )
      );
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('returns bounded API-backed agent evidence through the real CLI', async () => {
    await withBuildContextApi(async contextApi => {
      let {
        apiUrl,
        completeDynamicRegions,
        diagnosticDynamicRegions,
        requests,
      } = contextApi;
      let cwd = mkdtempSync(join(tmpdir(), 'vizzly-context-cloud-'));
      let env = {
        VIZZLY_API_URL: apiUrl,
        VIZZLY_TOKEN: 'vzt_test_token',
      };
      let compact = await runCLI(
        ['--json', 'context', 'build', 'build-123', '--agent'],
        { cwd, env }
      );

      assert.strictEqual(compact.code, 0);
      let compactPayload = JSON.parse(compact.stdout).data;
      assert.strictEqual(compactPayload.evidence.page.returned, 10);
      assert.strictEqual(compactPayload.evidence.page.has_more, true);
      assert.strictEqual(compactPayload.source, 'cloud');
      assert.strictEqual(compactPayload.evidence.items[0].id, 'comparison-1');
      assert.strictEqual(
        compactPayload.evidence.items[0].screenshot_name,
        'Screenshot 1'
      );
      assert.deepStrictEqual(
        compactPayload.dynamic_regions,
        diagnosticDynamicRegions
      );
      assert.strictEqual(
        compactPayload.evidence.items[0].screenshot.id,
        'current-1'
      );
      assert.strictEqual(
        compactPayload.evidence.items[0].diff.total_pixels,
        5184000
      );
      assert.strictEqual(
        compactPayload.evidence.items[0].screenshot.url,
        'https://cdn.test/current-1.png'
      );
      assert.strictEqual(
        compactPayload.evidence.items[0].diff.image_url,
        'https://cdn.test/diff-1.png'
      );
      assert.deepStrictEqual(compactPayload.evidence.items[0].diff.artifacts, {
        analysis: {
          available: true,
          schema_version: 2,
          size_bytes: 1024,
          content_encoding: 'gzip',
        },
        diff_mask: {
          evidence_status: 'complete',
          available: true,
          complete: true,
          download_url: '/api/sdk/context/comparisons/comparison-1/diff-mask',
          digest: `sha256:${'a'.repeat(64)}`,
          width: 2880,
          height: 1800,
          pixel_count: 10,
          size_bytes: 2048,
          mime_type: 'image/png',
          honeydiff_version: '0.14.0',
          mask_semantics_version: 'diff-mask-v1',
          capture_identity_hash: 'capture:v2:1',
          render_profile_hash: 'render-profile:v2:shared',
          analysis_contract_hash: 'analysis-contract:v1:shared',
          coordinate_space_version: 'bitmap-top-left-v1',
        },
      });
      assert.ok(!compactPayload.evidence.items[0].diff.regions);
      assert.ok(!compactPayload.groups);
      assert.ok(!compactPayload.next_actions);

      let nextPage = await runCLI(
        [
          '--json',
          'context',
          'build',
          'build-123',
          '--agent',
          '--cursor',
          'build-page-2',
        ],
        { cwd, env }
      );

      assert.strictEqual(nextPage.code, 0);
      let nextPagePayload = JSON.parse(nextPage.stdout).data;
      assert.strictEqual(nextPagePayload.evidence.page.returned, 1);
      assert.strictEqual(nextPagePayload.evidence.page.has_more, false);
      assert.strictEqual(nextPagePayload.evidence.items[0].id, 'comparison-11');

      let withDiffs = await runCLI(
        [
          '--json',
          'context',
          'build',
          'build-123',
          '--agent',
          '--include',
          'diffs',
        ],
        { cwd, env }
      );

      assert.strictEqual(withDiffs.code, 0);
      let diffPayload = JSON.parse(withDiffs.stdout).data;
      assert.deepStrictEqual(diffPayload.evidence.items[0].diff.regions, [
        { x: 10, y: 20, width: 30, height: 40 },
      ]);
      assert.ok(
        !diffPayload.suggested_commands.some(
          command => command.label === 'Load raw diff diagnostics'
        )
      );

      let full = await runCLI(
        ['--json', 'context', 'build', 'build-123', '--agent', '--full'],
        { cwd, env }
      );

      assert.strictEqual(full.code, 0);
      let fullPayload = JSON.parse(full.stdout).data;
      assert.deepStrictEqual(
        fullPayload.dynamic_regions,
        completeDynamicRegions
      );
      assert.deepStrictEqual(requests, [
        '/api/sdk/context/builds/build-123?details=summary&limit=10',
        '/api/sdk/context/builds/build-123?details=summary&limit=10&cursor=build-page-2',
        '/api/sdk/context/builds/build-123?details=diffs&limit=10',
        '/api/sdk/context/builds/build-123',
      ]);
    });
  });

  it('renders the same compact build facts for a human', async () => {
    await withBuildContextApi(async ({ apiUrl, requests }) => {
      let result = await runCLI(
        ['context', 'build', 'build-123', '--source', 'cloud', '--no-color'],
        {
          cwd: mkdtempSync(join(tmpdir(), 'vizzly-context-human-')),
          env: {
            VIZZLY_API_URL: apiUrl,
            VIZZLY_TOKEN: 'vzt_test_token',
          },
        }
      );

      assert.strictEqual(result.code, 0, result.stderr);
      assert.match(result.stdout, /Attention:\s+yes/);
      assert.match(result.stdout, /Evidence:\s+10 of 11 · more available/);
      assert.match(result.stdout, /--cursor build-page-2 --source cloud/);
      assert.ok(!result.stdout.includes('Eyes'));
      assert.ok(!result.stdout.includes('Memory'));
      assert.deepStrictEqual(requests, [
        '/api/sdk/context/builds/build-123?details=summary&limit=10',
      ]);
    });
  });

  it('keeps partial compact comparison facts honest and readable', async () => {
    await withBuildContextApi(async ({ apiUrl }) => {
      let result = await runCLI(
        ['context', 'comparison', 'partial', '--source', 'cloud', '--no-color'],
        {
          cwd: mkdtempSync(join(tmpdir(), 'vizzly-context-partial-')),
          env: {
            VIZZLY_API_URL: apiUrl,
            VIZZLY_TOKEN: 'vzt_test_token',
          },
        }
      );

      assert.strictEqual(result.code, 0, result.stderr);
      assert.match(result.stdout, /@unknown\/unknown/);
      assert.match(result.stdout, /Images:\s+unavailable/);
      assert.match(result.stdout, /Similar history:\s+0 of 0/);
      assert.match(result.stdout, /Recent history:\s+0/);
    });
  });

  it('fails loudly when compact API output breaks its bounds or schema', async () => {
    await withBuildContextApi(async ({ apiUrl }) => {
      let env = {
        VIZZLY_API_URL: apiUrl,
        VIZZLY_TOKEN: 'vzt_test_token',
      };
      let cwd = mkdtempSync(join(tmpdir(), 'vizzly-context-guard-'));
      let oversized = await runCLI(
        ['--json', 'context', 'build', 'oversized', '--agent'],
        { cwd, env }
      );
      let invalid = await runCLI(
        ['--json', 'context', 'build', 'invalid', '--agent'],
        { cwd, env }
      );
      let nearLimit = await runCLI(
        ['--json', 'context', 'build', 'near-limit', '--agent'],
        { cwd, env }
      );

      assert.strictEqual(oversized.code, 1);
      assert.strictEqual(
        JSON.parse(oversized.stderr).error.code,
        'COMPACT_CONTEXT_OVERSIZED'
      );
      assert.strictEqual(invalid.code, 1);
      assert.strictEqual(
        JSON.parse(invalid.stderr).error.code,
        'COMPACT_CONTEXT_INVALID'
      );
      assert.strictEqual(nearLimit.code, 1);
      assert.strictEqual(
        JSON.parse(nearLimit.stderr).error.code,
        'COMPACT_CONTEXT_OVERSIZED'
      );
    });
  });

  it('normalizes focused comparison evidence through the real CLI', async () => {
    await withBuildContextApi(async ({ apiUrl }) => {
      let cwd = mkdtempSync(join(tmpdir(), 'vizzly-context-comparison-'));
      let result = await runCLI(
        [
          '--json',
          'context',
          'comparison',
          'comparison-1',
          '--agent',
          '--source',
          'cloud',
        ],
        {
          cwd,
          env: {
            VIZZLY_API_URL: apiUrl,
            VIZZLY_TOKEN: 'vzt_test_token',
          },
        }
      );

      assert.strictEqual(result.code, 0, result.stderr);
      let payload = JSON.parse(result.stdout).data;
      assert.strictEqual(payload.resource, 'comparison_agent_context');
      assert.strictEqual(payload.comparison.id, 'comparison-1');
      assert.ok(
        payload.suggested_commands.some(command =>
          command.command.includes(
            'context comparison comparison-1 --agent --include diffs --source cloud'
          )
        )
      );
      assert.deepStrictEqual(payload.comparison.analysis.regions, [
        { x: 10, y: 20, width: 30, height: 40 },
      ]);
      assert.deepStrictEqual(payload.comparison.analysis.artifacts.diff_mask, {
        evidence_status: 'complete',
        available: true,
        complete: true,
        download_url: '/api/sdk/context/comparisons/comparison-1/diff-mask',
        digest: `sha256:${'a'.repeat(64)}`,
        width: 2880,
        height: 1800,
        pixel_count: 10,
        size_bytes: 2048,
        mime_type: 'image/png',
        honeydiff_version: '0.14.0',
        mask_semantics_version: 'diff-mask-v1',
        capture_identity_hash: 'capture:v2:1',
        render_profile_hash: 'render-profile:v2:shared',
        analysis_contract_hash: 'analysis-contract:v1:shared',
        coordinate_space_version: 'bitmap-top-left-v1',
      });
      assert.deepStrictEqual(
        payload.dynamic_regions,
        createDynamicRegionResolutionContext()
      );

      let withDiffs = await runCLI(
        [
          '--json',
          'context',
          'comparison',
          'comparison-1',
          '--agent',
          '--source',
          'cloud',
          '--include',
          'diffs',
        ],
        {
          cwd,
          env: {
            VIZZLY_API_URL: apiUrl,
            VIZZLY_TOKEN: 'vzt_test_token',
          },
        }
      );
      let withDiffsPayload = JSON.parse(withDiffs.stdout).data;
      assert.ok(
        withDiffsPayload.suggested_commands.some(command =>
          command.command.includes(
            '--cursor similar-page-2 --include diffs --source cloud'
          )
        )
      );
      assert.ok(
        !withDiffsPayload.suggested_commands.some(
          command => command.label === 'Load raw diff diagnostics'
        )
      );

      let full = await runCLI(
        [
          '--json',
          'context',
          'comparison',
          'comparison-1',
          '--agent',
          '--source',
          'cloud',
          '--full',
        ],
        {
          cwd,
          env: {
            VIZZLY_API_URL: apiUrl,
            VIZZLY_TOKEN: 'vzt_test_token',
          },
        }
      );
      let fullPayload = JSON.parse(full.stdout).data;
      assert.strictEqual(fullPayload.resource, 'comparison_context');
      assert.ok(!fullPayload.suggested_commands);
      assert.strictEqual(fullPayload.comparison.analysis.regions.length, 1);
    });
  });

  it('labels every cloud context resource with its selected source', async () => {
    await withBuildContextApi(async ({ apiUrl }) => {
      let cwd = mkdtempSync(join(tmpdir(), 'vizzly-context-provenance-'));
      let env = {
        VIZZLY_API_URL: apiUrl,
        VIZZLY_TOKEN: 'vzt_test_token',
      };
      let commands = [
        ['comparison', 'comparison-1'],
        ['screenshot', 'Screenshot 1'],
        ['similar', 'fingerprint-1'],
        ['review-queue'],
      ];

      for (let command of commands) {
        let result = await runCLI(
          ['--json', 'context', ...command, '--source', 'cloud'],
          { cwd, env }
        );

        assert.strictEqual(result.code, 0, result.stderr);
        let payload = JSON.parse(result.stdout).data;
        assert.strictEqual(payload.source, 'cloud');
      }
    });
  });

  it('renders human screenshot context from review evidence', async () => {
    await withBuildContextApi(async ({ apiUrl }) => {
      let cwd = mkdtempSync(join(tmpdir(), 'vizzly-context-human-'));
      let result = await runCLI(
        [
          '--no-color',
          'context',
          'screenshot',
          'Screenshot 1',
          '--source',
          'cloud',
        ],
        {
          cwd,
          env: {
            VIZZLY_API_URL: apiUrl,
            VIZZLY_TOKEN: 'vzt_test_token',
          },
        }
      );

      assert.strictEqual(result.code, 0, result.stderr);
      assert.match(result.stdout, /Memory:\s+0 recent comparisons/);
      assert.doesNotMatch(result.stdout, /Hotspots|Known Regions/);
    });
  });

  it('does not let a cloud session relabel stale local evidence', async () => {
    await withBuildContextApi(async ({ apiUrl, requests }) => {
      let cwd = mkdtempSync(join(tmpdir(), 'vizzly-context-mixed-source-'));
      let vizzlyDir = join(cwd, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });
      writeFileSync(
        join(vizzlyDir, 'session.json'),
        JSON.stringify({
          buildId: 'build-123',
          branch: 'main',
          commit: 'abc123',
          createdAt: '2026-07-22T00:00:00.000Z',
        })
      );
      writeFileSync(
        join(vizzlyDir, 'report-data.json'),
        JSON.stringify({
          comparisons: [
            {
              id: 'stale-local-comparison',
              name: 'Old local screenshot',
              status: 'failed',
              current: '/images/current/old.png',
            },
          ],
        })
      );

      let result = await runCLI(
        ['--json', 'context', 'build', 'build-123', '--agent'],
        {
          cwd,
          env: {
            VIZZLY_API_URL: apiUrl,
            VIZZLY_TOKEN: 'vzt_test_token',
          },
        }
      );

      assert.strictEqual(result.code, 0, result.stderr);
      let payload = JSON.parse(result.stdout).data;
      assert.strictEqual(payload.source, 'cloud');
      assert.strictEqual(payload.build.id, 'build-123');
      assert.strictEqual(payload.evidence.items[0].id, 'comparison-1');
      assert.deepStrictEqual(requests, [
        '/api/sdk/context/builds/build-123?details=summary&limit=10',
      ]);
    });
  });

  it('treats root-level --json as a flag before the context command', async () => {
    let result = await runCLI(['--json', 'context', 'build', 'build-123']);

    assert.notStrictEqual(result.code, 0);
    assert.ok(!result.stderr.includes("unknown command 'build'"));
    assert.ok(result.stderr.includes('vizzly login'));
  });

  it('reads local build context without requiring an API token', async () => {
    let cwd = createWorkspaceFixture();
    let vizzlyHome = join(cwd, '.vizzly-home');
    mkdirSync(vizzlyHome, { recursive: true });

    let result = await runCLI(
      ['--json', 'context', 'build', 'current', '--source', 'local', '--agent'],
      {
        cwd,
        env: {
          VIZZLY_HOME: vizzlyHome,
        },
      }
    );

    assert.strictEqual(result.code, 0);
    let parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.status, 'data');
    assert.strictEqual(parsed.data.source, 'local_workspace');
    assert.strictEqual(parsed.data.build.id, 'local-build-1');
    assert.ok(
      parsed.data.suggested_commands.every(item =>
        item.command.endsWith('--source local')
      )
    );
  });

  it('auto-selects local screenshot context when local evidence is available', async () => {
    let cwd = createWorkspaceFixture();
    let vizzlyHome = join(cwd, '.vizzly-home');
    mkdirSync(vizzlyHome, { recursive: true });

    let result = await runCLI(
      ['--json', 'context', 'screenshot', 'Settings Panel'],
      {
        cwd,
        env: {
          VIZZLY_HOME: vizzlyHome,
        },
      }
    );

    assert.strictEqual(result.code, 0);
    let parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.data.source, 'local_workspace');
    assert.strictEqual(parsed.data.screenshot.name, 'Settings Panel');
    assert.strictEqual(parsed.data.history.recent_comparisons.length, 1);
  });

  it('reads local comparison context with diff memory details', async () => {
    let cwd = createWorkspaceFixture();
    let vizzlyHome = join(cwd, '.vizzly-home');
    mkdirSync(vizzlyHome, { recursive: true });

    let result = await runCLI(
      ['--json', 'context', 'comparison', 'comp-settings', '--source', 'local'],
      {
        cwd,
        env: {
          VIZZLY_HOME: vizzlyHome,
        },
      }
    );

    assert.strictEqual(result.code, 0);
    let parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.data.source, 'local_workspace');
    assert.strictEqual(parsed.data.comparison.id, 'comp-settings');
    assert.strictEqual(parsed.data.comparison.analysis.diff_regions.length, 1);
  });

  it('treats local review queue as unresolved local diffs', async () => {
    let cwd = createWorkspaceFixture();
    let vizzlyHome = join(cwd, '.vizzly-home');
    mkdirSync(vizzlyHome, { recursive: true });

    let result = await runCLI(
      ['--json', 'context', 'review-queue', '--source', 'local'],
      {
        cwd,
        env: {
          VIZZLY_HOME: vizzlyHome,
        },
      }
    );

    assert.strictEqual(result.code, 0);
    let parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.data.source, 'local_workspace');
    assert.strictEqual(parsed.data.summary.total, 2);
    assert.strictEqual(parsed.data.summary.changed, 1);
    assert.strictEqual(parsed.data.summary.new, 1);
  });

  it('fails clearly when local fingerprint similarity is requested', async () => {
    let cwd = createWorkspaceFixture();
    let vizzlyHome = join(cwd, '.vizzly-home');
    mkdirSync(vizzlyHome, { recursive: true });

    let result = await runCLI(
      ['context', 'similar', 'fp-settings', '--source', 'local'],
      {
        cwd,
        env: {
          VIZZLY_HOME: vizzlyHome,
        },
      }
    );

    assert.notStrictEqual(result.code, 0);
    assert.ok(
      result.stderr.includes(
        'Local workspace context does not support fingerprint similarity yet'
      )
    );
  });
});
