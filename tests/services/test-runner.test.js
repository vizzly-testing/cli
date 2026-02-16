import assert from 'node:assert';
import { describe, it } from 'node:test';
import { TestRunner } from '../../src/services/test-runner.js';

function createDeps(overrides = {}) {
  return {
    spawn: () => {
      throw new Error('spawn should not be called in createBuild tests');
    },
    createApiClient: () => ({}),
    createApiBuild: async () => ({ id: 'api-build-123' }),
    getBuild: async () => ({ id: 'api-build-123' }),
    finalizeApiBuild: async () => {},
    output: {
      debug: () => {},
    },
    writeSession: () => {},
    createError: (message, code) => {
      let error = new Error(message);
      error.code = code;
      return error;
    },
    ...overrides,
  };
}

describe('services/test-runner', () => {
  describe('createBuild', () => {
    it('writes session context for API builds', async () => {
      let writtenSessions = [];
      let deps = createDeps({
        writeSession: session => {
          writtenSessions.push(session);
        },
      });
      let testRunner = new TestRunner(
        {
          apiKey: 'test-key',
          apiUrl: 'https://api.vizzly.dev',
          comparison: {},
        },
        {},
        { deps }
      );

      let buildId = await testRunner.createBuild(
        {
          buildName: 'Storybook Build',
          branch: 'feature/session',
          commit: 'abc123def456',
          parallelId: 'parallel-42',
        },
        false
      );

      assert.strictEqual(buildId, 'api-build-123');
      assert.deepStrictEqual(writtenSessions, [
        {
          buildId: 'api-build-123',
          branch: 'feature/session',
          commit: 'abc123def456',
          parallelId: 'parallel-42',
        },
      ]);
    });

    it('does not write session context for TDD builds', async () => {
      let writeSessionCalled = false;
      let deps = createDeps({
        writeSession: () => {
          writeSessionCalled = true;
        },
      });
      let testRunner = new TestRunner({}, {}, { deps });

      let buildId = await testRunner.createBuild(
        {
          buildName: 'TDD Build',
          branch: 'main',
        },
        true
      );

      assert.ok(buildId.startsWith('build-'));
      assert.strictEqual(writeSessionCalled, false);
    });
  });
});
