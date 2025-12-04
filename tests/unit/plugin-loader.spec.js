import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock output module
vi.mock('../../src/utils/output.js', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { loadPlugins } from '../../src/plugin-loader.js';
import * as output from '../../src/utils/output.js';

describe('Plugin Loader', () => {
  let testDir;

  beforeEach(() => {
    // Create test directory
    testDir = join(process.cwd(), `test-plugins-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Mock cwd to point to test directory
    vi.spyOn(process, 'cwd').mockReturnValue(testDir);

    // Clear mock calls
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    vi.restoreAllMocks();
  });

  describe('Auto-discovery', () => {
    it('should discover plugins from @vizzly-testing packages', async () => {
      // Create mock @vizzly-testing/test-plugin package
      const pluginDir = join(
        testDir,
        'node_modules',
        '@vizzly-testing',
        'test-plugin'
      );
      mkdirSync(pluginDir, { recursive: true });

      // Write package.json with plugin field
      const packageJson = {
        name: '@vizzly-testing/test-plugin',
        version: '1.0.0',
        vizzly: {
          plugin: './plugin.js',
        },
      };
      writeFileSync(
        join(pluginDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Write plugin file
      const pluginCode = `
        export default {
          name: 'test-plugin',
          version: '1.0.0',
          register(program, context) {
            // Plugin registration logic
          }
        };
      `;
      writeFileSync(join(pluginDir, 'plugin.js'), pluginCode);

      // Load plugins
      const config = { plugins: [] };
      const plugins = await loadPlugins(null, config);

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('test-plugin');
      expect(plugins[0].version).toBe('1.0.0');
      expect(typeof plugins[0].register).toBe('function');
    });

    it('should skip packages without vizzly.plugin field', async () => {
      // Create mock @vizzly-testing package without plugin field
      const pluginDir = join(
        testDir,
        'node_modules',
        '@vizzly-testing',
        'no-plugin'
      );
      mkdirSync(pluginDir, { recursive: true });

      const packageJson = {
        name: '@vizzly-testing/no-plugin',
        version: '1.0.0',
      };
      writeFileSync(
        join(pluginDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const config = { plugins: [] };
      const plugins = await loadPlugins(null, config);

      expect(plugins).toHaveLength(0);
    });

    it('should warn about invalid plugin paths', async () => {
      // Create mock plugin with path traversal attempt
      const pluginDir = join(
        testDir,
        'node_modules',
        '@vizzly-testing',
        'bad-plugin'
      );
      mkdirSync(pluginDir, { recursive: true });

      const packageJson = {
        name: '@vizzly-testing/bad-plugin',
        version: '1.0.0',
        vizzly: {
          plugin: '../../../etc/passwd', // Path traversal attempt
        },
      };
      writeFileSync(
        join(pluginDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      const config = { plugins: [] };
      const plugins = await loadPlugins(null, config);

      expect(plugins).toHaveLength(0);
      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid plugin path')
      );
    });

    it('should handle multiple plugins', async () => {
      // Create first plugin
      const plugin1Dir = join(
        testDir,
        'node_modules',
        '@vizzly-testing',
        'plugin-1'
      );
      mkdirSync(plugin1Dir, { recursive: true });
      writeFileSync(
        join(plugin1Dir, 'package.json'),
        JSON.stringify({
          name: '@vizzly-testing/plugin-1',
          vizzly: { plugin: './plugin.js' },
        })
      );
      writeFileSync(
        join(plugin1Dir, 'plugin.js'),
        'export default { name: "plugin-1", register() {} };'
      );

      // Create second plugin
      const plugin2Dir = join(
        testDir,
        'node_modules',
        '@vizzly-testing',
        'plugin-2'
      );
      mkdirSync(plugin2Dir, { recursive: true });
      writeFileSync(
        join(plugin2Dir, 'package.json'),
        JSON.stringify({
          name: '@vizzly-testing/plugin-2',
          vizzly: { plugin: './plugin.js' },
        })
      );
      writeFileSync(
        join(plugin2Dir, 'plugin.js'),
        'export default { name: "plugin-2", register() {} };'
      );

      const config = { plugins: [] };
      const plugins = await loadPlugins(null, config);

      expect(plugins).toHaveLength(2);
      expect(plugins.map(p => p.name).sort()).toEqual(['plugin-1', 'plugin-2']);
    });
  });

  describe('Config-based loading', () => {
    it('should load plugins from config', async () => {
      // Create plugin file
      const pluginPath = join(testDir, 'custom-plugin.js');
      writeFileSync(
        pluginPath,
        'export default { name: "custom", version: "2.0.0", register() {} };'
      );

      // Create a config file path
      const configFilePath = join(testDir, 'vizzly.config.js');

      const config = {
        plugins: ['./custom-plugin.js'],
      };

      const plugins = await loadPlugins(configFilePath, config);

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('custom');
    });

    it('should handle plugin load errors gracefully', async () => {
      const configFilePath = join(testDir, 'vizzly.config.js');

      const config = {
        plugins: ['./non-existent-plugin.js'],
      };

      const plugins = await loadPlugins(configFilePath, config);

      expect(plugins).toHaveLength(0);
      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load plugin')
      );
    });
  });

  describe('Deduplication', () => {
    it('should not load the same plugin twice', async () => {
      // Create auto-discoverable plugin
      const pluginDir = join(
        testDir,
        'node_modules',
        '@vizzly-testing',
        'test-plugin'
      );
      mkdirSync(pluginDir, { recursive: true });
      writeFileSync(
        join(pluginDir, 'package.json'),
        JSON.stringify({
          name: '@vizzly-testing/test-plugin',
          vizzly: { plugin: './plugin.js' },
        })
      );
      writeFileSync(
        join(pluginDir, 'plugin.js'),
        'export default { name: "test-plugin", register() {} };'
      );

      // Also add to config
      const config = {
        plugins: ['@vizzly-testing/test-plugin'],
      };

      const plugins = await loadPlugins(null, config);

      // Should only load once
      expect(plugins).toHaveLength(1);
      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining('already loaded')
      );
    });
  });

  describe('Validation', () => {
    it('should validate plugin has required name field', async () => {
      const pluginPath = join(testDir, 'no-name.js');
      writeFileSync(pluginPath, 'export default { register() {} };');

      const configFilePath = join(testDir, 'vizzly.config.js');
      const config = { plugins: ['./no-name.js'] };
      const plugins = await loadPlugins(configFilePath, config);

      expect(plugins).toHaveLength(0);
      expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('name'));
    });

    it('should validate plugin has required register function', async () => {
      const pluginPath = join(testDir, 'no-register.js');
      writeFileSync(pluginPath, 'export default { name: "test" };');

      const configFilePath = join(testDir, 'vizzly.config.js');
      const config = { plugins: ['./no-register.js'] };
      const plugins = await loadPlugins(configFilePath, config);

      expect(plugins).toHaveLength(0);
      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining('register')
      );
    });

    it('should accept plugins without version field', async () => {
      const pluginPath = join(testDir, 'no-version.js');
      writeFileSync(
        pluginPath,
        'export default { name: "test", register() {} };'
      );

      const configFilePath = join(testDir, 'vizzly.config.js');
      const config = { plugins: ['./no-version.js'] };
      const plugins = await loadPlugins(configFilePath, config);

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('test');
    });
  });
});
