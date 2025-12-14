import { describe, expect, it } from 'vitest';
import {
  buildGlobalConfigResult,
  buildMergedConfig,
  buildProjectConfigResult,
  buildValidationFailure,
  buildValidationSuccess,
  CONFIG_DEFAULTS,
  deepMerge,
  extractCosmiconfigResult,
  extractEnvOverrides,
  getConfigFormat,
  serializeConfig,
  serializeToJavaScript,
  serializeToJson,
  stringifyWithIndent,
  validateReadScope,
  validateWriteScope,
} from '../../src/config/core.js';
import { VizzlyError } from '../../src/errors/vizzly-error.js';

describe('config/core', () => {
  describe('CONFIG_DEFAULTS', () => {
    it('has expected default values', () => {
      expect(CONFIG_DEFAULTS.apiUrl).toBe('https://app.vizzly.dev');
      expect(CONFIG_DEFAULTS.server.port).toBe(47392);
      expect(CONFIG_DEFAULTS.comparison.threshold).toBe(2.0);
      expect(CONFIG_DEFAULTS.tdd.openReport).toBe(false);
      expect(CONFIG_DEFAULTS.plugins).toEqual([]);
    });
  });

  describe('validateReadScope', () => {
    it('validates project scope', () => {
      let result = validateReadScope('project');
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('validates global scope', () => {
      let result = validateReadScope('global');
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('validates merged scope', () => {
      let result = validateReadScope('merged');
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('rejects invalid scope', () => {
      let result = validateReadScope('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toBeInstanceOf(VizzlyError);
      expect(result.error.code).toBe('INVALID_CONFIG_SCOPE');
    });
  });

  describe('validateWriteScope', () => {
    it('validates project scope', () => {
      let result = validateWriteScope('project');
      expect(result.valid).toBe(true);
    });

    it('validates global scope', () => {
      let result = validateWriteScope('global');
      expect(result.valid).toBe(true);
    });

    it('rejects merged scope for writing', () => {
      let result = validateWriteScope('merged');
      expect(result.valid).toBe(false);
      expect(result.error.code).toBe('INVALID_CONFIG_SCOPE');
    });

    it('rejects invalid scope', () => {
      let result = validateWriteScope('invalid');
      expect(result.valid).toBe(false);
    });
  });

  describe('deepMerge', () => {
    it('merges flat objects', () => {
      let target = { a: 1, b: 2 };
      let source = { b: 3, c: 4 };
      let result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('merges nested objects', () => {
      let target = { server: { port: 8080, timeout: 1000 } };
      let source = { server: { port: 3000 } };
      let result = deepMerge(target, source);

      expect(result).toEqual({ server: { port: 3000, timeout: 1000 } });
    });

    it('does not mutate input objects', () => {
      let target = { a: 1, nested: { b: 2 } };
      let source = { nested: { c: 3 } };
      let result = deepMerge(target, source);

      expect(target).toEqual({ a: 1, nested: { b: 2 } });
      expect(source).toEqual({ nested: { c: 3 } });
      expect(result.nested).toEqual({ b: 2, c: 3 });
    });

    it('replaces arrays (does not merge)', () => {
      let target = { plugins: ['a', 'b'] };
      let source = { plugins: ['c'] };
      let result = deepMerge(target, source);

      expect(result.plugins).toEqual(['c']);
    });

    it('handles null and undefined in source', () => {
      let target = { a: 1 };
      let source = { b: null, c: undefined };
      let result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: null, c: undefined });
    });

    it('replaces non-object with object', () => {
      let target = { server: 'string' };
      let source = { server: { port: 3000 } };
      let result = deepMerge(target, source);

      expect(result.server).toEqual({ port: 3000 });
    });
  });

  describe('buildMergedConfig', () => {
    it('starts with defaults', () => {
      let { config, sources } = buildMergedConfig({});

      expect(config.apiUrl).toBe(CONFIG_DEFAULTS.apiUrl);
      expect(sources.apiUrl).toBe('default');
    });

    it('overlays global auth and projects', () => {
      let { config, sources } = buildMergedConfig({
        globalConfig: {
          auth: { accessToken: 'token123' },
          projects: { '/path': { id: 'proj_1' } },
        },
      });

      expect(config.auth).toEqual({ accessToken: 'token123' });
      expect(sources.auth).toBe('global');
      expect(config.projects).toEqual({ '/path': { id: 'proj_1' } });
      expect(sources.projects).toBe('global');
    });

    it('overlays project config on top of global', () => {
      let { config, sources } = buildMergedConfig({
        projectConfig: {
          comparison: { threshold: 5.0 },
        },
      });

      expect(config.comparison).toEqual({ threshold: 5.0 });
      expect(sources.comparison).toBe('project');
    });

    it('overlays env overrides on top of project', () => {
      let { config, sources } = buildMergedConfig({
        projectConfig: { apiUrl: 'https://project.example.com' },
        envOverrides: { apiUrl: 'https://env.example.com' },
      });

      expect(config.apiUrl).toBe('https://env.example.com');
      expect(sources.apiUrl).toBe('env');
    });

    it('handles all layers together', () => {
      let { config, sources } = buildMergedConfig({
        globalConfig: { auth: { accessToken: 'global_token' } },
        projectConfig: { comparison: { threshold: 3.0 } },
        envOverrides: { apiKey: 'env_key' },
      });

      expect(config.apiUrl).toBe(CONFIG_DEFAULTS.apiUrl);
      expect(sources.apiUrl).toBe('default');
      expect(config.auth).toEqual({ accessToken: 'global_token' });
      expect(sources.auth).toBe('global');
      expect(config.comparison).toEqual({ threshold: 3.0 });
      expect(sources.comparison).toBe('project');
      expect(config.apiKey).toBe('env_key');
      expect(sources.apiKey).toBe('env');
    });

    it('handles null inputs gracefully', () => {
      let { config, sources } = buildMergedConfig({
        projectConfig: null,
        globalConfig: null,
        envOverrides: null,
      });

      expect(config.apiUrl).toBe(CONFIG_DEFAULTS.apiUrl);
      expect(sources.apiUrl).toBe('default');
    });

    it('handles non-object inputs gracefully', () => {
      let { config, sources } = buildMergedConfig({
        projectConfig: 'string',
        globalConfig: 123,
        envOverrides: ['array'],
      });

      expect(config.apiUrl).toBe(CONFIG_DEFAULTS.apiUrl);
      expect(sources.apiUrl).toBe('default');
    });

    it('handles undefined options', () => {
      let { config, sources } = buildMergedConfig();

      expect(config.apiUrl).toBe(CONFIG_DEFAULTS.apiUrl);
      expect(sources.apiUrl).toBe('default');
    });
  });

  describe('extractEnvOverrides', () => {
    it('extracts VIZZLY_TOKEN as apiKey', () => {
      let overrides = extractEnvOverrides({ VIZZLY_TOKEN: 'my_token' });
      expect(overrides).toEqual({ apiKey: 'my_token' });
    });

    it('extracts VIZZLY_API_URL as apiUrl', () => {
      let overrides = extractEnvOverrides({
        VIZZLY_API_URL: 'https://custom.api.com',
      });
      expect(overrides).toEqual({ apiUrl: 'https://custom.api.com' });
    });

    it('extracts both when present', () => {
      let overrides = extractEnvOverrides({
        VIZZLY_TOKEN: 'token',
        VIZZLY_API_URL: 'https://api.com',
      });
      expect(overrides).toEqual({
        apiKey: 'token',
        apiUrl: 'https://api.com',
      });
    });

    it('returns empty object when no env vars', () => {
      let overrides = extractEnvOverrides({});
      expect(overrides).toEqual({});
    });

    it('ignores unrelated env vars', () => {
      let overrides = extractEnvOverrides({
        NODE_ENV: 'test',
        OTHER_VAR: 'value',
      });
      expect(overrides).toEqual({});
    });
  });

  describe('buildProjectConfigResult', () => {
    it('builds result for found config', () => {
      let config = { comparison: { threshold: 3.0 } };
      let result = buildProjectConfigResult(config, '/path/vizzly.config.js');

      expect(result.config).toEqual(config);
      expect(result.filepath).toBe('/path/vizzly.config.js');
      expect(result.isEmpty).toBe(false);
    });

    it('builds result for empty config', () => {
      let result = buildProjectConfigResult({}, '/path/vizzly.config.js');

      expect(result.config).toEqual({});
      expect(result.isEmpty).toBe(true);
    });

    it('builds result for not found config', () => {
      let result = buildProjectConfigResult(null, null);

      expect(result.config).toEqual({});
      expect(result.filepath).toBeNull();
      expect(result.isEmpty).toBe(true);
    });
  });

  describe('buildGlobalConfigResult', () => {
    it('builds result for global config', () => {
      let config = { auth: { accessToken: 'token' } };
      let result = buildGlobalConfigResult(config, '~/.vizzly/config.json');

      expect(result.config).toEqual(config);
      expect(result.filepath).toBe('~/.vizzly/config.json');
      expect(result.isEmpty).toBe(false);
    });

    it('builds result for empty config', () => {
      let result = buildGlobalConfigResult({}, '~/.vizzly/config.json');

      expect(result.isEmpty).toBe(true);
    });
  });

  describe('stringifyWithIndent', () => {
    it('stringifies strings with single quotes', () => {
      expect(stringifyWithIndent('hello')).toBe("'hello'");
    });

    it('escapes single quotes in strings', () => {
      expect(stringifyWithIndent("it's")).toBe("'it\\'s'");
    });

    it('stringifies numbers', () => {
      expect(stringifyWithIndent(42)).toBe('42');
      expect(stringifyWithIndent(3.14)).toBe('3.14');
    });

    it('stringifies booleans', () => {
      expect(stringifyWithIndent(true)).toBe('true');
      expect(stringifyWithIndent(false)).toBe('false');
    });

    it('stringifies null and undefined', () => {
      expect(stringifyWithIndent(null)).toBe('null');
      expect(stringifyWithIndent(undefined)).toBe('undefined');
    });

    it('stringifies empty array', () => {
      expect(stringifyWithIndent([])).toBe('[]');
    });

    it('stringifies empty object', () => {
      expect(stringifyWithIndent({})).toBe('{}');
    });

    it('stringifies array with items', () => {
      let result = stringifyWithIndent(['a', 'b'], 1);
      expect(result).toContain("'a'");
      expect(result).toContain("'b'");
      expect(result).toMatch(/\[\n.*\n\]/s);
    });

    it('stringifies object with properties', () => {
      let result = stringifyWithIndent({ port: 3000 }, 1);
      expect(result).toContain('port: 3000');
      expect(result).toMatch(/\{\n.*\n\}/s);
    });
  });

  describe('serializeToJavaScript', () => {
    it('creates valid JS module format', () => {
      let result = serializeToJavaScript({ comparison: { threshold: 3.0 } });

      expect(result).toContain('import { defineConfig }');
      expect(result).toContain('@vizzly-testing/cli/config');
      expect(result).toContain('export default defineConfig(');
      expect(result).toContain('comparison:');
      expect(result).toContain('threshold: 3');
    });

    it('includes header comment', () => {
      let result = serializeToJavaScript({});

      expect(result).toContain('Vizzly Configuration');
      expect(result).toContain('@see https://docs.vizzly.dev');
    });
  });

  describe('serializeToJson', () => {
    it('creates formatted JSON', () => {
      let result = serializeToJson({ port: 3000 });

      expect(result).toBe('{\n  "port": 3000\n}');
    });
  });

  describe('getConfigFormat', () => {
    it('detects JavaScript format', () => {
      expect(getConfigFormat('vizzly.config.js')).toBe('javascript');
      expect(getConfigFormat('/path/to/vizzly.config.mjs')).toBe('javascript');
    });

    it('detects JSON format', () => {
      expect(getConfigFormat('.vizzlyrc.json')).toBe('json');
    });

    it('detects package.json format', () => {
      expect(getConfigFormat('/path/package.json')).toBe('package');
    });

    it('returns unknown for other formats', () => {
      expect(getConfigFormat('vizzly.config.ts')).toBe('unknown');
      expect(getConfigFormat('vizzly.yaml')).toBe('unknown');
    });
  });

  describe('serializeConfig', () => {
    it('serializes to JavaScript', () => {
      let result = serializeConfig({ port: 3000 }, 'vizzly.config.js');

      expect(result.format).toBe('javascript');
      expect(result.content).toContain('defineConfig');
      expect(result.error).toBeNull();
    });

    it('serializes to JSON', () => {
      let result = serializeConfig({ port: 3000 }, '.vizzlyrc.json');

      expect(result.format).toBe('json');
      expect(result.content).toBe('{\n  "port": 3000\n}');
      expect(result.error).toBeNull();
    });

    it('returns null content for package.json', () => {
      let result = serializeConfig({ port: 3000 }, 'package.json');

      expect(result.format).toBe('package');
      expect(result.content).toBeNull();
      expect(result.error).toBeNull();
    });

    it('returns error for unknown format', () => {
      let result = serializeConfig({ port: 3000 }, 'config.yaml');

      expect(result.format).toBe('unknown');
      expect(result.content).toBeNull();
      expect(result.error).toBeInstanceOf(VizzlyError);
      expect(result.error.code).toBe('UNSUPPORTED_CONFIG_FORMAT');
    });
  });

  describe('extractCosmiconfigResult', () => {
    it('extracts config from result', () => {
      let cosmicResult = {
        config: { comparison: { threshold: 3.0 } },
        filepath: '/path/vizzly.config.js',
      };

      let { config, filepath } = extractCosmiconfigResult(cosmicResult);

      expect(config).toEqual({ comparison: { threshold: 3.0 } });
      expect(filepath).toBe('/path/vizzly.config.js');
    });

    it('handles default export', () => {
      let cosmicResult = {
        config: { default: { comparison: { threshold: 3.0 } } },
        filepath: '/path/vizzly.config.js',
      };

      let { config } = extractCosmiconfigResult(cosmicResult);

      expect(config).toEqual({ comparison: { threshold: 3.0 } });
    });

    it('returns null for missing result', () => {
      let { config, filepath } = extractCosmiconfigResult(null);

      expect(config).toBeNull();
      expect(filepath).toBeNull();
    });

    it('returns null for empty result', () => {
      let { config, filepath } = extractCosmiconfigResult({});

      expect(config).toBeNull();
      expect(filepath).toBeNull();
    });
  });

  describe('buildValidationSuccess', () => {
    it('builds success result', () => {
      let validatedConfig = { port: 3000 };
      let result = buildValidationSuccess(validatedConfig);

      expect(result.valid).toBe(true);
      expect(result.config).toEqual(validatedConfig);
      expect(result.errors).toEqual([]);
    });
  });

  describe('buildValidationFailure', () => {
    it('builds failure result with errors array', () => {
      let error = { errors: [{ message: 'Invalid port' }] };
      let result = buildValidationFailure(error);

      expect(result.valid).toBe(false);
      expect(result.config).toBeNull();
      expect(result.errors).toEqual([{ message: 'Invalid port' }]);
    });

    it('builds failure result with message only', () => {
      let error = { message: 'Something went wrong' };
      let result = buildValidationFailure(error);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual([{ message: 'Something went wrong' }]);
    });
  });
});
