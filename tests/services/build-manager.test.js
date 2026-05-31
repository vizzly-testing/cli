import assert from 'node:assert';
import { describe, it } from 'node:test';
import { createBuildObject } from '../../src/services/build-manager.js';

describe('services/build-manager', () => {
  describe('createBuildObject', () => {
    it('creates the local build shape used by the runner', () => {
      let build = createBuildObject(
        {
          name: 'Test Build',
          branch: 'main',
          commit: 'abc123',
          message: 'Test commit',
          parallelId: 'parallel-1',
          metadata: { ci: true },
        },
        {
          randomId: () => 'local-id',
          now: () => '2026-05-18T12:00:00.000Z',
        }
      );

      assert.deepStrictEqual(build, {
        id: 'build-local-id',
        name: 'Test Build',
        branch: 'main',
        commit: 'abc123',
        message: 'Test commit',
        environment: 'test',
        parallelId: 'parallel-1',
        metadata: { ci: true },
        status: 'pending',
        createdAt: '2026-05-18T12:00:00.000Z',
        screenshots: [],
      });
    });

    it('keeps existing default behavior for callers with minimal options', () => {
      let build = createBuildObject(
        { branch: 'main' },
        {
          randomId: () => 'minimal-id',
          now: () => '2026-05-18T12:00:00.000Z',
          timestamp: () => 1779120000000,
        }
      );

      assert.strictEqual(build.id, 'build-minimal-id');
      assert.strictEqual(build.name, 'build-1779120000000');
      assert.strictEqual(build.branch, 'main');
      assert.strictEqual(build.environment, 'test');
      assert.deepStrictEqual(build.metadata, {});
    });

    it('uses buildName as the name fallback', () => {
      let build = createBuildObject(
        { buildName: 'Fallback Build' },
        {
          randomId: () => 'fallback-id',
          now: () => '2026-05-18T12:00:00.000Z',
        }
      );

      assert.strictEqual(build.name, 'Fallback Build');
    });
  });
});
