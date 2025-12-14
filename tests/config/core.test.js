import assert from 'node:assert';
import { describe, it } from 'node:test';
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
      assert.strictEqual(CONFIG_DEFAULTS.apiUrl, 'https://app.vizzly.dev');
      assert.strictEqual(CONFIG_DEFAULTS.server.port, 47392);
      assert.strictEqual(CONFIG_DEFAULTS.comparison.threshold, 2.0);
      assert.strictEqual(CONFIG_DEFAULTS.tdd.openReport, false);
      assert.deepStrictEqual(CONFIG_DEFAULTS.plugins, []);
    });
  });

  describe('validateReadScope', () => {
    it('validates project scope', () => {
      let result = validateReadScope('project');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, null);
    });

    it('validates global scope', () => {
      let result = validateReadScope('global');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, null);
    });

    it('validates merged scope', () => {
      let result = validateReadScope('merged');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, null);
    });

    it('rejects invalid scope', () => {
      let result = validateReadScope('invalid');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error instanceof VizzlyError);
      assert.strictEqual(result.error.code, 'INVALID_CONFIG_SCOPE');
    });
  });

  describe('validateWriteScope', () => {
    it('validates project scope', () => {
      let result = validateWriteScope('project');
      assert.strictEqual(result.valid, true);
    });

    it('validates global scope', () => {
      let result = validateWriteScope('global');
      assert.strictEqual(result.valid, true);
    });

    it('rejects merged scope for writing', () => {
      let result = validateWriteScope('merged');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error.code, 'INVALID_CONFIG_SCOPE');
    });

    it('rejects invalid scope', () => {
      let result = validateWriteScope('invalid');
      assert.strictEqual(result.valid, false);
    });
  });

  describe('deepMerge', () => {
    it('merges flat objects', () => {
      let target = { a: 1, b: 2 };
      let source = { b: 3, c: 4 };
      let result = deepMerge(target, source);

      assert.deepStrictEqual(result, { a: 1, b: 3, c: 4 });
    });

    it('merges nested objects', () => {
      let target = { server: { port: 8080, timeout: 1000 } };
      let source = { server: { port: 3000 } };
      let result = deepMerge(target, source);

      assert.deepStrictEqual(result, { server: { port: 3000, timeout: 1000 } });
    });

    it('does not mutate input objects', () => {
      let target = { a: 1, nested: { b: 2 } };
      let source = { nested: { c: 3 } };
      let result = deepMerge(target, source);

      assert.deepStrictEqual(target, { a: 1, nested: { b: 2 } });
      assert.deepStrictEqual(source, { nested: { c: 3 } });
      assert.deepStrictEqual(result.nested, { b: 2, c: 3 });
    });

    it('replaces arrays (does not merge)', () => {
      let target = { plugins: ['a', 'b'] };
      let source = { plugins: ['c'] };
      let result = deepMerge(target, source);

      assert.deepStrictEqual(result.plugins, ['c']);
    });

    it('handles null and undefined in source', () => {
      let target = { a: 1 };
      let source = { b: null, c: undefined };
      let result = deepMerge(target, source);

      assert.deepStrictEqual(result, { a: 1, b: null, c: undefined });
    });

    it('replaces non-object with object', () => {
      let target = { server: 'string' };
      let source = { server: { port: 3000 } };
      let result = deepMerge(target, source);

      assert.deepStrictEqual(result.server, { port: 3000 });
    });
  });

  describe('buildMergedConfig', () => {
    it('starts with defaults', () => {
      let { config, sources } = buildMergedConfig({});

      assert.strictEqual(config.apiUrl, CONFIG_DEFAULTS.apiUrl);
      assert.strictEqual(sources.apiUrl, 'default');
    });

    it('overlays global auth and projects', () => {
      let { config, sources } = buildMergedConfig({
        globalConfig: {
          auth: { accessToken: 'token123' },
          projects: { '/path': { id: 'proj_1' } },
        },
      });

      assert.deepStrictEqual(config.auth, { accessToken: 'token123' });
      assert.strictEqual(sources.auth, 'global');
      assert.deepStrictEqual(config.projects, { '/path': { id: 'proj_1' } });
      assert.strictEqual(sources.projects, 'global');
    });

    it('overlays project config on top of global', () => {
      let { config, sources } = buildMergedConfig({
        projectConfig: {
          comparison: { threshold: 5.0 },
        },
      });

      assert.deepStrictEqual(config.comparison, { threshold: 5.0 });
      assert.strictEqual(sources.comparison, 'project');
    });

    it('overlays env overrides on top of project', () => {
      let { config, sources } = buildMergedConfig({
        projectConfig: { apiUrl: 'https://project.example.com' },
        envOverrides: { apiUrl: 'https://env.example.com' },
      });

      assert.strictEqual(config.apiUrl, 'https://env.example.com');
      assert.strictEqual(sources.apiUrl, 'env');
    });

    it('handles all layers together', () => {
      let { config, sources } = buildMergedConfig({
        globalConfig: { auth: { accessToken: 'global_token' } },
        projectConfig: { comparison: { threshold: 3.0 } },
        envOverrides: { apiKey: 'env_key' },
      });

      assert.strictEqual(config.apiUrl, CONFIG_DEFAULTS.apiUrl);
      assert.strictEqual(sources.apiUrl, 'default');
      assert.deepStrictEqual(config.auth, { accessToken: 'global_token' });
      assert.strictEqual(sources.auth, 'global');
      assert.deepStrictEqual(config.comparison, { threshold: 3.0 });
      assert.strictEqual(sources.comparison, 'project');
      assert.strictEqual(config.apiKey, 'env_key');
      assert.strictEqual(sources.apiKey, 'env');
    });

    it('handles null inputs gracefully', () => {
      let { config, sources } = buildMergedConfig({
        projectConfig: null,
        globalConfig: null,
        envOverrides: null,
      });

      assert.strictEqual(config.apiUrl, CONFIG_DEFAULTS.apiUrl);
      assert.strictEqual(sources.apiUrl, 'default');
    });

    it('handles non-object inputs gracefully', () => {
      let { config, sources } = buildMergedConfig({
        projectConfig: 'string',
        globalConfig: 123,
        envOverrides: ['array'],
      });

      assert.strictEqual(config.apiUrl, CONFIG_DEFAULTS.apiUrl);
      assert.strictEqual(sources.apiUrl, 'default');
    });

    it('handles undefined options', () => {
      let { config, sources } = buildMergedConfig();

      assert.strictEqual(config.apiUrl, CONFIG_DEFAULTS.apiUrl);
      assert.strictEqual(sources.apiUrl, 'default');
    });
  });

  describe('extractEnvOverrides', () => {
    it('extracts VIZZLY_TOKEN as apiKey', () => {
      let overrides = extractEnvOverrides({ VIZZLY_TOKEN: 'my_token' });
      assert.deepStrictEqual(overrides, { apiKey: 'my_token' });
    });

    it('extracts VIZZLY_API_URL as apiUrl', () => {
      let overrides = extractEnvOverrides({
        VIZZLY_API_URL: 'https://custom.api.com',
      });
      assert.deepStrictEqual(overrides, { apiUrl: 'https://custom.api.com' });
    });

    it('extracts both when present', () => {
      let overrides = extractEnvOverrides({
        VIZZLY_TOKEN: 'token',
        VIZZLY_API_URL: 'https://api.com',
      });
      assert.deepStrictEqual(overrides, {
        apiKey: 'token',
        apiUrl: 'https://api.com',
      });
    });

    it('returns empty object when no env vars', () => {
      let overrides = extractEnvOverrides({});
      assert.deepStrictEqual(overrides, {});
    });

    it('ignores unrelated env vars', () => {
      let overrides = extractEnvOverrides({
        NODE_ENV: 'test',
        OTHER_VAR: 'value',
      });
      assert.deepStrictEqual(overrides, {});
    });
  });

  describe('buildProjectConfigResult', () => {
    it('builds result for found config', () => {
      let config = { comparison: { threshold: 3.0 } };
      let result = buildProjectConfigResult(config, '/path/vizzly.config.js');

      assert.deepStrictEqual(result.config, config);
      assert.strictEqual(result.filepath, '/path/vizzly.config.js');
      assert.strictEqual(result.isEmpty, false);
    });

    it('builds result for empty config', () => {
      let result = buildProjectConfigResult({}, '/path/vizzly.config.js');

      assert.deepStrictEqual(result.config, {});
      assert.strictEqual(result.isEmpty, true);
    });

    it('builds result for not found config', () => {
      let result = buildProjectConfigResult(null, null);

      assert.deepStrictEqual(result.config, {});
      assert.strictEqual(result.filepath, null);
      assert.strictEqual(result.isEmpty, true);
    });
  });

  describe('buildGlobalConfigResult', () => {
    it('builds result for global config', () => {
      let config = { auth: { accessToken: 'token' } };
      let result = buildGlobalConfigResult(config, '~/.vizzly/config.json');

      assert.deepStrictEqual(result.config, config);
      assert.strictEqual(result.filepath, '~/.vizzly/config.json');
      assert.strictEqual(result.isEmpty, false);
    });

    it('builds result for empty config', () => {
      let result = buildGlobalConfigResult({}, '~/.vizzly/config.json');

      assert.strictEqual(result.isEmpty, true);
    });
  });

  describe('stringifyWithIndent', () => {
    it('stringifies strings with single quotes', () => {
      assert.strictEqual(stringifyWithIndent('hello'), "'hello'");
    });

    it('escapes single quotes in strings', () => {
      assert.strictEqual(stringifyWithIndent("it's"), "'it\\'s'");
    });

    it('stringifies numbers', () => {
      assert.strictEqual(stringifyWithIndent(42), '42');
      assert.strictEqual(stringifyWithIndent(3.14), '3.14');
    });

    it('stringifies booleans', () => {
      assert.strictEqual(stringifyWithIndent(true), 'true');
      assert.strictEqual(stringifyWithIndent(false), 'false');
    });

    it('stringifies null and undefined', () => {
      assert.strictEqual(stringifyWithIndent(null), 'null');
      assert.strictEqual(stringifyWithIndent(undefined), 'undefined');
    });

    it('stringifies empty array', () => {
      assert.strictEqual(stringifyWithIndent([]), '[]');
    });

    it('stringifies empty object', () => {
      assert.strictEqual(stringifyWithIndent({}), '{}');
    });

    it('stringifies array with items', () => {
      let result = stringifyWithIndent(['a', 'b'], 1);
      assert.ok(result.includes("'a'"));
      assert.ok(result.includes("'b'"));
      assert.match(result, /\[\n.*\n\]/s);
    });

    it('stringifies object with properties', () => {
      let result = stringifyWithIndent({ port: 3000 }, 1);
      assert.ok(result.includes('port: 3000'));
      assert.match(result, /\{\n.*\n\}/s);
    });
  });

  describe('serializeToJavaScript', () => {
    it('creates valid JS module format', () => {
      let result = serializeToJavaScript({ comparison: { threshold: 3.0 } });

      assert.ok(result.includes('import { defineConfig }'));
      assert.ok(result.includes('@vizzly-testing/cli/config'));
      assert.ok(result.includes('export default defineConfig('));
      assert.ok(result.includes('comparison:'));
      assert.ok(result.includes('threshold: 3'));
    });

    it('includes header comment', () => {
      let result = serializeToJavaScript({});

      assert.ok(result.includes('Vizzly Configuration'));
      assert.ok(result.includes('@see https://docs.vizzly.dev'));
    });
  });

  describe('serializeToJson', () => {
    it('creates formatted JSON', () => {
      let result = serializeToJson({ port: 3000 });

      assert.strictEqual(result, '{\n  "port": 3000\n}');
    });
  });

  describe('getConfigFormat', () => {
    it('detects JavaScript format', () => {
      assert.strictEqual(getConfigFormat('vizzly.config.js'), 'javascript');
      assert.strictEqual(
        getConfigFormat('/path/to/vizzly.config.mjs'),
        'javascript'
      );
    });

    it('detects JSON format', () => {
      assert.strictEqual(getConfigFormat('.vizzlyrc.json'), 'json');
    });

    it('detects package.json format', () => {
      assert.strictEqual(getConfigFormat('/path/package.json'), 'package');
    });

    it('returns unknown for other formats', () => {
      assert.strictEqual(getConfigFormat('vizzly.config.ts'), 'unknown');
      assert.strictEqual(getConfigFormat('vizzly.yaml'), 'unknown');
    });
  });

  describe('serializeConfig', () => {
    it('serializes to JavaScript', () => {
      let result = serializeConfig({ port: 3000 }, 'vizzly.config.js');

      assert.strictEqual(result.format, 'javascript');
      assert.ok(result.content.includes('defineConfig'));
      assert.strictEqual(result.error, null);
    });

    it('serializes to JSON', () => {
      let result = serializeConfig({ port: 3000 }, '.vizzlyrc.json');

      assert.strictEqual(result.format, 'json');
      assert.strictEqual(result.content, '{\n  "port": 3000\n}');
      assert.strictEqual(result.error, null);
    });

    it('returns null content for package.json', () => {
      let result = serializeConfig({ port: 3000 }, 'package.json');

      assert.strictEqual(result.format, 'package');
      assert.strictEqual(result.content, null);
      assert.strictEqual(result.error, null);
    });

    it('returns error for unknown format', () => {
      let result = serializeConfig({ port: 3000 }, 'config.yaml');

      assert.strictEqual(result.format, 'unknown');
      assert.strictEqual(result.content, null);
      assert.ok(result.error instanceof VizzlyError);
      assert.strictEqual(result.error.code, 'UNSUPPORTED_CONFIG_FORMAT');
    });
  });

  describe('extractCosmiconfigResult', () => {
    it('extracts config from result', () => {
      let cosmicResult = {
        config: { comparison: { threshold: 3.0 } },
        filepath: '/path/vizzly.config.js',
      };

      let { config, filepath } = extractCosmiconfigResult(cosmicResult);

      assert.deepStrictEqual(config, { comparison: { threshold: 3.0 } });
      assert.strictEqual(filepath, '/path/vizzly.config.js');
    });

    it('handles default export', () => {
      let cosmicResult = {
        config: { default: { comparison: { threshold: 3.0 } } },
        filepath: '/path/vizzly.config.js',
      };

      let { config } = extractCosmiconfigResult(cosmicResult);

      assert.deepStrictEqual(config, { comparison: { threshold: 3.0 } });
    });

    it('returns null for missing result', () => {
      let { config, filepath } = extractCosmiconfigResult(null);

      assert.strictEqual(config, null);
      assert.strictEqual(filepath, null);
    });

    it('returns null for empty result', () => {
      let { config, filepath } = extractCosmiconfigResult({});

      assert.strictEqual(config, null);
      assert.strictEqual(filepath, null);
    });
  });

  describe('buildValidationSuccess', () => {
    it('builds success result', () => {
      let validatedConfig = { port: 3000 };
      let result = buildValidationSuccess(validatedConfig);

      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.config, validatedConfig);
      assert.deepStrictEqual(result.errors, []);
    });
  });

  describe('buildValidationFailure', () => {
    it('builds failure result with errors array', () => {
      let error = { errors: [{ message: 'Invalid port' }] };
      let result = buildValidationFailure(error);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.config, null);
      assert.deepStrictEqual(result.errors, [{ message: 'Invalid port' }]);
    });

    it('builds failure result with message only', () => {
      let error = { message: 'Something went wrong' };
      let result = buildValidationFailure(error);

      assert.strictEqual(result.valid, false);
      assert.deepStrictEqual(result.errors, [
        { message: 'Something went wrong' },
      ]);
    });
  });
});
