import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createStateStore } from '../../src/tdd/state-store.js';
import { getContext, getDetailedContext } from '../../src/utils/context.js';

function saveBaselineMetadata(workingDir, metadata) {
  let store = createStateStore({ workingDir });
  store.setBaselineMetadata(metadata);
  store.close();
}

describe('utils/context', () => {
  let testDir;
  let originalCwd;
  let originalEnv;
  let originalVizzlyHome;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    originalVizzlyHome = process.env.VIZZLY_HOME;

    // Create a temp directory for testing
    testDir = join(homedir(), `.vizzly-test-context-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Set VIZZLY_HOME to our test dir to isolate from real config
    process.env.VIZZLY_HOME = join(testDir, 'vizzly-home');
    mkdirSync(process.env.VIZZLY_HOME, { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    if (originalVizzlyHome) {
      process.env.VIZZLY_HOME = originalVizzlyHome;
    }

    // Clean up test directory
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getContext', () => {
    it('returns array of context items', () => {
      let items = getContext();

      assert.ok(Array.isArray(items));
    });

    it('returns "Not connected" when no auth configured', () => {
      process.chdir(testDir);
      delete process.env.VIZZLY_TOKEN;

      let items = getContext();

      let notConnected = items.find(
        i => i.label === 'Not connected' || i.label === 'Get started'
      );
      assert.ok(notConnected);
      assert.strictEqual(notConnected.type, 'info');
    });

    it('detects VIZZLY_TOKEN env var', () => {
      process.chdir(testDir);
      process.env.VIZZLY_TOKEN = 'test-token';

      let items = getContext();

      let tokenItem = items.find(i => i.label === 'API Token');
      assert.ok(tokenItem);
      assert.strictEqual(tokenItem.type, 'success');
      assert.strictEqual(tokenItem.value, 'via VIZZLY_TOKEN');
    });

    it('detects baselines in .vizzly directory', () => {
      process.chdir(testDir);

      saveBaselineMetadata(testDir, {
        screenshots: [{ name: 'test1' }, { name: 'test2' }, { name: 'test3' }],
      });

      let items = getContext();

      let baselinesItem = items.find(i => i.label === 'Baselines');
      assert.ok(baselinesItem);
      assert.strictEqual(baselinesItem.type, 'success');
      assert.strictEqual(baselinesItem.value, '3 screenshots');
    });

    it('detects TDD server running', () => {
      process.chdir(testDir);

      // Create server.json indicating server is running
      let vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });
      writeFileSync(
        join(vizzlyDir, 'server.json'),
        JSON.stringify({ port: 47392 })
      );

      let items = getContext();

      let serverItem = items.find(i => i.label === 'TDD Server');
      assert.ok(serverItem);
      assert.strictEqual(serverItem.type, 'success');
      assert.strictEqual(serverItem.value, 'running on :47392');
    });

    it('detects logged in user from global config', () => {
      process.chdir(testDir);

      // Create global config with auth
      let globalConfig = {
        auth: {
          accessToken: 'test-token',
          user: {
            name: 'Test User',
            email: 'test@example.com',
          },
        },
      };
      writeFileSync(
        join(process.env.VIZZLY_HOME, 'config.json'),
        JSON.stringify(globalConfig)
      );

      let items = getContext();

      let loggedInItem = items.find(i => i.label === 'Logged in');
      assert.ok(loggedInItem);
      assert.strictEqual(loggedInItem.type, 'success');
      assert.strictEqual(loggedInItem.value, 'Test User');
    });

    it('suggests init when no config exists', () => {
      process.chdir(testDir);
      delete process.env.VIZZLY_TOKEN;

      let items = getContext();

      let getStarted = items.find(i => i.label === 'Get started');
      assert.ok(getStarted);
      assert.strictEqual(getStarted.type, 'info');
      assert.ok(getStarted.value.includes('vizzly init'));
    });

    it('handles malformed JSON gracefully', () => {
      process.chdir(testDir);

      // Create malformed metadata
      let baselinesDir = join(testDir, '.vizzly', 'baselines');
      mkdirSync(baselinesDir, { recursive: true });
      writeFileSync(join(baselinesDir, 'metadata.json'), 'not valid json');

      // Should not throw
      let items = getContext();
      assert.ok(Array.isArray(items));
    });
  });

  describe('getDetailedContext', () => {
    it('returns detailed context object', () => {
      process.chdir(testDir);

      let context = getDetailedContext();

      assert.ok(context.tddServer);
      assert.ok(context.project);
      assert.ok(context.auth);
      assert.ok(context.baselines);
    });

    it('detects TDD server details', () => {
      process.chdir(testDir);

      let vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });
      writeFileSync(
        join(vizzlyDir, 'server.json'),
        JSON.stringify({ port: 47392 })
      );

      let context = getDetailedContext();

      assert.strictEqual(context.tddServer.running, true);
      assert.strictEqual(context.tddServer.port, 47392);
    });

    it('detects project config file', () => {
      process.chdir(testDir);

      // Create vizzly.config.js
      writeFileSync(join(testDir, 'vizzly.config.js'), 'export default {};');

      let context = getDetailedContext();

      assert.strictEqual(context.project.hasConfig, true);
    });

    it('detects auth status', () => {
      process.chdir(testDir);
      process.env.VIZZLY_TOKEN = 'test-token';

      let context = getDetailedContext();

      assert.strictEqual(context.auth.hasEnvToken, true);
    });

    it('detects baseline count and path', () => {
      process.chdir(testDir);

      let baselinesDir = join(testDir, '.vizzly', 'baselines');
      saveBaselineMetadata(testDir, {
        screenshots: [{ name: 'test1' }, { name: 'test2' }],
      });

      let context = getDetailedContext();

      assert.strictEqual(context.baselines.count, 2);
      assert.strictEqual(context.baselines.path, baselinesDir);
    });

    it('returns defaults when nothing configured', () => {
      process.chdir(testDir);
      delete process.env.VIZZLY_TOKEN;

      let context = getDetailedContext();

      assert.strictEqual(context.tddServer.running, false);
      assert.strictEqual(context.tddServer.port, null);
      assert.strictEqual(context.project.hasConfig, false);
      assert.strictEqual(context.auth.loggedIn, false);
      assert.strictEqual(context.auth.hasEnvToken, false);
      assert.strictEqual(context.baselines.count, 0);
    });
  });
});
