import { describe, expect, it } from 'vitest';
import {
  addScreenshotToBuild,
  createBuildObject,
  createQueuedBuild,
  finalizeBuildObject,
  generateBuildId,
  updateBuild,
  validateBuildOptions,
} from '../../src/services/build-manager.js';

describe('BuildManager', () => {
  describe('pure functions', () => {
    describe('generateBuildId', () => {
      it('generates unique build IDs', () => {
        let id1 = generateBuildId();
        let id2 = generateBuildId();

        expect(id1).toMatch(/^build-[a-f0-9-]{36}$/);
        expect(id2).toMatch(/^build-[a-f0-9-]{36}$/);
        expect(id1).not.toBe(id2);
      });
    });

    describe('createBuildObject', () => {
      it('creates build with all options', () => {
        let buildOptions = {
          name: 'Test Build',
          branch: 'main',
          commit: 'abc123',
          environment: 'production',
          metadata: { author: 'test' },
        };

        let build = createBuildObject(buildOptions);

        expect(build).toMatchObject({
          name: 'Test Build',
          branch: 'main',
          commit: 'abc123',
          environment: 'production',
          metadata: { author: 'test' },
          status: 'pending',
          screenshots: [],
        });
        expect(build.id).toMatch(/^build-/);
        expect(new Date(build.createdAt)).toBeInstanceOf(Date);
      });

      it('creates build with minimal options', () => {
        let build = createBuildObject({});

        expect(build.environment).toBe('test');
        expect(build.metadata).toEqual({});
        expect(build.name).toMatch(/^build-\d+$/);
        expect(build.screenshots).toEqual([]);
      });

      it('uses default environment when not specified', () => {
        let build = createBuildObject({ name: 'Test' });
        expect(build.environment).toBe('test');
      });
    });

    describe('updateBuild', () => {
      it('updates build status and timestamp', () => {
        let originalBuild = {
          id: 'build123',
          name: 'Test',
          status: 'pending',
          createdAt: '2023-01-01T00:00:00.000Z',
        };

        let updatedBuild = updateBuild(originalBuild, 'running', {
          progress: 50,
        });

        expect(updatedBuild.status).toBe('running');
        expect(updatedBuild.progress).toBe(50);
        expect(updatedBuild.id).toBe('build123');
        expect(new Date(updatedBuild.updatedAt)).toBeInstanceOf(Date);
      });

      it('preserves existing build properties', () => {
        let build = { id: '123', name: 'Test', screenshots: ['a', 'b'] };
        let updated = updateBuild(build, 'completed');

        expect(updated.screenshots).toEqual(['a', 'b']);
        expect(updated.id).toBe('123');
        expect(updated.name).toBe('Test');
      });

      it('does not mutate original build', () => {
        let original = { id: '123', status: 'pending' };
        updateBuild(original, 'running');

        expect(original.status).toBe('pending');
      });
    });

    describe('addScreenshotToBuild', () => {
      it('adds screenshot to build', () => {
        let build = {
          id: 'build123',
          screenshots: [{ name: 'existing', addedAt: '2023-01-01' }],
        };

        let screenshot = { name: 'new-screenshot', image: 'data' };
        let updatedBuild = addScreenshotToBuild(build, screenshot);

        expect(updatedBuild.screenshots).toHaveLength(2);
        expect(updatedBuild.screenshots[1].name).toBe('new-screenshot');
        expect(updatedBuild.screenshots[1].addedAt).toBeDefined();
      });

      it('preserves existing screenshots', () => {
        let existingScreenshot = { name: 'existing', addedAt: '2023-01-01' };
        let build = { id: 'test', screenshots: [existingScreenshot] };

        let updatedBuild = addScreenshotToBuild(build, { name: 'new' });

        expect(updatedBuild.screenshots[0]).toEqual(existingScreenshot);
      });

      it('does not mutate original build', () => {
        let original = { id: '123', screenshots: [] };
        addScreenshotToBuild(original, { name: 'test' });

        expect(original.screenshots).toEqual([]);
      });
    });

    describe('finalizeBuildObject', () => {
      it('finalizes build as completed on success', () => {
        let build = { id: 'test', status: 'running' };
        let result = { success: true, tests: 10 };

        let finalized = finalizeBuildObject(build, result);

        expect(finalized.status).toBe('completed');
        expect(finalized.result).toEqual(result);
        expect(new Date(finalized.completedAt)).toBeInstanceOf(Date);
      });

      it('finalizes build as failed on failure', () => {
        let build = { id: 'test', status: 'running' };
        let result = { success: false, error: 'Test failed' };

        let finalized = finalizeBuildObject(build, result);

        expect(finalized.status).toBe('failed');
        expect(finalized.result).toEqual(result);
      });

      it('defaults to failed status without result', () => {
        let build = { id: 'test', status: 'running' };
        let finalized = finalizeBuildObject(build);

        expect(finalized.status).toBe('failed');
        expect(finalized.result).toEqual({});
      });
    });

    describe('createQueuedBuild', () => {
      it('adds queuedAt timestamp', () => {
        let buildOptions = { name: 'Queued Build' };
        let queued = createQueuedBuild(buildOptions);

        expect(queued.name).toBe('Queued Build');
        expect(new Date(queued.queuedAt)).toBeInstanceOf(Date);
      });

      it('preserves all build options', () => {
        let buildOptions = { name: 'Test', branch: 'main', commit: 'abc' };
        let queued = createQueuedBuild(buildOptions);

        expect(queued).toMatchObject(buildOptions);
      });
    });

    describe('validateBuildOptions', () => {
      it('validates valid build options', () => {
        let options = { name: 'Test', environment: 'test' };
        let result = validateBuildOptions(options);

        expect(result).toEqual({ valid: true, errors: [] });
      });

      it('requires either name or branch', () => {
        let options = { environment: 'test' };
        let result = validateBuildOptions(options);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Either name or branch is required');
      });

      it('validates environment values', () => {
        let options = { name: 'Test', environment: 'invalid' };
        let result = validateBuildOptions(options);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          'Environment must be one of: test, staging, production'
        );
      });

      it('passes with branch only', () => {
        let options = { branch: 'main' };
        let result = validateBuildOptions(options);

        expect(result.valid).toBe(true);
      });

      it('accepts all valid environments', () => {
        let environments = ['test', 'staging', 'production'];

        for (let env of environments) {
          let result = validateBuildOptions({ name: 'Test', environment: env });
          expect(result.valid).toBe(true);
        }
      });

      it('can have multiple errors', () => {
        let options = { environment: 'invalid' };
        let result = validateBuildOptions(options);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(2);
      });
    });
  });
});
