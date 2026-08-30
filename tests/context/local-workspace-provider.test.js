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

    assert.strictEqual(readCount, 4);
  });

  it('does not treat a cloud session as local evidence', () => {
    let projectRoot = '/tmp/vizzly-cloud-session-only';
    let paths = createWorkspacePaths(projectRoot);
    let provider = createLocalWorkspaceContextProvider(
      { projectRoot },
      {
        readJsonIfExists: path => {
          if (path === paths.session) {
            return {
              buildId: 'cloud-build',
              branch: 'main',
              commit: 'abc123',
            };
          }

          return null;
        },
      }
    );

    assert.strictEqual(provider.isAvailable(), false);
    assert.strictEqual(provider.canHandle('build', 'cloud-build'), false);
  });

  it('keeps stale local report evidence separate from a cloud session', () => {
    let projectRoot = '/tmp/vizzly-cloud-session-with-local-report';
    let paths = createWorkspacePaths(projectRoot);
    let provider = createLocalWorkspaceContextProvider(
      { projectRoot },
      {
        readJsonIfExists: path => {
          if (path === paths.session) {
            return {
              buildId: 'cloud-build',
              branch: 'main',
              commit: 'abc123',
            };
          }

          if (path === paths.report) {
            return {
              comparisons: [
                {
                  id: 'stale-local-comparison',
                  name: 'Old local screenshot',
                  status: 'failed',
                  current: '/images/current/old.png',
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
    assert.strictEqual(provider.canHandle('build', 'cloud-build'), false);
    assert.strictEqual(provider.canHandle('build', 'current'), true);

    let context = provider.getBuildContext('current');
    assert.strictEqual(context.build.id, 'local-workspace');
    assert.strictEqual(context.build.branch, 'local');
    assert.strictEqual(context.build.commit_sha, null);
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

  it('exposes the static report URL when a local report exists', () => {
    let projectRoot = '/tmp/vizzly-local-report';
    let paths = createWorkspacePaths(projectRoot);
    let reportHtmlPath = join(projectRoot, '.vizzly', 'report', 'index.html');

    let provider = createLocalWorkspaceContextProvider(
      { projectRoot },
      {
        existsSync: path => path === reportHtmlPath,
        readJsonIfExists: path => {
          if (path === paths.report) {
            return {
              comparisons: [
                {
                  id: 'comp-1',
                  name: 'Dashboard',
                  originalName: 'Dashboard',
                  status: 'passed',
                  current: '/images/current/dashboard.png',
                  baseline: '/images/baselines/dashboard.png',
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

    let context = provider.getBuildContext('current');

    assert.strictEqual(
      context.links.report_url,
      'file:///tmp/vizzly-local-report/.vizzly/report/index.html'
    );
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

  it('pages bounded local context and keeps cursors tied to their target', () => {
    let projectRoot = '/tmp/vizzly-local-compact-context';
    let paths = createWorkspacePaths(projectRoot);
    let comparisons = Array.from({ length: 12 }, (_, index) => ({
      id: `comp-${index}`,
      name: 'Dashboard',
      originalName: 'Dashboard',
      status: 'failed',
      current: `/images/current/${index}.png`,
      baseline: `/images/baselines/${index}.png`,
      diff: `/images/diffs/${index}.png`,
      diffPercentage: index + 0.5,
      properties: { browser: 'chrome' },
    }));
    let comparisonDetails = Object.fromEntries(
      comparisons.map(comparison => [
        comparison.id,
        { diffClusters: [{ x: 1, y: 2, width: 3, height: 4 }] },
      ])
    );
    let provider = createLocalWorkspaceContextProvider(
      { projectRoot },
      {
        readJsonIfExists: path => {
          if (path === paths.report) {
            return { timestamp: 1234, comparisons };
          }
          if (path === paths.comparisonDetails) return comparisonDetails;
          return null;
        },
      }
    );

    let buildSummary = provider.getBuildContext('current', {
      details: 'summary',
      limit: 10,
    });
    assert.strictEqual(buildSummary.evidence.items.length, 10);
    assert.strictEqual(buildSummary.evidence.page.has_more, true);
    assert.ok(!buildSummary.evidence.items[0].diff.regions);
    assert.strictEqual(buildSummary.preview, null);
    assert.deepStrictEqual(buildSummary.signature_properties, []);
    assert.strictEqual(buildSummary.comments.build.total, 0);

    let nextBuildPage = provider.getBuildContext('current', {
      details: 'summary',
      limit: 10,
      cursor: buildSummary.evidence.page.next_cursor,
    });
    assert.deepStrictEqual(
      nextBuildPage.evidence.items.map(item => item.id),
      ['comp-10', 'comp-11']
    );

    let buildDiffs = provider.getBuildContext('current', {
      details: 'diffs',
      limit: 10,
    });
    assert.strictEqual(buildDiffs.evidence.items[0].diff.regions.length, 1);
    assert.throws(
      () =>
        provider.getBuildContext('current', {
          details: 'diffs',
          limit: 10,
          cursor: buildSummary.evidence.page.next_cursor,
        }),
      /cursor is invalid|results changed/
    );

    let comparisonSummary = provider.getComparisonContext('comp-0', {
      details: 'summary',
      limit: 10,
    });
    assert.ok(!comparisonSummary.comparison.analysis.diff_regions);
    assert.ok(!comparisonSummary.history.recent_by_name.items[0].analysis);
    assert.strictEqual(
      comparisonSummary.history.recent_by_name.page.has_more,
      true
    );
    assert.strictEqual(comparisonSummary.details, 'summary');
    assert.strictEqual(comparisonSummary.history.active_stream, null);
    assert.deepStrictEqual(comparisonSummary.signature_properties, []);
    assert.ok(!Object.hasOwn(comparisonSummary, 'dynamic_regions'));

    let comparisonDiffs = provider.getComparisonContext('comp-0', {
      details: 'diffs',
      limit: 10,
    });
    assert.strictEqual(
      comparisonDiffs.comparison.analysis.diff_regions.length,
      1
    );

    assert.throws(
      () =>
        provider.getComparisonContext('comp-1', {
          details: 'summary',
          limit: 10,
          cursor: comparisonSummary.history.recent_by_name.page.next_cursor,
        }),
      /cursor is invalid|results changed/
    );
  });

  it('invalidates a cursor when local evidence changes without a new timestamp', () => {
    let projectRoot = '/tmp/vizzly-local-changing-context';
    let paths = createWorkspacePaths(projectRoot);
    let revision = 1;
    let readJsonIfExists = path => {
      if (path === paths.report) {
        return {
          timestamp: 1234,
          comparisons: Array.from({ length: 11 }, (_, index) => ({
            id: `comp-${index}`,
            name: `Screenshot ${index}`,
            status: index === 0 && revision === 2 ? 'passed' : 'failed',
            properties: {},
          })),
        };
      }
      if (path === paths.comparisonDetails) return {};
      return null;
    };
    let firstProvider = createLocalWorkspaceContextProvider(
      { projectRoot },
      { readJsonIfExists }
    );
    let firstPage = firstProvider.getBuildContext('current', {
      details: 'summary',
      limit: 10,
    });

    revision = 2;
    let changedProvider = createLocalWorkspaceContextProvider(
      { projectRoot },
      { readJsonIfExists }
    );

    assert.throws(
      () =>
        changedProvider.getBuildContext('current', {
          details: 'summary',
          limit: 10,
          cursor: firstPage.evidence.page.next_cursor,
        }),
      /cursor is invalid|results changed/
    );
  });
});
