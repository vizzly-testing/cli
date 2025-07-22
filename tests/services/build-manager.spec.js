import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BuildManager,
  generateBuildId,
  createBuildObject,
  updateBuild,
  addScreenshotToBuild,
  finalizeBuildObject,
  createQueuedBuild,
  validateBuildOptions,
} from '../../src/services/build-manager.js';

// Mock dependencies
vi.mock('../../src/services/base-service.js', () => ({
  BaseService: class {
    constructor(config, logger) {
      this.config = config;
      this.logger = logger;
    }
    emitProgress = vi.fn();
  },
}));

vi.mock('../../src/errors/vizzly-error.js', () => ({
  VizzlyError: class extends Error {
    constructor(message, code = 'VIZZLY_ERROR') {
      super(message);
      this.name = 'VizzlyError';
      this.code = code;
    }
  },
}));

vi.mock('crypto', () => ({
  default: {
    randomUUID: vi.fn(() => 'mock-uuid-123'),
  },
}));

describe('BuildManager', () => {
  describe('utility functions', () => {
    describe('generateBuildId', () => {
      it('generates unique build ID', () => {
        const id1 = generateBuildId();
        const id2 = generateBuildId();

        expect(id1).toBe('build-mock-uuid-123');
        expect(id2).toBe('build-mock-uuid-123');
        expect(typeof id1).toBe('string');
      });
    });

    describe('createBuildObject', () => {
      it('creates build with all options', () => {
        const buildOptions = {
          name: 'Test Build',
          branch: 'main',
          commit: 'abc123',
          environment: 'production',
          metadata: { author: 'test' },
        };

        const build = createBuildObject(buildOptions);

        expect(build).toEqual({
          id: 'build-mock-uuid-123',
          name: 'Test Build',
          branch: 'main',
          commit: 'abc123',
          environment: 'production',
          metadata: { author: 'test' },
          status: 'pending',
          createdAt: expect.any(String),
          screenshots: [],
        });

        expect(new Date(build.createdAt)).toBeInstanceOf(Date);
      });

      it('creates build with minimal options', () => {
        const buildOptions = {};

        const build = createBuildObject(buildOptions);

        expect(build).toEqual({
          id: 'build-mock-uuid-123',
          name: expect.stringMatching(/^build-\d+$/),
          branch: undefined,
          commit: undefined,
          environment: 'test',
          metadata: {},
          status: 'pending',
          createdAt: expect.any(String),
          screenshots: [],
        });
      });

      it('uses default environment when not specified', () => {
        const build = createBuildObject({ name: 'Test' });
        expect(build.environment).toBe('test');
      });
    });

    describe('updateBuild', () => {
      it('updates build status and timestamp', () => {
        const originalBuild = {
          id: 'build123',
          name: 'Test',
          status: 'pending',
          createdAt: '2023-01-01T00:00:00.000Z',
        };

        const updatedBuild = updateBuild(originalBuild, 'running', {
          progress: 50,
        });

        expect(updatedBuild).toEqual({
          id: 'build123',
          name: 'Test',
          status: 'running',
          createdAt: '2023-01-01T00:00:00.000Z',
          updatedAt: expect.any(String),
          progress: 50,
        });

        expect(new Date(updatedBuild.updatedAt)).toBeInstanceOf(Date);
      });

      it('preserves existing build properties', () => {
        const build = { id: '123', name: 'Test', screenshots: ['a', 'b'] };
        const updated = updateBuild(build, 'completed');

        expect(updated.screenshots).toEqual(['a', 'b']);
        expect(updated.id).toBe('123');
        expect(updated.name).toBe('Test');
      });
    });

    describe('addScreenshotToBuild', () => {
      it('adds screenshot to build', () => {
        const build = {
          id: 'build123',
          screenshots: [{ name: 'existing', addedAt: '2023-01-01' }],
        };

        const screenshot = { name: 'new-screenshot', image: 'data' };
        const updatedBuild = addScreenshotToBuild(build, screenshot);

        expect(updatedBuild.screenshots).toHaveLength(2);
        expect(updatedBuild.screenshots[1]).toEqual({
          name: 'new-screenshot',
          image: 'data',
          addedAt: expect.any(String),
        });
      });

      it('preserves existing screenshots', () => {
        const existingScreenshot = { name: 'existing', addedAt: '2023-01-01' };
        const build = { id: 'test', screenshots: [existingScreenshot] };

        const updatedBuild = addScreenshotToBuild(build, { name: 'new' });

        expect(updatedBuild.screenshots[0]).toEqual(existingScreenshot);
      });
    });

    describe('finalizeBuildObject', () => {
      it('finalizes build as completed on success', () => {
        const build = { id: 'test', status: 'running' };
        const result = { success: true, tests: 10 };

        const finalized = finalizeBuildObject(build, result);

        expect(finalized).toEqual({
          id: 'test',
          status: 'completed',
          completedAt: expect.any(String),
          result,
        });
      });

      it('finalizes build as failed on failure', () => {
        const build = { id: 'test', status: 'running' };
        const result = { success: false, error: 'Test failed' };

        const finalized = finalizeBuildObject(build, result);

        expect(finalized.status).toBe('failed');
        expect(finalized.result).toEqual(result);
      });

      it('defaults to failed status without result', () => {
        const build = { id: 'test', status: 'running' };
        const finalized = finalizeBuildObject(build);

        expect(finalized.status).toBe('failed');
        expect(finalized.result).toEqual({});
      });
    });

    describe('createQueuedBuild', () => {
      it('adds queuedAt timestamp', () => {
        const buildOptions = { name: 'Queued Build' };
        const queued = createQueuedBuild(buildOptions);

        expect(queued).toEqual({
          name: 'Queued Build',
          queuedAt: expect.any(String),
        });

        expect(new Date(queued.queuedAt)).toBeInstanceOf(Date);
      });
    });

    describe('validateBuildOptions', () => {
      it('validates valid build options', () => {
        const options = { name: 'Test', environment: 'test' };
        const result = validateBuildOptions(options);

        expect(result).toEqual({
          valid: true,
          errors: [],
        });
      });

      it('requires either name or branch', () => {
        const options = { environment: 'test' };
        const result = validateBuildOptions(options);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Either name or branch is required');
      });

      it('validates environment values', () => {
        const options = { name: 'Test', environment: 'invalid' };
        const result = validateBuildOptions(options);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          'Environment must be one of: test, staging, production'
        );
      });

      it('passes with branch only', () => {
        const options = { branch: 'main' };
        const result = validateBuildOptions(options);

        expect(result.valid).toBe(true);
      });

      it('accepts valid environments', () => {
        const environments = ['test', 'staging', 'production'];

        environments.forEach(env => {
          const options = { name: 'Test', environment: env };
          const result = validateBuildOptions(options);
          expect(result.valid).toBe(true);
        });
      });
    });
  });

  describe('BuildManager class', () => {
    let buildManager;
    let mockConfig;
    let mockLogger;

    beforeEach(() => {
      mockConfig = { test: true };
      mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      buildManager = new BuildManager(mockConfig, mockLogger);
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    describe('constructor', () => {
      it('initializes with empty state', () => {
        expect(buildManager.currentBuild).toBe(null);
        expect(buildManager.buildQueue).toEqual([]);
      });
    });

    describe('onStart', () => {
      it('emits initialization progress', async () => {
        await buildManager.onStart();
        expect(buildManager.emitProgress).toHaveBeenCalledWith(
          'initializing',
          0
        );
      });
    });

    describe('onStop', () => {
      it('cleans up current build and queue', async () => {
        buildManager.currentBuild = { id: 'test', status: 'completed' };
        buildManager.buildQueue = [{ name: 'queued' }];

        await buildManager.onStop();

        expect(buildManager.currentBuild).toBe(null);
        expect(buildManager.buildQueue).toEqual([]);
      });

      it('cancels pending build on stop', async () => {
        buildManager.currentBuild = { id: 'pending-build', status: 'pending' };
        buildManager.updateBuildStatus = vi.fn();

        await buildManager.onStop();

        expect(buildManager.updateBuildStatus).toHaveBeenCalledWith(
          'pending-build',
          'cancelled'
        );
      });

      it('handles no current build gracefully', async () => {
        buildManager.currentBuild = null;
        await buildManager.onStop();

        expect(buildManager.currentBuild).toBe(null);
      });
    });

    describe('createBuild', () => {
      it('creates and stores new build', async () => {
        const buildOptions = { name: 'Test Build', branch: 'main' };

        const build = await buildManager.createBuild(buildOptions);

        expect(build).toMatchObject({
          name: 'Test Build',
          branch: 'main',
          status: 'pending',
        });
        expect(buildManager.currentBuild).toBe(build);
        expect(buildManager.emitProgress).toHaveBeenCalledWith(
          'creating',
          'Creating new build...'
        );
        expect(buildManager.emitProgress).toHaveBeenCalledWith(
          'created',
          'Build created: Test Build',
          { build }
        );
      });
    });

    describe('updateBuildStatus', () => {
      it('updates current build status', async () => {
        const build = await buildManager.createBuild({ name: 'Test' });

        const updated = await buildManager.updateBuildStatus(
          build.id,
          'running',
          { progress: 50 }
        );

        expect(updated.status).toBe('running');
        expect(updated.progress).toBe(50);
        expect(buildManager.currentBuild.status).toBe('running');
        expect(buildManager.emitProgress).toHaveBeenCalledWith(
          'updated',
          'Build status: running',
          {
            buildId: build.id,
            status: 'running',
            build: updated,
          }
        );
      });

      it('throws error for non-existent build', async () => {
        await expect(
          buildManager.updateBuildStatus('non-existent', 'running')
        ).rejects.toThrow('Build non-existent not found');
      });

      it('throws error when no current build', async () => {
        buildManager.currentBuild = null;

        await expect(
          buildManager.updateBuildStatus('test', 'running')
        ).rejects.toThrow('Build test not found');
      });
    });

    describe('addScreenshot', () => {
      it('adds screenshot to current build', async () => {
        const build = await buildManager.createBuild({ name: 'Test' });
        const screenshot = { name: 'test.png', image: 'data' };

        const updated = await buildManager.addScreenshot(build.id, screenshot);

        expect(updated.screenshots).toHaveLength(1);
        expect(updated.screenshots[0]).toMatchObject({
          name: 'test.png',
          image: 'data',
        });
        expect(buildManager.emitProgress).toHaveBeenCalledWith(
          'screenshot-added',
          'Screenshot added to build',
          {
            buildId: build.id,
            screenshotCount: 1,
            screenshot,
          }
        );
      });

      it('throws error for non-existent build', async () => {
        await expect(
          buildManager.addScreenshot('non-existent', {})
        ).rejects.toThrow('Build non-existent not found');
      });
    });

    describe('finalizeBuild', () => {
      it('finalizes current build with success result', async () => {
        const build = await buildManager.createBuild({ name: 'Test' });
        const result = { success: true, tests: 5 };

        const finalized = await buildManager.finalizeBuild(build.id, result);

        expect(finalized.status).toBe('completed');
        expect(finalized.result).toEqual(result);
        expect(finalized.completedAt).toBeDefined();
        expect(buildManager.emitProgress).toHaveBeenCalledWith(
          'finalized',
          'Build completed',
          {
            buildId: build.id,
            build: finalized,
            result,
          }
        );
      });

      it('finalizes current build with failure result', async () => {
        const build = await buildManager.createBuild({ name: 'Test' });
        const result = { success: false, error: 'Failed' };

        const finalized = await buildManager.finalizeBuild(build.id, result);

        expect(finalized.status).toBe('failed');
        expect(buildManager.emitProgress).toHaveBeenCalledWith(
          'finalized',
          'Build failed',
          expect.any(Object)
        );
      });

      it('throws error for non-existent build', async () => {
        await expect(
          buildManager.finalizeBuild('non-existent', {})
        ).rejects.toThrow('Build non-existent not found');
      });
    });

    describe('getCurrentBuild', () => {
      it('returns current build', async () => {
        expect(buildManager.getCurrentBuild()).toBe(null);

        const build = await buildManager.createBuild({ name: 'Test' });
        expect(buildManager.getCurrentBuild()).toBe(build);
      });
    });

    describe('build queue management', () => {
      it('queues build for processing', () => {
        const buildOptions = { name: 'Queued Build' };

        buildManager.queueBuild(buildOptions);

        expect(buildManager.buildQueue).toHaveLength(1);
        expect(buildManager.buildQueue[0]).toMatchObject({
          name: 'Queued Build',
          queuedAt: expect.any(String),
        });
        expect(buildManager.emitProgress).toHaveBeenCalledWith(
          'queued',
          'Build queued for processing',
          {
            queueLength: 1,
          }
        );
      });

      it('processes next build from queue', async () => {
        buildManager.queueBuild({ name: 'First' });
        buildManager.queueBuild({ name: 'Second' });

        const build = await buildManager.processNextBuild();

        expect(build.name).toBe('First');
        expect(buildManager.buildQueue).toHaveLength(1);
        expect(buildManager.buildQueue[0].name).toBe('Second');
      });

      it('returns null when queue is empty', async () => {
        const build = await buildManager.processNextBuild();
        expect(build).toBe(null);
      });

      it('provides queue status', () => {
        buildManager.queueBuild({ name: 'Build 1', branch: 'main' });
        buildManager.queueBuild({ name: 'Build 2', branch: 'develop' });

        const status = buildManager.getQueueStatus();

        expect(status).toEqual({
          length: 2,
          items: [
            { name: 'Build 1', branch: 'main', queuedAt: expect.any(String) },
            {
              name: 'Build 2',
              branch: 'develop',
              queuedAt: expect.any(String),
            },
          ],
        });
      });
    });

    describe('integration scenarios', () => {
      it('handles complete build lifecycle', async () => {
        // Create build
        const build = await buildManager.createBuild({
          name: 'Integration Test',
        });
        expect(build.status).toBe('pending');

        // Update status
        await buildManager.updateBuildStatus(build.id, 'running');
        expect(buildManager.currentBuild.status).toBe('running');

        // Add screenshots
        await buildManager.addScreenshot(build.id, { name: 'test1.png' });
        await buildManager.addScreenshot(build.id, { name: 'test2.png' });
        expect(buildManager.currentBuild.screenshots).toHaveLength(2);

        // Finalize
        const result = { success: true, screenshots: 2 };
        await buildManager.finalizeBuild(build.id, result);
        expect(buildManager.currentBuild.status).toBe('completed');
        expect(buildManager.currentBuild.result).toEqual(result);
      });

      it('handles queue processing workflow', async () => {
        // Queue multiple builds
        buildManager.queueBuild({ name: 'Build 1' });
        buildManager.queueBuild({ name: 'Build 2' });
        buildManager.queueBuild({ name: 'Build 3' });

        expect(buildManager.getQueueStatus().length).toBe(3);

        // Process all builds
        const builds = [];
        while (buildManager.buildQueue.length > 0) {
          const build = await buildManager.processNextBuild();
          builds.push(build);
        }

        expect(builds).toHaveLength(3);
        expect(builds.map(b => b.name)).toEqual([
          'Build 1',
          'Build 2',
          'Build 3',
        ]);
        expect(buildManager.getQueueStatus().length).toBe(0);
      });
    });
  });
});
