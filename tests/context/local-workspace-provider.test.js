import assert from 'node:assert';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { createLocalWorkspaceContextProvider } from '../../src/context/local-workspace-provider.js';

function createWorkspacePaths(projectRoot) {
  let vizzlyDir = join(projectRoot, '.vizzly');

  return {
    server: join(vizzlyDir, 'server.json'),
    session: join(vizzlyDir, 'session.json'),
    report: join(vizzlyDir, 'report-data.json'),
    comparisonDetails: join(vizzlyDir, 'comparison-details.json'),
    baselineMetadata: join(vizzlyDir, 'baselines', 'metadata.json'),
    hotspots: join(vizzlyDir, 'hotspots.json'),
    regions: join(vizzlyDir, 'regions.json'),
  };
}

describe('context/local-workspace-provider', () => {
  it('preserves absolute asset paths in local comparison context', () => {
    let projectRoot = '/tmp/vizzly-local-workspace';
    let paths = createWorkspacePaths(projectRoot);
    let absoluteCurrent = join(projectRoot, 'artifacts', 'current.png');

    let provider = createLocalWorkspaceContextProvider(
      { projectRoot },
      {
        readJsonIfExists: path => {
          if (path === paths.report) {
            return {
              comparisons: [
                {
                  id: 'comp-1',
                  name: 'Dashboard',
                  originalName: 'Dashboard',
                  status: 'failed',
                  current: absoluteCurrent,
                  baseline: join(projectRoot, 'artifacts', 'baseline.png'),
                  diff: join(projectRoot, 'artifacts', 'diff.png'),
                  properties: {},
                },
              ],
            };
          }

          if (path === paths.comparisonDetails) {
            return {};
          }

          return null;
        },
      }
    );

    let context = provider.getComparisonContext('comp-1');

    assert.strictEqual(
      context.comparison.screenshot.original_url,
      absoluteCurrent
    );
  });

  it('resolves dashboard image URLs to local files when no server is running', () => {
    let projectRoot = '/tmp/vizzly-local-files';
    let paths = createWorkspacePaths(projectRoot);

    let provider = createLocalWorkspaceContextProvider(
      { projectRoot },
      {
        readJsonIfExists: path => {
          if (path === paths.report) {
            return {
              comparisons: [
                {
                  id: 'comp-1',
                  name: 'Dashboard',
                  originalName: 'Dashboard',
                  status: 'failed',
                  current: '/images/current/dashboard.png',
                  baseline: '/images/baselines/dashboard.png',
                  diff: '/images/diffs/dashboard.png',
                  properties: {},
                },
              ],
            };
          }

          if (path === paths.comparisonDetails) {
            return {};
          }

          return null;
        },
      }
    );

    let context = provider.getComparisonContext('comp-1');

    assert.strictEqual(
      context.comparison.diff.image_url,
      join(projectRoot, '.vizzly', 'diffs', 'dashboard.png')
    );
    assert.strictEqual(
      context.comparison.screenshot.original_url,
      join(projectRoot, '.vizzly', 'current', 'dashboard.png')
    );
  });

  it('reuses one snapshot across availability and lookup calls', () => {
    let projectRoot = '/tmp/vizzly-local-cache';
    let paths = createWorkspacePaths(projectRoot);
    let readCount = 0;

    let provider = createLocalWorkspaceContextProvider(
      { projectRoot },
      {
        readJsonIfExists: path => {
          readCount += 1;

          if (path === paths.server) {
            return { port: 47392, buildId: 'local-build' };
          }

          if (path === paths.report) {
            return {
              comparisons: [
                {
                  id: 'comp-1',
                  name: 'Dashboard',
                  originalName: 'Dashboard',
                  status: 'failed',
                  current: '/images/current/dashboard.png',
                  baseline: null,
                  diff: null,
                  properties: {},
                },
              ],
            };
          }

          if (path === paths.comparisonDetails) {
            return {};
          }

          return null;
        },
      }
    );

    assert.strictEqual(provider.isAvailable(), true);
    assert.strictEqual(provider.canHandle('comparison', 'comp-1'), true);
    provider.getBuildContext('local-build');

    assert.strictEqual(readCount, 7);
  });

  it('caps the default local review queue size', () => {
    let projectRoot = '/tmp/vizzly-local-review-queue';
    let paths = createWorkspacePaths(projectRoot);
    let comparisons = Array.from({ length: 80 }, (_, index) => ({
      id: `comp-${index}`,
      name: `Screenshot ${index}`,
      originalName: `Screenshot ${index}`,
      status: 'failed',
      current: `/images/current/${index}.png`,
      baseline: null,
      diff: null,
      properties: {},
    }));

    let provider = createLocalWorkspaceContextProvider(
      { projectRoot },
      {
        readJsonIfExists: path => {
          if (path === paths.report) {
            return { comparisons };
          }

          if (path === paths.comparisonDetails) {
            return {};
          }

          return null;
        },
      }
    );

    let context = provider.getReviewQueueContext();

    assert.strictEqual(context.summary.total, 80);
    assert.strictEqual(context.comparisons.length, 50);
  });

  it('exposes local baseline truth and review status in build context', () => {
    let projectRoot = '/tmp/vizzly-local-baseline-context';
    let paths = createWorkspacePaths(projectRoot);

    let provider = createLocalWorkspaceContextProvider(
      { projectRoot },
      {
        readJsonIfExists: path => {
          if (path === paths.report) {
            return {
              comparisons: [
                {
                  id: 'comp-1',
                  name: 'Dashboard',
                  originalName: 'Dashboard',
                  status: 'failed',
                  current: '/images/current/dashboard.png',
                  baseline: '/images/baselines/dashboard.png',
                  diff: '/images/diffs/dashboard.png',
                  diffPercentage: 1.2,
                  properties: {
                    browser: 'firefox',
                    viewport_width: 1440,
                    viewport_height: 900,
                  },
                },
              ],
            };
          }

          if (path === paths.baselineMetadata) {
            return {
              buildId: 'approved-main',
              buildName: 'Approved Main',
              branch: 'main',
              createdAt: '2026-05-20T12:00:00Z',
              buildInfo: {
                commitSha: 'abc123',
                approvalStatus: 'approved',
                completedAt: '2026-05-20T12:01:00Z',
              },
            };
          }

          if (path === paths.comparisonDetails) {
            return {
              'comp-1': {
                diffClusters: [
                  {
                    pixelCount: 42,
                    boundingBox: { x: 10, y: 20, width: 30, height: 40 },
                  },
                ],
              },
            };
          }

          return null;
        },
      }
    );

    let context = provider.getBuildContext('current');

    assert.strictEqual(context.baseline.selected.id, 'approved-main');
    assert.strictEqual(context.baseline.selected.approval_status, 'approved');
    assert.strictEqual(context.status.needs_review, true);
    assert.strictEqual(context.status.pending_comparisons, 1);
    assert.strictEqual(
      context.screenshots[0].baseline.build_id,
      'approved-main'
    );
    assert.strictEqual(context.comparisons[0].needs_review, true);
    assert.strictEqual(context.comparisons[0].diff.regions.length, 1);
  });
});
