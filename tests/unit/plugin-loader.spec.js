import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { loadPlugins } from '../../src/plugin-loader.js';

describe('Plugin Loader', () => {
  let mockLogger;
  let testDir;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Create test directory
    testDir = join(process.cwd(), 'test-plugins-' + Date.now());
    mkdirSync(testDir, { recursive: true });

    // Save original cwd
    vi.spyOn(process, 'cwd').mockReturnValue(testDir);
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
      let pluginDir = join(
        testDir,
        'node_modules',
        '@vizzly-testing',
        'test-plugin'
      );
      mkdirSync(pluginDir, { recursive: true });

      // Write package.json with plugin field
      let packageJson = {
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
      let pluginCode = `
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
      let config = { plugins: [] };
      let plugins = await loadPlugins(null, config, mockLogger);

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('test-plugin');
      expect(plugins[0].version).toBe('1.0.0');
      expect(typeof plugins[0].register).toBe('function');
    });

    it('should skip packages without vizzly.plugin field', async () => {
      // Create mock @vizzly-testing package without plugin field
      let pluginDir = join(
        testDir,
        'node_modules',
        '@vizzly-testing',
        'no-plugin'
      );
      mkdirSync(pluginDir, { recursive: true });

      let packageJson = {
        name: '@vizzly-testing/no-plugin',
        version: '1.0.0',
      };
      writeFileSync(
        join(pluginDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      let config = { plugins: [] };
      let plugins = await loadPlugins(null, config, mockLogger);

      expect(plugins).toHaveLength(0);
    });

    it('should warn about invalid plugin paths', async () => {
      // Create mock plugin with path traversal attempt
      let pluginDir = join(
        testDir,
        'node_modules',
        '@vizzly-testing',
        'bad-plugin'
      );
      mkdirSync(pluginDir, { recursive: true });

      let packageJson = {
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

      let config = { plugins: [] };
      let plugins = await loadPlugins(null, config, mockLogger);

      expect(plugins).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid plugin path')
      );
    });

    it('should handle multiple plugins', async () => {
      // Create first plugin
      let plugin1Dir = join(
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
      let plugin2Dir = join(
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

      let config = { plugins: [] };
      let plugins = await loadPlugins(null, config, mockLogger);

      expect(plugins).toHaveLength(2);
      expect(plugins.map(p => p.name).sort()).toEqual(['plugin-1', 'plugin-2']);
    });
  });

  describe('Config-based loading', () => {
    it('should load plugins from config', async () => {
      // Create plugin file
      let pluginPath = join(testDir, 'custom-plugin.js');
      writeFileSync(
        pluginPath,
        'export default { name: "custom", version: "2.0.0", register() {} };'
      );

      // Create a config file path
      let configFilePath = join(testDir, 'vizzly.config.js');

      let config = {
        plugins: ['./custom-plugin.js'],
      };

      let plugins = await loadPlugins(configFilePath, config, mockLogger);

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('custom');
    });

    it('should handle plugin load errors gracefully', async () => {
      let configFilePath = join(testDir, 'vizzly.config.js');

      let config = {
        plugins: ['./non-existent-plugin.js'],
      };

      let plugins = await loadPlugins(configFilePath, config, mockLogger);

      expect(plugins).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load plugin')
      );
    });
  });

  describe('Deduplication', () => {
    it('should not load the same plugin twice', async () => {
      // Create auto-discoverable plugin
      let pluginDir = join(
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
      let config = {
        plugins: ['@vizzly-testing/test-plugin'],
      };

      let plugins = await loadPlugins(null, config, mockLogger);

      // Should only load once
      expect(plugins).toHaveLength(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('already loaded')
      );
    });
  });

  describe('Validation', () => {
    it('should validate plugin has required name field', async () => {
      let pluginPath = join(testDir, 'no-name.js');
      writeFileSync(pluginPath, 'export default { register() {} };');

      let configFilePath = join(testDir, 'vizzly.config.js');
      let config = { plugins: ['./no-name.js'] };
      let plugins = await loadPlugins(configFilePath, config, mockLogger);

      expect(plugins).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('name: Required')
      );
    });

    it('should validate plugin has required register function', async () => {
      let pluginPath = join(testDir, 'no-register.js');
      writeFileSync(pluginPath, 'export default { name: "test" };');

      let configFilePath = join(testDir, 'vizzly.config.js');
      let config = { plugins: ['./no-register.js'] };
      let plugins = await loadPlugins(configFilePath, config, mockLogger);

      expect(plugins).toHaveLength(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('register: Required')
      );
    });

    it('should accept plugins without version field', async () => {
      let pluginPath = join(testDir, 'no-version.js');
      writeFileSync(
        pluginPath,
        'export default { name: "test", register() {} };'
      );

      let configFilePath = join(testDir, 'vizzly.config.js');
      let config = { plugins: ['./no-version.js'] };
      let plugins = await loadPlugins(configFilePath, config, mockLogger);

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('test');
    });
  });
});
