import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  buildTddDependencyOps,
  resolveTddPaths,
  resolveTddWorkingDirectory,
} from '../../src/tdd/runtime-context.js';

describe('tdd/runtime-context', () => {
  it('merges grouped dependencies with defaults', () => {
    let defaults = {
      output: { info: () => {} },
      colors: { green: s => s },
      validatePathSecurity: path => path,
      initializeDirectories: () => ({}),
      calculateHotspotCoverage: () => ({}),
      fs: { existsSync: () => false, readFileSync: () => Buffer.from('x') },
      api: { createApiClient: () => ({}) },
      metadata: { loadBaselineMetadata: () => null },
      baseline: { baselineExists: () => false },
      comparison: { compareImages: async () => ({}) },
      signature: { generateComparisonId: sig => sig },
      results: { buildResults: () => ({ total: 0 }) },
    };
    let customCreateApiClient = () => ({ custom: true });
    let customExistsSync = () => true;

    let { runtimeDeps, apiOps } = buildTddDependencyOps(
      {
        fs: { existsSync: customExistsSync },
        api: { createApiClient: customCreateApiClient },
      },
      defaults
    );

    assert.strictEqual(runtimeDeps.existsSync, customExistsSync);
    assert.strictEqual(runtimeDeps.createApiClient, customCreateApiClient);
    assert.strictEqual(
      runtimeDeps.loadBaselineMetadata,
      defaults.metadata.loadBaselineMetadata
    );
    assert.strictEqual(apiOps.createApiClient, customCreateApiClient);
  });

  it('returns validated working directory when path is valid', () => {
    let output = { error: () => {} };
    let validated = resolveTddWorkingDirectory(
      '/tmp/work',
      path => path,
      output
    );

    assert.strictEqual(validated, '/tmp/work');
  });

  it('logs and throws when working directory validation fails', () => {
    let logged = null;
    let output = { error: message => (logged = message) };

    assert.throws(
      () =>
        resolveTddWorkingDirectory(
          '/tmp/work',
          () => {
            throw new Error('bad path');
          },
          output
        ),
      /Working directory validation failed: bad path/
    );
    assert.strictEqual(logged, 'Invalid working directory: bad path');
  });

  it('delegates path initialization', () => {
    let paths = resolveTddPaths('/tmp/work', dir => ({
      baselinePath: `${dir}/.vizzly/baselines`,
      currentPath: `${dir}/.vizzly/current`,
      diffPath: `${dir}/.vizzly/diffs`,
    }));

    assert.strictEqual(paths.baselinePath, '/tmp/work/.vizzly/baselines');
    assert.strictEqual(paths.currentPath, '/tmp/work/.vizzly/current');
    assert.strictEqual(paths.diffPath, '/tmp/work/.vizzly/diffs');
  });
});
