import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  addScreenshotToBuild,
  createBuildObject,
  createQueuedBuild,
  finalizeBuildObject,
  generateBuildId,
  updateBuild,
  validateBuildOptions,
} from '../../src/services/build-manager.js';

describe('services/build-manager', () => {
  describe('generateBuildId', () => {
    it('generates a unique build ID with prefix', () => {
      let id = generateBuildId();

      assert.ok(id.startsWith('build-'));
      assert.ok(id.length > 10);
    });

    it('generates different IDs on each call', () => {
      let id1 = generateBuildId();
      let id2 = generateBuildId();

      assert.notStrictEqual(id1, id2);
    });
  });

  describe('createBuildObject', () => {
    it('creates build with required fields', () => {
      let build = createBuildObject({
        name: 'Test Build',
        branch: 'main',
        commit: 'abc123',
      });

      assert.ok(build.id.startsWith('build-'));
      assert.strictEqual(build.name, 'Test Build');
      assert.strictEqual(build.branch, 'main');
      assert.strictEqual(build.commit, 'abc123');
      assert.strictEqual(build.environment, 'test');
      assert.deepStrictEqual(build.metadata, {});
      assert.strictEqual(build.status, 'pending');
      assert.ok(build.createdAt);
      assert.deepStrictEqual(build.screenshots, []);
    });

    it('uses default name when not provided', () => {
      let build = createBuildObject({ branch: 'main' });

      assert.ok(build.name.startsWith('build-'));
    });

    it('uses custom environment and metadata', () => {
      let build = createBuildObject({
        name: 'Build',
        environment: 'production',
        metadata: { ci: true },
      });

      assert.strictEqual(build.environment, 'production');
      assert.deepStrictEqual(build.metadata, { ci: true });
    });
  });

  describe('updateBuild', () => {
    it('updates build status', () => {
      let build = {
        id: 'build-1',
        status: 'pending',
        name: 'Test',
      };

      let updated = updateBuild(build, 'running');

      assert.strictEqual(updated.status, 'running');
      assert.ok(updated.updatedAt);
      assert.strictEqual(updated.name, 'Test');
    });

    it('merges additional updates', () => {
      let build = { id: 'build-1', status: 'pending' };

      let updated = updateBuild(build, 'completed', { result: 'success' });

      assert.strictEqual(updated.status, 'completed');
      assert.strictEqual(updated.result, 'success');
    });

    it('does not mutate original build', () => {
      let build = { id: 'build-1', status: 'pending' };

      updateBuild(build, 'running');

      assert.strictEqual(build.status, 'pending');
    });
  });

  describe('addScreenshotToBuild', () => {
    it('adds screenshot to build', () => {
      let build = {
        id: 'build-1',
        screenshots: [],
      };
      let screenshot = { name: 'homepage', path: '/img/home.png' };

      let updated = addScreenshotToBuild(build, screenshot);

      assert.strictEqual(updated.screenshots.length, 1);
      assert.strictEqual(updated.screenshots[0].name, 'homepage');
      assert.ok(updated.screenshots[0].addedAt);
    });

    it('appends to existing screenshots', () => {
      let build = {
        id: 'build-1',
        screenshots: [{ name: 'first' }],
      };

      let updated = addScreenshotToBuild(build, { name: 'second' });

      assert.strictEqual(updated.screenshots.length, 2);
    });

    it('does not mutate original build', () => {
      let build = { id: 'build-1', screenshots: [] };

      addScreenshotToBuild(build, { name: 'test' });

      assert.strictEqual(build.screenshots.length, 0);
    });
  });

  describe('finalizeBuildObject', () => {
    it('sets status to completed on success', () => {
      let build = { id: 'build-1', status: 'running' };

      let finalized = finalizeBuildObject(build, { success: true });

      assert.strictEqual(finalized.status, 'completed');
      assert.ok(finalized.completedAt);
      assert.deepStrictEqual(finalized.result, { success: true });
    });

    it('sets status to failed on failure', () => {
      let build = { id: 'build-1', status: 'running' };

      let finalized = finalizeBuildObject(build, { success: false });

      assert.strictEqual(finalized.status, 'failed');
    });

    it('handles empty result', () => {
      let build = { id: 'build-1', status: 'running' };

      let finalized = finalizeBuildObject(build);

      assert.strictEqual(finalized.status, 'failed'); // no success = failed
      assert.deepStrictEqual(finalized.result, {});
    });
  });

  describe('createQueuedBuild', () => {
    it('creates queued build with timestamp', () => {
      let options = { name: 'Build', branch: 'main' };

      let queued = createQueuedBuild(options);

      assert.strictEqual(queued.name, 'Build');
      assert.strictEqual(queued.branch, 'main');
      assert.ok(queued.queuedAt);
    });
  });

  describe('validateBuildOptions', () => {
    it('returns valid when name is provided', () => {
      let result = validateBuildOptions({ name: 'Build' });

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, []);
    });

    it('returns valid when branch is provided', () => {
      let result = validateBuildOptions({ branch: 'main' });

      assert.strictEqual(result.valid, true);
    });

    it('returns invalid when neither name nor branch provided', () => {
      let result = validateBuildOptions({});

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('name or branch')));
    });

    it('validates environment values', () => {
      let validResult = validateBuildOptions({
        name: 'Build',
        environment: 'production',
      });
      assert.strictEqual(validResult.valid, true);

      let invalidResult = validateBuildOptions({
        name: 'Build',
        environment: 'invalid',
      });
      assert.strictEqual(invalidResult.valid, false);
      assert.ok(invalidResult.errors.some(e => e.includes('Environment')));
    });

    it('accepts all valid environments', () => {
      for (let env of ['test', 'staging', 'production']) {
        let result = validateBuildOptions({ name: 'Build', environment: env });
        assert.strictEqual(result.valid, true, `Should accept ${env}`);
      }
    });
  });
});
