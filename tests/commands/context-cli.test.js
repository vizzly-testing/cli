import assert from 'node:assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseJSONOutput, runCLI } from '../helpers/cli-runner.js';

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
      projection: { clusters: { count: 1 } },
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

    if (req.url.startsWith('/api/sdk/context/comparisons/')) {
      let comparison = {
        ...comparisons[0],
        diff: undefined,
        analysis: comparisons[0].diff,
      };

      res.end(
        JSON.stringify({
          resource: 'comparison_context',
          review_flow: 'legacy',
          comparison,
        })
      );
      return;
    }

    if (req.url.startsWith('/api/sdk/context/screenshots/')) {
      res.end(
        JSON.stringify({
          resource: 'screenshot_context',
          review_flow: 'legacy',
          screenshot: { name: 'Screenshot 1' },
        })
      );
      return;
    }

    if (req.url.startsWith('/api/sdk/context/fingerprints/')) {
      res.end(
        JSON.stringify({
          resource: 'fingerprint_context',
          review_flow: 'legacy',
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
          review_flow: 'legacy',
          comparisons: [],
        })
      );
      return;
    }

    res.end(
      JSON.stringify({
        resource: 'build_context',
        review_flow: 'legacy',
        scope: {
          organization: { slug: 'acme' },
          project: { slug: 'web', name: 'Web' },
        },
        build: { id: 'build-123', status: 'completed' },
        status: { needs_review: true, pending_comparisons: 11 },
        summary: { comparisons: { total: 11, changed: 11 } },
        groups,
        comparisons,
      })
    );
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  try {
    let address = server.address();
    await callback({
      apiUrl: `http://127.0.0.1:${address.port}`,
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
    await withBuildContextApi(async ({ apiUrl, requests }) => {
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
      assert.strictEqual(compactPayload.evidence_returned, 10);
      assert.strictEqual(compactPayload.evidence_truncated, true);
      assert.strictEqual(compactPayload.source, 'cloud');
      assert.strictEqual(compactPayload.review_flow, 'legacy');
      assert.strictEqual(compactPayload.evidence[0].review_state, 'pending');
      assert.strictEqual(compactPayload.evidence[0].id, 'comparison-1');
      assert.strictEqual(compactPayload.evidence[0].name, 'Screenshot 1');
      assert.strictEqual(compactPayload.evidence[0].is_flaky, false);
      assert.strictEqual(compactPayload.evidence[0].screenshot.id, 'current-1');
      assert.strictEqual(compactPayload.evidence[0].baseline.id, 'baseline-1');
      assert.strictEqual(compactPayload.evidence[0].diff.total_pixels, 5184000);
      assert.strictEqual(
        compactPayload.evidence[0].screenshot.url,
        'https://cdn.test/current-1.png'
      );
      assert.strictEqual(
        compactPayload.evidence[0].diff.image_url,
        'https://cdn.test/diff-1.png'
      );
      assert.deepStrictEqual(compactPayload.evidence[0].diff.artifacts, {
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
      assert.ok(!compactPayload.evidence[0].diff.regions);
      assert.ok(!compactPayload.groups);
      assert.ok(!compactPayload.next_actions);

      let nextPage = await runCLI(
        [
          '--json',
          'context',
          'build',
          'build-123',
          '--agent',
          '--offset',
          '10',
        ],
        { cwd, env }
      );

      assert.strictEqual(nextPage.code, 0);
      let nextPagePayload = JSON.parse(nextPage.stdout).data;
      assert.strictEqual(nextPagePayload.evidence_offset, 10);
      assert.strictEqual(nextPagePayload.evidence_returned, 1);
      assert.strictEqual(nextPagePayload.evidence_has_more, false);
      assert.strictEqual(nextPagePayload.evidence[0].id, 'comparison-11');

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
      assert.deepStrictEqual(diffPayload.evidence[0].diff.regions, [
        { x: 10, y: 20, width: 30, height: 40 },
      ]);
      assert.deepStrictEqual(requests, [
        '/api/sdk/context/builds/build-123?details=summary',
        '/api/sdk/context/builds/build-123?details=summary',
        '/api/sdk/context/builds/build-123?details=diffs',
      ]);
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
      assert.deepStrictEqual(payload.comparison.diff.regions, [
        { x: 10, y: 20, width: 30, height: 40 },
      ]);
      assert.deepStrictEqual(payload.comparison.diff.artifacts.diff_mask, {
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
        assert.strictEqual(payload.review_flow, 'legacy');
      }
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
      assert.strictEqual(payload.evidence[0].id, 'comparison-1');
      assert.deepStrictEqual(requests, [
        '/api/sdk/context/builds/build-123?details=summary',
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
    assert.strictEqual(
      parsed.data.confirmed_regions[0].label,
      'Known settings header band'
    );
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
    assert.strictEqual(
      parsed.data.comparison.analysis.hotspot_analysis.confidence,
      'high'
    );
    assert.strictEqual(
      parsed.data.history.confirmed_regions[0].label,
      'Known settings header band'
    );
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
