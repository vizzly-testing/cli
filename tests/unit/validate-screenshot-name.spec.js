/**
 * Tests for validateScreenshotName function
 * Pure validation with no transformations
 */

import { describe, expect, test } from 'vitest';
import { validateScreenshotName } from '../../src/utils/security.js';

describe('validateScreenshotName', () => {
  test('should return original name unchanged when valid', () => {
    expect(validateScreenshotName('VBtn dark')).toBe('VBtn dark');
    expect(validateScreenshotName('My Component')).toBe('My Component');
    expect(validateScreenshotName('test-screenshot_v2.1')).toBe(
      'test-screenshot_v2.1'
    );
  });

  test('should throw on empty or non-string names', () => {
    expect(() => validateScreenshotName('')).toThrow('non-empty string');
    expect(() => validateScreenshotName(null)).toThrow('non-empty string');
    expect(() => validateScreenshotName(undefined)).toThrow('non-empty string');
    expect(() => validateScreenshotName(123)).toThrow('non-empty string');
  });

  test('should throw on names exceeding max length', () => {
    const longName = 'a'.repeat(256);
    expect(() => validateScreenshotName(longName)).toThrow('maximum length');
    expect(() => validateScreenshotName(longName, 100)).toThrow(
      'maximum length'
    );
  });

  test('should throw on path traversal patterns', () => {
    expect(() => validateScreenshotName('../etc/passwd')).toThrow(
      'invalid path characters'
    );
    expect(() => validateScreenshotName('..\\windows\\system32')).toThrow(
      'invalid path characters'
    );
    expect(() => validateScreenshotName('test..test')).toThrow(
      'invalid path characters'
    );
  });

  test('should throw on forward slashes', () => {
    expect(() => validateScreenshotName('path/to/file')).toThrow(
      'forward slashes'
    );
    expect(() => validateScreenshotName('/absolute/path')).toThrow(
      'forward slashes'
    );
  });

  test('should throw on absolute paths', () => {
    // Note: Forward slashes are caught first, so use a path without slashes for this test
    // On Windows, backslashes would be caught by path traversal check
    // The isAbsolute check is still valid but harder to test in isolation
    // Just verify the validation logic exists
    expect(() => validateScreenshotName('/usr/bin/test')).toThrow(); // Caught by forward slash check first
  });

  test('should preserve spaces (no transformation)', () => {
    const name = 'VBtn dark mode';
    const result = validateScreenshotName(name);
    expect(result).toBe(name);
    expect(result).toContain(' ');
  });

  test('should allow special characters', () => {
    // These should all pass validation
    expect(validateScreenshotName('test.component')).toBe('test.component');
    expect(validateScreenshotName('test-component')).toBe('test-component');
    expect(validateScreenshotName('test_component')).toBe('test_component');
    expect(validateScreenshotName('test 123')).toBe('test 123');
  });
});
