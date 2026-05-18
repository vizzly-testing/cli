import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  loadPlugin,
  resolvePackagePluginPath,
  resolvePluginPath,
} from '../src/plugin-loader.js';

async function createTempWorkspace() {
  return mkdtemp(join(tmpdir(), 'vizzly-plugin-loader-'));
}

async function writePackage(workspace, packageName, packageJson) {
  let packageDir = join(workspace, 'node_modules', packageName);
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  return packageDir;
}

describe('plugin-loader', () => {
  let originalCwd;
  let workspace;

  beforeEach(async () => {
    originalCwd = process.cwd();
    workspace = await realpath(await createTempWorkspace());
    process.chdir(workspace);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(workspace, { recursive: true, force: true });
  });

  describe('resolvePackagePluginPath', () => {
    it('resolves package plugin paths inside the package directory', () => {
      let packageDir = join(workspace, 'node_modules', 'storybook-plugin');

      let pluginPath = resolvePackagePluginPath(
        'storybook-plugin',
        packageDir,
        'dist/plugin.js'
      );

      assert.equal(pluginPath, join(packageDir, 'dist', 'plugin.js'));
    });

    it('rejects absolute package plugin paths', () => {
      let packageDir = join(workspace, 'node_modules', 'bad-plugin');

      assert.throws(
        () =>
          resolvePackagePluginPath('bad-plugin', packageDir, '/tmp/plugin.js'),
        /path must be relative/
      );
    });

    it('rejects package plugin paths that escape the package directory', () => {
      let packageDir = join(workspace, 'node_modules', 'bad-plugin');

      assert.throws(
        () =>
          resolvePackagePluginPath(
            'bad-plugin',
            packageDir,
            '../other/plugin.js'
          ),
        /cannot escape package directory/
      );
    });
  });

  describe('resolvePluginPath', () => {
    it('resolves explicit package plugins through vizzlyPlugin', async () => {
      let packageDir = await writePackage(workspace, 'storybook-plugin', {
        name: 'storybook-plugin',
        vizzlyPlugin: 'dist/plugin.js',
      });

      let pluginPath = resolvePluginPath('storybook-plugin', null);

      assert.equal(pluginPath, join(packageDir, 'dist', 'plugin.js'));
    });

    it('keeps legacy package plugin field support behind the same path safety checks', async () => {
      let packageDir = await writePackage(workspace, 'legacy-plugin', {
        name: 'legacy-plugin',
        vizzly: { plugin: 'plugin.js' },
      });

      let pluginPath = resolvePluginPath('legacy-plugin', null);

      assert.equal(pluginPath, join(packageDir, 'plugin.js'));
    });

    it('rejects unsafe plugin fields from explicit package specs', async () => {
      await writePackage(workspace, 'bad-plugin', {
        name: 'bad-plugin',
        vizzlyPlugin: '../outside.js',
      });

      assert.throws(
        () => resolvePluginPath('bad-plugin', null),
        /cannot escape package directory/
      );
    });

    it('resolves file paths relative to the config file', () => {
      let configPath = join(workspace, 'configs', 'vizzly.config.js');

      let pluginPath = resolvePluginPath('./plugins/custom.js', configPath);

      assert.equal(
        pluginPath,
        join(workspace, 'configs', 'plugins', 'custom.js')
      );
    });
  });

  describe('loadPlugin', () => {
    it('loads a valid ESM plugin default export', async () => {
      let pluginPath = join(workspace, 'plugin.js');
      await writeFile(
        pluginPath,
        `export default {
  name: 'custom-plugin',
  version: '1.0.0',
  register() {}
};`
      );

      let plugin = await loadPlugin(pluginPath);

      assert.equal(plugin.name, 'custom-plugin');
      assert.equal(plugin.version, '1.0.0');
      assert.equal(typeof plugin.register, 'function');
    });

    it('rejects plugins without a register function', async () => {
      let pluginPath = join(workspace, 'invalid-plugin.js');
      await writeFile(
        pluginPath,
        `export default {
  name: 'invalid-plugin'
};`
      );

      await assert.rejects(
        () => loadPlugin(pluginPath),
        /Invalid plugin structure/
      );
    });
  });
});
