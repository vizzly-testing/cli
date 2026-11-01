import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  clearGlobalConfig,
  expandHomePath,
  getGlobalConfigDir,
  getGlobalConfigPath,
  loadGlobalConfig,
  saveGlobalConfig,
} from './global-config.js';

describe('utils/global-config', () => {
  let testDir = join(process.cwd(), '.test-global-config');
  let originalVizzlyHome = process.env.VIZZLY_HOME;

  beforeEach(() => {
    // Use test directory for all global config operations
    process.env.VIZZLY_HOME = testDir;

    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    // Restore original VIZZLY_HOME
    if (originalVizzlyHome) {
      process.env.VIZZLY_HOME = originalVizzlyHome;
    } else {
      delete process.env.VIZZLY_HOME;
    }
  });

  describe('getGlobalConfigDir', () => {
    it('returns VIZZLY_HOME when set', () => {
      process.env.VIZZLY_HOME = '/custom/path';
      let dir = getGlobalConfigDir();

      assert.strictEqual(dir, '/custom/path');

      // Restore
      process.env.VIZZLY_HOME = testDir;
    });

    it('expands shell-style home paths from dotenv files', () => {
      process.env.VIZZLY_HOME = '$HOME/.vizzly.dev';
      let dir = getGlobalConfigDir();

      assert.strictEqual(dir.endsWith('/.vizzly.dev'), true);
      assert.strictEqual(dir.includes('$HOME'), false);

      process.env.VIZZLY_HOME = testDir;
    });
  });

  describe('expandHomePath', () => {
    it('expands tilde and HOME prefixes without changing other paths', () => {
      assert.strictEqual(
        expandHomePath('$HOME/.vizzly'),
        join(homedir(), '.vizzly')
      );
      assert.strictEqual(
        expandHomePath('~/.vizzly'),
        join(homedir(), '.vizzly')
      );
      assert.strictEqual(expandHomePath('/tmp/vizzly'), '/tmp/vizzly');
    });
  });

  describe('getGlobalConfigPath', () => {
    it('returns config.json path within config dir', () => {
      let path = getGlobalConfigPath();

      assert.ok(path.includes(testDir));
      assert.ok(path.includes('config.json'));
    });
  });

  describe('loadGlobalConfig', () => {
    it('returns empty object when config does not exist', async () => {
      let config = await loadGlobalConfig();

      assert.deepStrictEqual(config, {});
    });

    it('loads config from file', async () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({ key: 'value' })
      );

      let config = await loadGlobalConfig();

      assert.strictEqual(config.key, 'value');
    });

    it('returns empty object for invalid JSON', async () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'config.json'), 'not valid json');

      let config = await loadGlobalConfig();

      assert.deepStrictEqual(config, {});
    });
  });

  describe('saveGlobalConfig', () => {
    it('creates directory and saves config', async () => {
      await saveGlobalConfig({ test: 'value' });

      let content = readFileSync(join(testDir, 'config.json'), 'utf-8');
      let config = JSON.parse(content);

      assert.strictEqual(config.test, 'value');
    });

    it('overwrites existing config', async () => {
      await saveGlobalConfig({ first: 'value' });
      await saveGlobalConfig({ second: 'value' });

      let content = readFileSync(join(testDir, 'config.json'), 'utf-8');
      let config = JSON.parse(content);

      assert.strictEqual(config.first, undefined);
      assert.strictEqual(config.second, 'value');
    });
  });

  describe('clearGlobalConfig', () => {
    it('clears all config', async () => {
      await saveGlobalConfig({ key: 'value', auth: { token: '123' } });
      await clearGlobalConfig();

      let config = await loadGlobalConfig();

      assert.deepStrictEqual(config, {});
    });
  });
});
