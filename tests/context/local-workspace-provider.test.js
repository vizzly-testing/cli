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
});
