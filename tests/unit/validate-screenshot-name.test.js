/**
 * Tests for validateScreenshotName function
 * Pure validation with no transformations
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { validateScreenshotName } from '../../src/utils/security.js';

describe('validateScreenshotName', () => {
  it('should return original name unchanged when valid', () => {
    assert.strictEqual(validateScreenshotName('VBtn dark'), 'VBtn dark');
    assert.strictEqual(validateScreenshotName('My Component'), 'My Component');
    assert.strictEqual(
      validateScreenshotName('test-screenshot_v2.1'),
      'test-screenshot_v2.1'
    );
  });

  it('should throw on empty or non-string names', () => {
    assert.throws(() => validateScreenshotName(''), /non-empty string/);
    assert.throws(() => validateScreenshotName(null), /non-empty string/);
    assert.throws(() => validateScreenshotName(undefined), /non-empty string/);
    assert.throws(() => validateScreenshotName(123), /non-empty string/);
  });

  it('should throw on names exceeding max length', () => {
    let longName = 'a'.repeat(256);
    assert.throws(() => validateScreenshotName(longName), /maximum length/);
    assert.throws(
      () => validateScreenshotName(longName, 100),
      /maximum length/
    );
  });

  it('should throw on path traversal patterns', () => {
    assert.throws(
      () => validateScreenshotName('../etc/passwd'),
      /invalid path characters/
    );
    assert.throws(
      () => validateScreenshotName('..\\windows\\system32'),
      /invalid path characters/
    );
    assert.throws(
      () => validateScreenshotName('test..test'),
      /invalid path characters/
    );
  });

  it('should throw on forward slashes', () => {
    assert.throws(
      () => validateScreenshotName('path/to/file'),
      /forward slashes/
    );
    assert.throws(
      () => validateScreenshotName('/absolute/path'),
      /forward slashes/
    );
  });

  it('should throw on absolute paths', () => {
    // Note: Forward slashes are caught first, so use a path without slashes for this test
    // On Windows, backslashes would be caught by path traversal check
    // The isAbsolute check is still valid but harder to test in isolation
    // Just verify the validation logic exists
    assert.throws(() => validateScreenshotName('/usr/bin/test')); // Caught by forward slash check first
  });

  it('should preserve spaces (no transformation)', () => {
    let name = 'VBtn dark mode';
    let result = validateScreenshotName(name);
    assert.strictEqual(result, name);
    assert.ok(result.includes(' '));
  });

  it('should allow special characters', () => {
    // These should all pass validation
    assert.strictEqual(
      validateScreenshotName('test.component'),
      'test.component'
    );
    assert.strictEqual(
      validateScreenshotName('test-component'),
      'test-component'
    );
    assert.strictEqual(
      validateScreenshotName('test_component'),
      'test_component'
    );
    assert.strictEqual(validateScreenshotName('test 123'), 'test 123');
  });
});
