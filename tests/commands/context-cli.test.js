import assert from 'node:assert';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { runCLI } from '../helpers/cli-runner.js';

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
        needs_review: true,
        visual_review: { state: 'pending' },
        current_screenshot: {
          id: `current-${index + 1}`,
          name: `Screenshot ${index + 1}`,
          browser: 'chrome',
          viewport: { width: 1440, height: 900 },
          bitmap: { width: 2880, height: 1800 },
          metadata: { locale: 'en-US' },
          signature: `Screenshot ${index + 1}|1440|chrome`,
          url: `https://cdn.test/current-${index + 1}.png`,
        },
        baseline_screenshot: {
          id: `baseline-${index + 1}`,
          build_id: 'baseline-build',
          url: `https://cdn.test/baseline-${index + 1}.png`,
        },
        analysis: {
          diff_image_url: `https://cdn.test/diff-${index + 1}.png`,
          fingerprint_hash: `fingerprint-${index + 1}`,
          projection: { clusters: { count: 1 } },
          diff_regions: [{ x: 10, y: 20, width: 30, height: 40 }],
        },
      },
    ],
  }));
  let server = createServer((req, res) => {
    requests.push(req.url);
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        resource: 'build_context',
        source: 'cloud',
        scope: {
          organization: { slug: 'acme' },
          project: { slug: 'web', name: 'Web' },
        },
        build: { id: 'build-123', status: 'completed' },
        status: { needs_review: true, pending_comparisons: 11 },
        summary: { comparisons: { total: 11, changed: 11 } },
        groups,
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
      assert.strictEqual(compactPayload.evidence[0].review_state, 'pending');
      assert.strictEqual(
        compactPayload.evidence[0].screenshot.url,
        'https://cdn.test/current-1.png'
      );
      assert.strictEqual(
        compactPayload.evidence[0].diff.image_url,
        'https://cdn.test/diff-1.png'
      );
      assert.ok(!compactPayload.evidence[0].diff.regions);
      assert.ok(!compactPayload.groups);
      assert.ok(!compactPayload.next_actions);

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
        '/api/sdk/context/builds/build-123?details=diffs',
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
      ['--json', 'context', 'build', 'current', '--source', 'local'],
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
  });

  it('auto-selects local screenshot context when a workspace session is active', async () => {
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
