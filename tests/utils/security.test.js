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
    it('returns empty object for null input', () => {
      let result = validateScreenshotProperties(null);
      assert.deepStrictEqual(result, {});
    });

    it('returns empty object for non-object input', () => {
      let result = validateScreenshotProperties('string');
      assert.deepStrictEqual(result, {});
    });

    it('returns empty object for empty properties', () => {
      let result = validateScreenshotProperties({});
      assert.deepStrictEqual(result, {});
    });

    it('validates browser name', () => {
      let result = validateScreenshotProperties({ browser: 'Chrome/139.0' });
      assert.strictEqual(result.browser, 'Chrome');
    });

    it('skips invalid browser names', () => {
      let result = validateScreenshotProperties({ browser: '../etc' });
      assert.strictEqual(result.browser, undefined);
    });

    it('validates viewport dimensions', () => {
      let result = validateScreenshotProperties({
        viewport: { width: 1920, height: 1080 },
      });
      assert.strictEqual(result.viewport.width, 1920);
      assert.strictEqual(result.viewport.height, 1080);
    });

    it('rejects invalid viewport dimensions', () => {
      let result = validateScreenshotProperties({
        viewport: { width: -100, height: 20000 },
      });
      assert.strictEqual(result.viewport, undefined);
    });

    it('floors viewport dimensions', () => {
      let result = validateScreenshotProperties({
        viewport: { width: 1920.5, height: 1080.7 },
      });
      assert.strictEqual(result.viewport.width, 1920);
      assert.strictEqual(result.viewport.height, 1080);
    });

    it('validates custom string properties', () => {
      let result = validateScreenshotProperties({
        custom_key: 'value',
      });
      assert.strictEqual(result.custom_key, 'value');
    });

    it('validates custom number properties', () => {
      let result = validateScreenshotProperties({
        count: 42,
      });
      assert.strictEqual(result.count, 42);
    });

    it('validates custom boolean properties', () => {
      let result = validateScreenshotProperties({
        enabled: true,
      });
      assert.strictEqual(result.enabled, true);
    });

    it('strips HTML entities from string values', () => {
      let result = validateScreenshotProperties({
        desc: '<script>alert("xss")</script>',
      });
      assert.ok(!result.desc.includes('<'));
      assert.ok(!result.desc.includes('>'));
    });

    it('rejects invalid key names', () => {
      let result = validateScreenshotProperties({
        'invalid key!': 'value',
      });
      assert.strictEqual(result['invalid key!'], undefined);
    });

    it('rejects overly long keys', () => {
      let longKey = 'a'.repeat(100);
      let result = validateScreenshotProperties({
        [longKey]: 'value',
      });
      assert.strictEqual(result[longKey], undefined);
    });

    it('rejects overly long string values', () => {
      let result = validateScreenshotProperties({
        key: 'a'.repeat(300),
      });
      assert.strictEqual(result.key, undefined);
    });

    it('rejects NaN numbers', () => {
      let result = validateScreenshotProperties({
        num: Number.NaN,
      });
      assert.strictEqual(result.num, undefined);
    });

    it('rejects Infinity numbers', () => {
      let result = validateScreenshotProperties({
        num: Number.POSITIVE_INFINITY,
      });
      assert.strictEqual(result.num, undefined);
    });
  });
});
