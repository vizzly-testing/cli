import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  safePath,
  sanitizeScreenshotName,
  validatePathSecurity,
  validateScreenshotName,
  validateScreenshotProperties,
} from '../../src/utils/security.js';

describe('utils/security', () => {
  describe('validateScreenshotName', () => {
    it('accepts valid screenshot name', () => {
      let result = validateScreenshotName('homepage');
      assert.strictEqual(result, 'homepage');
    });

    it('accepts name with hyphens and underscores', () => {
      let result = validateScreenshotName('my-screenshot_v2');
      assert.strictEqual(result, 'my-screenshot_v2');
    });

    it('throws for empty string', () => {
      assert.throws(
        () => validateScreenshotName(''),
        /must be a non-empty string/
      );
    });

    it('throws for non-string', () => {
      assert.throws(
        () => validateScreenshotName(123),
        /must be a non-empty string/
      );
    });

    it('throws when name exceeds max length', () => {
      let longName = 'a'.repeat(300);
      assert.throws(
        () => validateScreenshotName(longName),
        /exceeds maximum length/
      );
    });

    it('throws for directory traversal patterns', () => {
      assert.throws(
        () => validateScreenshotName('../etc/passwd'),
        /invalid path characters/
      );
      assert.throws(
        () => validateScreenshotName('..\\windows'),
        /invalid path characters/
      );
    });

    it('throws for forward slashes', () => {
      assert.throws(
        () => validateScreenshotName('path/to/file'),
        /cannot contain forward slashes/
      );
    });

    it('throws for paths starting with slash', () => {
      // The forward slash check triggers before the absolute path check
      assert.throws(
        () => validateScreenshotName('/etc/passwd'),
        /cannot contain forward slashes/
      );
    });
  });

  describe('sanitizeScreenshotName', () => {
    it('preserves valid screenshot name', () => {
      let result = sanitizeScreenshotName('homepage');
      assert.strictEqual(result, 'homepage');
    });

    it('preserves spaces in name', () => {
      let result = sanitizeScreenshotName('VBtn dark');
      assert.strictEqual(result, 'VBtn dark');
    });

    it('replaces special characters with underscore', () => {
      let result = sanitizeScreenshotName('file@name#test');
      assert.strictEqual(result, 'file_name_test');
    });

    it('throws for empty string', () => {
      assert.throws(
        () => sanitizeScreenshotName(''),
        /must be a non-empty string/
      );
    });

    it('throws when name exceeds max length', () => {
      let longName = 'a'.repeat(300);
      assert.throws(
        () => sanitizeScreenshotName(longName),
        /exceeds maximum length/
      );
    });

    it('throws for directory traversal', () => {
      assert.throws(
        () => sanitizeScreenshotName('../etc/passwd'),
        /invalid path characters/
      );
    });

    it('throws for forward slashes by default', () => {
      assert.throws(
        () => sanitizeScreenshotName('path/to/file'),
        /invalid path characters/
      );
    });

    it('allows forward slashes when specified', () => {
      let result = sanitizeScreenshotName('Chrome/139.0', 255, true);
      assert.strictEqual(result, 'Chrome/139.0');
    });

    it('prefixes hidden file names', () => {
      let result = sanitizeScreenshotName('.hidden');
      assert.strictEqual(result, 'file_.hidden');
    });

    it('handles name with only dots after sanitizing special chars', () => {
      // After replacing special chars, "***" becomes "___" which is valid
      let result = sanitizeScreenshotName('***');
      assert.strictEqual(result, '___');
    });
  });

  describe('validatePathSecurity', () => {
    it('accepts path within working directory', () => {
      let result = validatePathSecurity(
        '/project/.vizzly/baselines',
        '/project'
      );
      assert.ok(result.includes('/project'));
    });

    it('throws for empty path', () => {
      assert.throws(
        () => validatePathSecurity('', '/project'),
        /must be a non-empty string/
      );
    });

    it('throws for empty working directory', () => {
      assert.throws(
        () => validatePathSecurity('/project/file', ''),
        /Working directory must be a non-empty string/
      );
    });

    it('throws for path outside working directory', () => {
      assert.throws(
        () => validatePathSecurity('/etc/passwd', '/project'),
        /outside the allowed working directory/
      );
    });

    it('blocks path traversal attempts', () => {
      assert.throws(
        () => validatePathSecurity('/project/../etc/passwd', '/project'),
        /outside the allowed working directory/
      );
    });
  });

  describe('safePath', () => {
    it('constructs safe path within working directory', () => {
      let result = safePath('/project', 'screenshots', 'test.png');
      assert.ok(result.includes('/project'));
      assert.ok(result.includes('test.png'));
    });

    it('returns working directory when no segments provided', () => {
      let result = safePath('/project');
      assert.ok(result.includes('/project'));
    });

    it('throws for non-string segment', () => {
      assert.throws(
        () => safePath('/project', 123),
        /Path segment must be a string/
      );
    });

    it('throws for directory traversal in segment', () => {
      assert.throws(
        () => safePath('/project', '../etc'),
        /directory traversal sequence/
      );
    });
  });

  describe('validateScreenshotProperties', () => {
    it('preserves nested JSON metadata without rewriting user values', () => {
      let properties = {
        browser: 'Chrome/139.0',
        viewport: { width: 1920.5, height: 20000, label: 'custom' },
        'component label': '<button title="Buy">',
        properties: { threshold: 5, values: [null, true, 2, 'dark'] },
        description: 'a'.repeat(300),
      };
      assert.deepStrictEqual(
        validateScreenshotProperties(properties),
        properties
      );
    });

    it('returns an empty bag for missing or non-object metadata', () => {
      for (let value of [undefined, null, 'text', []]) {
        assert.deepStrictEqual(validateScreenshotProperties(value), {});
      }
    });

    it('rejects unsafe keys at any depth', () => {
      for (let key of ['__proto__', 'constructor', 'prototype']) {
        let properties = { nested: JSON.parse(`{"${key}": "value"}`) };
        assert.throws(
          () => validateScreenshotProperties(properties),
          /unsafe key/
        );
      }
    });

    it('rejects cycles and values that cannot be stored as JSON', () => {
      let circular = {};
      circular.self = circular;
      for (let value of [NaN, Infinity, undefined, () => {}, circular]) {
        assert.throws(
          () => validateScreenshotProperties({ value }),
          /JSON values/
        );
      }
    });
  });
});
