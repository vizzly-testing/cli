import { describe, expect, it } from 'vitest';
import {
  getConfig,
  getConfigSource,
  getGlobalConfig,
  getMergedConfig,
  getProjectConfig,
  updateConfig,
  updateGlobalConfig,
  updateProjectConfig,
  validateConfig,
  writeProjectConfigFile,
} from '../../src/config/operations.js';
import { VizzlyError } from '../../src/errors/vizzly-error.js';
import {
  createConfigDependencies,
  createInMemoryFs,
  createInMemoryGlobalConfigStore,
  createMockExplorer,
  createMockValidator,
} from './test-helpers.js';

describe('config/operations', () => {
  describe('getProjectConfig', () => {
    it('returns config from explorer', async () => {
      let searchResult = {
        config: { comparison: { threshold: 3.0 } },
        filepath: '/project/vizzly.config.js',
      };
      let explorer = createMockExplorer(searchResult);

      let result = await getProjectConfig(explorer, '/project');

      expect(result.config).toEqual({ comparison: { threshold: 3.0 } });
      expect(result.filepath).toBe('/project/vizzly.config.js');
      expect(result.isEmpty).toBe(false);
    });

    it('returns empty config when not found', async () => {
      let explorer = createMockExplorer(null);

      let result = await getProjectConfig(explorer, '/project');

      expect(result.config).toEqual({});
      expect(result.filepath).toBeNull();
      expect(result.isEmpty).toBe(true);
    });

    it('handles default export', async () => {
      let searchResult = {
        config: { default: { port: 3000 } },
        filepath: '/project/vizzly.config.js',
      };
      let explorer = createMockExplorer(searchResult);

      let result = await getProjectConfig(explorer, '/project');

      expect(result.config).toEqual({ port: 3000 });
    });

    it('passes projectRoot to explorer', async () => {
      let explorer = createMockExplorer(null);

      await getProjectConfig(explorer, '/custom/project/path');

      expect(explorer._getSearches()).toContain('/custom/project/path');
    });
  });

  describe('getGlobalConfig', () => {
    it('returns config from store', async () => {
      let store = createInMemoryGlobalConfigStore(
        { auth: { accessToken: 'token123' } },
        '~/.vizzly/config.json'
      );

      let result = await getGlobalConfig(store);

      expect(result.config).toEqual({ auth: { accessToken: 'token123' } });
      expect(result.filepath).toBe('~/.vizzly/config.json');
      expect(result.isEmpty).toBe(false);
    });

    it('returns empty config when store is empty', async () => {
      let store = createInMemoryGlobalConfigStore({});

      let result = await getGlobalConfig(store);

      expect(result.config).toEqual({});
      expect(result.isEmpty).toBe(true);
    });
  });

  describe('getMergedConfig', () => {
    it('merges all config sources', async () => {
      let projectConfig = { comparison: { threshold: 5.0 } };
      let globalConfig = { auth: { accessToken: 'token' } };

      let deps = createConfigDependencies({
        projectConfig,
        globalConfig,
      });

      let result = await getMergedConfig({
        explorer: deps.explorer,
        globalConfigStore: deps.globalConfigStore,
        projectRoot: deps.projectRoot,
      });

      // Defaults
      expect(result.config.apiUrl).toBe('https://app.vizzly.dev');
      expect(result.sources.apiUrl).toBe('default');

      // Global
      expect(result.config.auth).toEqual({ accessToken: 'token' });
      expect(result.sources.auth).toBe('global');

      // Project
      expect(result.config.comparison).toEqual({ threshold: 5.0 });
      expect(result.sources.comparison).toBe('project');
    });

    it('applies env overrides', async () => {
      let deps = createConfigDependencies({
        projectConfig: { apiUrl: 'https://project.api.com' },
      });

      let result = await getMergedConfig({
        explorer: deps.explorer,
        globalConfigStore: deps.globalConfigStore,
        projectRoot: deps.projectRoot,
        env: { VIZZLY_API_URL: 'https://env.api.com' },
      });

      expect(result.config.apiUrl).toBe('https://env.api.com');
      expect(result.sources.apiUrl).toBe('env');
    });

    it('includes filepaths', async () => {
      let deps = createConfigDependencies({
        projectConfig: { port: 3000 },
        globalConfig: { auth: {} },
        globalConfigPath: '/home/user/.vizzly/config.json',
      });

      let result = await getMergedConfig({
        explorer: deps.explorer,
        globalConfigStore: deps.globalConfigStore,
        projectRoot: deps.projectRoot,
      });

      expect(result.projectFilepath).toContain('vizzly.config.js');
      expect(result.globalFilepath).toBe('/home/user/.vizzly/config.json');
    });
  });

  describe('getConfig', () => {
    it('returns project config for project scope', async () => {
      let deps = createConfigDependencies({
        projectConfig: { comparison: { threshold: 3.0 } },
      });

      let result = await getConfig({
        scope: 'project',
        explorer: deps.explorer,
        globalConfigStore: deps.globalConfigStore,
        projectRoot: deps.projectRoot,
      });

      expect(result.config).toEqual({ comparison: { threshold: 3.0 } });
      expect(result.filepath).toContain('vizzly.config.js');
    });

    it('returns global config for global scope', async () => {
      let deps = createConfigDependencies({
        globalConfig: { auth: { accessToken: 'token' } },
      });

      let result = await getConfig({
        scope: 'global',
        explorer: deps.explorer,
        globalConfigStore: deps.globalConfigStore,
        projectRoot: deps.projectRoot,
      });

      expect(result.config).toEqual({ auth: { accessToken: 'token' } });
    });

    it('returns merged config for merged scope', async () => {
      let deps = createConfigDependencies({
        projectConfig: { comparison: { threshold: 5.0 } },
        globalConfig: { auth: { accessToken: 'token' } },
      });

      let result = await getConfig({
        scope: 'merged',
        explorer: deps.explorer,
        globalConfigStore: deps.globalConfigStore,
        projectRoot: deps.projectRoot,
      });

      expect(result.config.comparison).toEqual({ threshold: 5.0 });
      expect(result.config.auth).toEqual({ accessToken: 'token' });
      expect(result.sources).toBeDefined();
    });

    it('defaults to merged scope', async () => {
      let deps = createConfigDependencies({
        projectConfig: { port: 3000 },
      });

      let result = await getConfig({
        explorer: deps.explorer,
        globalConfigStore: deps.globalConfigStore,
        projectRoot: deps.projectRoot,
      });

      expect(result.sources).toBeDefined();
    });

    it('throws for invalid scope', async () => {
      let deps = createConfigDependencies({});

      await expect(
        getConfig({
          scope: 'invalid',
          explorer: deps.explorer,
          globalConfigStore: deps.globalConfigStore,
          projectRoot: deps.projectRoot,
        })
      ).rejects.toThrow(VizzlyError);
    });
  });

  describe('updateProjectConfig', () => {
    it('merges updates with existing config', async () => {
      let deps = createConfigDependencies({
        projectConfig: { comparison: { threshold: 2.0 } },
      });

      let result = await updateProjectConfig({
        updates: { comparison: { threshold: 5.0 } },
        explorer: deps.explorer,
        projectRoot: deps.projectRoot,
        writeFile: deps.writeFile,
        readFile: deps.readFile,
        validate: deps.validate,
      });

      expect(result.config.comparison).toEqual({ threshold: 5.0 });
    });

    it('creates new config file if none exists', async () => {
      let deps = createConfigDependencies({
        projectConfig: null,
        projectRoot: '/test/project',
      });

      let result = await updateProjectConfig({
        updates: { comparison: { threshold: 3.0 } },
        explorer: deps.explorer,
        projectRoot: deps.projectRoot,
        writeFile: deps.writeFile,
        readFile: deps.readFile,
        validate: deps.validate,
      });

      expect(result.filepath).toBe('/test/project/vizzly.config.js');
      expect(result.config).toEqual({ comparison: { threshold: 3.0 } });
    });

    it('validates config before writing', async () => {
      let deps = createConfigDependencies({
        projectConfig: {},
        validatorShouldPass: false,
        validatorError: {
          message: 'Invalid threshold',
          errors: [{ message: 'Invalid threshold' }],
        },
      });

      await expect(
        updateProjectConfig({
          updates: { comparison: { threshold: -1 } },
          explorer: deps.explorer,
          projectRoot: deps.projectRoot,
          writeFile: deps.writeFile,
          readFile: deps.readFile,
          validate: deps.validate,
        })
      ).rejects.toThrow('Invalid configuration');
    });

    it('clears cosmiconfig cache after writing', async () => {
      let deps = createConfigDependencies({
        projectConfig: { port: 3000 },
      });

      await updateProjectConfig({
        updates: { port: 4000 },
        explorer: deps.explorer,
        projectRoot: deps.projectRoot,
        writeFile: deps.writeFile,
        readFile: deps.readFile,
        validate: deps.validate,
      });

      expect(deps.explorer._wasCacheCleared()).toBe(true);
    });
  });

  describe('writeProjectConfigFile', () => {
    it('writes JavaScript format', async () => {
      let fs = createInMemoryFs();

      await writeProjectConfigFile({
        filepath: '/project/vizzly.config.js',
        config: { port: 3000 },
        writeFile: fs.writeFile,
        readFile: fs.readFile,
      });

      let content = fs._getFiles()['/project/vizzly.config.js'];
      expect(content).toContain('defineConfig');
      expect(content).toContain('port: 3000');
    });

    it('writes JSON format', async () => {
      let fs = createInMemoryFs();

      await writeProjectConfigFile({
        filepath: '/project/.vizzlyrc.json',
        config: { port: 3000 },
        writeFile: fs.writeFile,
        readFile: fs.readFile,
      });

      let content = fs._getFiles()['/project/.vizzlyrc.json'];
      expect(JSON.parse(content)).toEqual({ port: 3000 });
    });

    it('merges into package.json', async () => {
      let fs = createInMemoryFs({
        '/project/package.json': JSON.stringify({ name: 'my-project' }),
      });

      await writeProjectConfigFile({
        filepath: '/project/package.json',
        config: { port: 3000 },
        writeFile: fs.writeFile,
        readFile: fs.readFile,
      });

      let content = JSON.parse(fs._getFiles()['/project/package.json']);
      expect(content.name).toBe('my-project');
      expect(content.vizzly).toEqual({ port: 3000 });
    });

    it('throws for unsupported format', async () => {
      let fs = createInMemoryFs();

      await expect(
        writeProjectConfigFile({
          filepath: '/project/config.yaml',
          config: { port: 3000 },
          writeFile: fs.writeFile,
          readFile: fs.readFile,
        })
      ).rejects.toThrow('Unsupported config file format');
    });

    it('throws for malformed package.json', async () => {
      let fs = createInMemoryFs({
        '/project/package.json': 'invalid json {',
      });

      await expect(
        writeProjectConfigFile({
          filepath: '/project/package.json',
          config: { port: 3000 },
          writeFile: fs.writeFile,
          readFile: fs.readFile,
        })
      ).rejects.toThrow('Failed to parse package.json');
    });
  });

  describe('updateGlobalConfig', () => {
    it('merges updates with existing config', async () => {
      let store = createInMemoryGlobalConfigStore({
        auth: { accessToken: 'old' },
        projects: { '/path': { id: 'proj_1' } },
      });

      let result = await updateGlobalConfig({
        updates: { auth: { accessToken: 'new' } },
        globalConfigStore: store,
      });

      expect(result.config.auth).toEqual({ accessToken: 'new' });
      expect(result.config.projects).toEqual({ '/path': { id: 'proj_1' } });
    });

    it('saves config to store', async () => {
      let store = createInMemoryGlobalConfigStore({});

      await updateGlobalConfig({
        updates: { auth: { accessToken: 'token' } },
        globalConfigStore: store,
      });

      let savedConfig = store._getState();
      expect(savedConfig.auth).toEqual({ accessToken: 'token' });
    });

    it('returns filepath', async () => {
      let store = createInMemoryGlobalConfigStore(
        {},
        '/home/user/.vizzly/config.json'
      );

      let result = await updateGlobalConfig({
        updates: {},
        globalConfigStore: store,
      });

      expect(result.filepath).toBe('/home/user/.vizzly/config.json');
    });
  });

  describe('updateConfig', () => {
    it('updates project config for project scope', async () => {
      let deps = createConfigDependencies({
        projectConfig: { port: 3000 },
      });

      let result = await updateConfig({
        scope: 'project',
        updates: { port: 4000 },
        explorer: deps.explorer,
        globalConfigStore: deps.globalConfigStore,
        projectRoot: deps.projectRoot,
        writeFile: deps.writeFile,
        readFile: deps.readFile,
        validate: deps.validate,
      });

      expect(result.config.port).toBe(4000);
    });

    it('updates global config for global scope', async () => {
      let deps = createConfigDependencies({
        globalConfig: { auth: { accessToken: 'old' } },
      });

      let result = await updateConfig({
        scope: 'global',
        updates: { auth: { accessToken: 'new' } },
        explorer: deps.explorer,
        globalConfigStore: deps.globalConfigStore,
        projectRoot: deps.projectRoot,
        writeFile: deps.writeFile,
        readFile: deps.readFile,
        validate: deps.validate,
      });

      expect(result.config.auth).toEqual({ accessToken: 'new' });
    });

    it('throws for invalid scope', async () => {
      let deps = createConfigDependencies({});

      await expect(
        updateConfig({
          scope: 'merged',
          updates: {},
          explorer: deps.explorer,
          globalConfigStore: deps.globalConfigStore,
          projectRoot: deps.projectRoot,
          writeFile: deps.writeFile,
          readFile: deps.readFile,
          validate: deps.validate,
        })
      ).rejects.toThrow(VizzlyError);
    });
  });

  describe('validateConfig', () => {
    it('returns success for valid config', () => {
      let validate = createMockValidator({ shouldPass: true });
      let config = { port: 3000 };

      let result = validateConfig(config, validate);

      expect(result.valid).toBe(true);
      expect(result.config).toEqual({ port: 3000 });
      expect(result.errors).toEqual([]);
    });

    it('returns failure for invalid config', () => {
      let validate = createMockValidator({
        shouldPass: false,
        error: {
          message: 'Invalid port',
          errors: [{ message: 'Port must be positive' }],
        },
      });

      let result = validateConfig({ port: -1 }, validate);

      expect(result.valid).toBe(false);
      expect(result.config).toBeNull();
      expect(result.errors).toEqual([{ message: 'Port must be positive' }]);
    });

    it('passes config to validator', () => {
      let validate = createMockValidator({ shouldPass: true });
      let config = { comparison: { threshold: 5.0 } };

      validateConfig(config, validate);

      expect(validate._getCalls()).toContainEqual(config);
    });
  });

  describe('getConfigSource', () => {
    it('returns source for config key', async () => {
      let deps = createConfigDependencies({
        projectConfig: { comparison: { threshold: 5.0 } },
        globalConfig: { auth: { accessToken: 'token' } },
      });

      let comparisonSource = await getConfigSource({
        key: 'comparison',
        explorer: deps.explorer,
        globalConfigStore: deps.globalConfigStore,
        projectRoot: deps.projectRoot,
      });

      let authSource = await getConfigSource({
        key: 'auth',
        explorer: deps.explorer,
        globalConfigStore: deps.globalConfigStore,
        projectRoot: deps.projectRoot,
      });

      let apiUrlSource = await getConfigSource({
        key: 'apiUrl',
        explorer: deps.explorer,
        globalConfigStore: deps.globalConfigStore,
        projectRoot: deps.projectRoot,
      });

      expect(comparisonSource).toBe('project');
      expect(authSource).toBe('global');
      expect(apiUrlSource).toBe('default');
    });

    it('returns unknown for missing key', async () => {
      let deps = createConfigDependencies({});

      let source = await getConfigSource({
        key: 'nonexistent',
        explorer: deps.explorer,
        globalConfigStore: deps.globalConfigStore,
        projectRoot: deps.projectRoot,
      });

      expect(source).toBe('unknown');
    });

    it('respects env overrides', async () => {
      let deps = createConfigDependencies({
        projectConfig: { apiUrl: 'https://project.api.com' },
      });

      let source = await getConfigSource({
        key: 'apiUrl',
        explorer: deps.explorer,
        globalConfigStore: deps.globalConfigStore,
        projectRoot: deps.projectRoot,
        env: { VIZZLY_API_URL: 'https://env.api.com' },
      });

      expect(source).toBe('env');
    });
  });
});
