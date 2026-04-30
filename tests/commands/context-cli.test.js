import assert from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
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

describe('context CLI integration', () => {
  it('treats root-level --json as a flag before the context command', async () => {
    let result = await runCLI(['--json', 'context', 'build', 'build-123']);

    assert.notStrictEqual(result.code, 0);
    assert.ok(!result.stderr.includes("unknown command 'build'"));
    assert.ok(result.stderr.includes('API token required'));
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
