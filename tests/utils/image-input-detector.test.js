import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  detectImageInputType,
  isBase64,
  looksLikeFilePath,
} from '../../src/utils/image-input-detector.js';

describe('utils/image-input-detector', () => {
  describe('isBase64', () => {
    it('returns false for empty string', () => {
      assert.strictEqual(isBase64(''), false);
    });

    it('returns false for non-string', () => {
      assert.strictEqual(isBase64(123), false);
      assert.strictEqual(isBase64(null), false);
    });

    it('returns true for valid base64 string', () => {
      // "hello" in base64
      assert.strictEqual(isBase64('aGVsbG8='), true);
    });

    it('returns true for base64 with double padding', () => {
      // "test" in base64 (with padding)
      assert.strictEqual(isBase64('dGVzdA=='), true);
    });

    it('returns true for base64 with single padding', () => {
      assert.strictEqual(isBase64('YWJj'), true);
    });

    it('returns true for data URI with base64', () => {
      assert.strictEqual(
        isBase64(
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        ),
        true
      );
    });

    it('returns false for invalid data URI format', () => {
      assert.strictEqual(isBase64('data:invalid'), false);
    });

    it('returns false for file paths', () => {
      assert.strictEqual(isBase64('./screenshot.png'), false);
      assert.strictEqual(isBase64('/absolute/path.png'), false);
    });
  });

  describe('looksLikeFilePath', () => {
    it('returns false for empty string', () => {
      assert.strictEqual(looksLikeFilePath(''), false);
    });

    it('returns false for non-string', () => {
      assert.strictEqual(looksLikeFilePath(123), false);
      assert.strictEqual(looksLikeFilePath(null), false);
    });

    it('returns false for data URI', () => {
      assert.strictEqual(
        looksLikeFilePath('data:image/png;base64,abc123'),
        false
      );
    });

    it('returns true for file:// URI', () => {
      assert.strictEqual(looksLikeFilePath('file:///path/to/file.png'), true);
    });

    it('returns true for absolute Unix path', () => {
      assert.strictEqual(looksLikeFilePath('/absolute/path/file.png'), true);
    });

    it('returns true for Windows path with forward slash', () => {
      assert.strictEqual(looksLikeFilePath('C:/path/file.png'), true);
    });

    it('returns true for Windows path with backslash', () => {
      assert.strictEqual(looksLikeFilePath('C:\\path\\file.png'), true);
    });

    it('returns true for relative path starting with ./', () => {
      assert.strictEqual(looksLikeFilePath('./screenshot.png'), true);
    });

    it('returns true for relative path starting with ../', () => {
      assert.strictEqual(looksLikeFilePath('../screenshot.png'), true);
    });

    it('returns true for path with forward slash', () => {
      assert.strictEqual(looksLikeFilePath('subdir/file.png'), true);
    });

    it('returns true for path with backslash', () => {
      assert.strictEqual(looksLikeFilePath('subdir\\file.png'), true);
    });

    it('returns true for files with image extensions', () => {
      assert.strictEqual(looksLikeFilePath('screenshot.png'), true);
      assert.strictEqual(looksLikeFilePath('image.jpg'), true);
      assert.strictEqual(looksLikeFilePath('photo.jpeg'), true);
      assert.strictEqual(looksLikeFilePath('animation.gif'), true);
      assert.strictEqual(looksLikeFilePath('image.webp'), true);
      assert.strictEqual(looksLikeFilePath('image.bmp'), true);
      assert.strictEqual(looksLikeFilePath('icon.svg'), true);
      assert.strictEqual(looksLikeFilePath('image.tiff'), true);
      assert.strictEqual(looksLikeFilePath('favicon.ico'), true);
    });

    it('returns false for base64 strings', () => {
      assert.strictEqual(looksLikeFilePath('aGVsbG8='), false);
    });

    it('returns false for large strings (length > 1000)', () => {
      // Large strings are assumed to be base64, not file paths
      let largeString = 'a'.repeat(1001);
      assert.strictEqual(looksLikeFilePath(largeString), false);
    });

    it('returns false for JPEG base64 starting with /9j/', () => {
      // JPEG base64 starts with /9j/ which could look like a path
      // but should not be detected as file path
      assert.strictEqual(looksLikeFilePath('/9j/4AAQSkZJRg=='), false);
    });
  });

  describe('detectImageInputType', () => {
    it('returns unknown for empty string', () => {
      assert.strictEqual(detectImageInputType(''), 'unknown');
    });

    it('returns unknown for non-string', () => {
      assert.strictEqual(detectImageInputType(123), 'unknown');
      assert.strictEqual(detectImageInputType(null), 'unknown');
    });

    it('returns base64 for valid base64 string', () => {
      assert.strictEqual(detectImageInputType('aGVsbG8='), 'base64');
    });

    it('returns base64 for data URI', () => {
      assert.strictEqual(
        detectImageInputType(
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        ),
        'base64'
      );
    });

    it('returns file-path for file paths', () => {
      assert.strictEqual(detectImageInputType('./screenshot.png'), 'file-path');
      assert.strictEqual(
        detectImageInputType('/absolute/path.png'),
        'file-path'
      );
      assert.strictEqual(detectImageInputType('C:/path/file.png'), 'file-path');
    });

    it('returns unknown for ambiguous strings', () => {
      assert.strictEqual(detectImageInputType('invalid!!!'), 'unknown');
    });

    it('returns base64 for large strings (length > 1000) without file path patterns', () => {
      // Large strings are assumed to be base64 without running expensive validation
      let largeString = 'a'.repeat(1001);
      assert.strictEqual(detectImageInputType(largeString), 'base64');
    });

    it('returns base64 for JPEG base64 starting with /9j/', () => {
      // JPEG base64 starts with /9j/ - should be detected as base64, not file-path
      assert.strictEqual(detectImageInputType('/9j/4AAQSkZJRg=='), 'base64');
    });

    it('returns file-path for absolute Unix path with extension', () => {
      // Even though it starts with /, the .png extension makes it a file path
      assert.strictEqual(
        detectImageInputType('/path/to/image.png'),
        'file-path'
      );
    });

    it('handles data URI before checking file paths', () => {
      // Data URIs should be detected as base64 immediately
      assert.strictEqual(
        detectImageInputType('data:image/png;base64,abc123'),
        'base64'
      );
    });
  });
});
