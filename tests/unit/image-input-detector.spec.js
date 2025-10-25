import { describe, it, expect } from 'vitest';
import {
  isBase64,
  looksLikeFilePath,
  detectImageInputType,
} from '../../src/utils/image-input-detector.js';

describe('Image Input Detector', () => {
  describe('isBase64', () => {
    it('should detect valid base64 strings', () => {
      expect(isBase64('ZmFrZS1wbmctZGF0YQ==')).toBe(true);
      expect(isBase64('aGVsbG8gd29ybGQ=')).toBe(true);
      expect(isBase64('YQ==')).toBe(true);
      expect(isBase64('YWI=')).toBe(true);
      expect(isBase64('YWJj')).toBe(true);
    });

    it('should detect base64 with data URI prefix', () => {
      expect(isBase64('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
      expect(isBase64('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
      expect(isBase64('data:application/octet-stream;base64,ZmFrZQ==')).toBe(
        true
      );
    });

    it('should detect long base64 strings (typical PNG)', () => {
      // Typical base64 encoded PNG header
      let longBase64 = Buffer.from('fake png data'.repeat(100)).toString(
        'base64'
      );
      expect(isBase64(longBase64)).toBe(true);
    });

    it('should reject file paths', () => {
      expect(isBase64('./screenshot.png')).toBe(false);
      expect(isBase64('/absolute/path/file.png')).toBe(false);
      expect(isBase64('C:\\Windows\\file.png')).toBe(false);
      expect(isBase64('../relative/path.png')).toBe(false);
      expect(isBase64('file:///path/to/file.png')).toBe(false);
    });

    it('should reject invalid base64 patterns', () => {
      expect(isBase64('not-valid-base64!')).toBe(false);
      expect(isBase64('has spaces in it')).toBe(false);
      expect(isBase64('has@special#chars')).toBe(false);
      expect(isBase64('=')).toBe(false); // Just padding
      expect(isBase64('A=')).toBe(false); // Invalid length
    });

    it('should reject empty or non-string inputs', () => {
      expect(isBase64('')).toBe(false);
      expect(isBase64(null)).toBe(false);
      expect(isBase64(undefined)).toBe(false);
      expect(isBase64(123)).toBe(false);
    });

    it('should reject invalid data URI format', () => {
      expect(isBase64('data:image/png')).toBe(false); // Missing base64 part
      expect(isBase64('data:invalid')).toBe(false);
    });
  });

  describe('looksLikeFilePath', () => {
    describe('relative paths', () => {
      it('should detect ./ relative paths', () => {
        expect(looksLikeFilePath('./screenshot.png')).toBe(true);
        expect(looksLikeFilePath('./tests/__screenshots__/homepage.png')).toBe(
          true
        );
        expect(looksLikeFilePath('.\\screenshot.png')).toBe(true); // Windows
      });

      it('should detect ../ parent relative paths', () => {
        expect(looksLikeFilePath('../screenshot.png')).toBe(true);
        expect(looksLikeFilePath('../../images/test.png')).toBe(true);
        expect(looksLikeFilePath('..\\screenshot.png')).toBe(true); // Windows
      });

      it('should detect subdirectory paths', () => {
        expect(looksLikeFilePath('subdirectory/file.png')).toBe(true);
        expect(looksLikeFilePath('tests/__screenshots__/homepage.png')).toBe(
          true
        );
        expect(looksLikeFilePath('subdirectory\\file.png')).toBe(true); // Windows
      });
    });

    describe('absolute paths', () => {
      it('should detect Unix absolute paths', () => {
        expect(looksLikeFilePath('/absolute/path/file.png')).toBe(true);
        expect(looksLikeFilePath('/usr/local/images/test.png')).toBe(true);
        expect(looksLikeFilePath('/home/user/screenshots/homepage.png')).toBe(
          true
        );
      });

      it('should detect Windows absolute paths', () => {
        expect(looksLikeFilePath('C:\\Users\\test\\file.png')).toBe(true);
        expect(looksLikeFilePath('C:/Users/test/file.png')).toBe(true);
        expect(looksLikeFilePath('D:\\screenshots\\homepage.png')).toBe(true);
        expect(looksLikeFilePath('E:/images/test.png')).toBe(true);
      });
    });

    describe('file URIs', () => {
      it('should detect file:// URIs', () => {
        expect(looksLikeFilePath('file:///absolute/path/file.png')).toBe(true);
        expect(looksLikeFilePath('file:///C:/Users/test/file.png')).toBe(true);
        expect(looksLikeFilePath('file://localhost/path/file.png')).toBe(true);
      });
    });

    describe('file extensions', () => {
      it('should detect common image extensions', () => {
        expect(looksLikeFilePath('screenshot.png')).toBe(true);
        expect(looksLikeFilePath('photo.jpg')).toBe(true);
        expect(looksLikeFilePath('image.jpeg')).toBe(true);
        expect(looksLikeFilePath('animation.gif')).toBe(true);
        expect(looksLikeFilePath('graphic.webp')).toBe(true);
        expect(looksLikeFilePath('icon.svg')).toBe(true);
        expect(looksLikeFilePath('bitmap.bmp')).toBe(true);
        expect(looksLikeFilePath('document.tiff')).toBe(true);
        expect(looksLikeFilePath('favicon.ico')).toBe(true);
      });

      it('should be case insensitive for extensions', () => {
        expect(looksLikeFilePath('file.PNG')).toBe(true);
        expect(looksLikeFilePath('file.JPG')).toBe(true);
        expect(looksLikeFilePath('file.Png')).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should reject base64 strings', () => {
        expect(looksLikeFilePath('ZmFrZS1wbmctZGF0YQ==')).toBe(false);
        expect(looksLikeFilePath('aGVsbG8gd29ybGQ=')).toBe(false);
      });

      it('should reject data URIs', () => {
        expect(looksLikeFilePath('data:image/png;base64,iVBORw0KGgo=')).toBe(
          false
        );
      });

      it('should reject empty or non-string inputs', () => {
        expect(looksLikeFilePath('')).toBe(false);
        expect(looksLikeFilePath(null)).toBe(false);
        expect(looksLikeFilePath(undefined)).toBe(false);
        expect(looksLikeFilePath(123)).toBe(false);
      });

      it('should reject plain text without path indicators', () => {
        expect(looksLikeFilePath('just-some-text')).toBe(false);
        expect(looksLikeFilePath('filename-no-extension')).toBe(false);
      });
    });
  });

  describe('detectImageInputType', () => {
    describe('file paths', () => {
      it('should detect relative file paths', () => {
        expect(detectImageInputType('./screenshot.png')).toBe('file-path');
        expect(detectImageInputType('../images/test.png')).toBe('file-path');
        expect(detectImageInputType('tests/__screenshots__/homepage.png')).toBe(
          'file-path'
        );
      });

      it('should detect absolute file paths', () => {
        expect(detectImageInputType('/absolute/path/file.png')).toBe(
          'file-path'
        );
        expect(detectImageInputType('C:\\Users\\test\\file.png')).toBe(
          'file-path'
        );
        expect(detectImageInputType('C:/Users/test/file.png')).toBe(
          'file-path'
        );
      });

      it('should detect file URIs', () => {
        expect(detectImageInputType('file:///path/to/file.png')).toBe(
          'file-path'
        );
      });

      it('should detect simple filenames with extensions', () => {
        expect(detectImageInputType('screenshot.png')).toBe('file-path');
        expect(detectImageInputType('photo.jpg')).toBe('file-path');
      });
    });

    describe('base64', () => {
      it('should detect plain base64 strings', () => {
        expect(detectImageInputType('ZmFrZS1wbmctZGF0YQ==')).toBe('base64');
        expect(detectImageInputType('aGVsbG8gd29ybGQ=')).toBe('base64');
      });

      it('should detect data URI base64', () => {
        expect(detectImageInputType('data:image/png;base64,iVBORw0KGgo=')).toBe(
          'base64'
        );
        expect(
          detectImageInputType('data:image/jpeg;base64,/9j/4AAQSkZJRg==')
        ).toBe('base64');
      });

      it('should detect long base64 strings', () => {
        let longBase64 = Buffer.from('fake data'.repeat(1000)).toString(
          'base64'
        );
        expect(detectImageInputType(longBase64)).toBe('base64');
      });
    });

    describe('priority - file paths over base64', () => {
      it('should prioritize file path detection when ambiguous', () => {
        // A string that could theoretically be valid base64 but looks like a path
        // should be detected as file-path
        expect(detectImageInputType('test.png')).toBe('file-path');
        expect(detectImageInputType('path/to/file.png')).toBe('file-path');
      });
    });

    describe('unknown inputs', () => {
      it('should return unknown for invalid inputs', () => {
        expect(detectImageInputType('')).toBe('unknown');
        expect(detectImageInputType(null)).toBe('unknown');
        expect(detectImageInputType(undefined)).toBe('unknown');
        expect(detectImageInputType(123)).toBe('unknown');
      });

      it('should return unknown for ambiguous strings', () => {
        expect(detectImageInputType('just-text')).toBe('unknown');
        expect(detectImageInputType('A=')).toBe('unknown'); // Invalid base64
        expect(detectImageInputType('has spaces')).toBe('unknown');
      });
    });

    describe('real-world examples', () => {
      it('should handle typical Playwright screenshot paths', () => {
        expect(
          detectImageInputType('./tests/screenshots/homepage-chromium.png')
        ).toBe('file-path');
      });

      it('should handle typical Vitest browser mode paths', () => {
        expect(detectImageInputType('/tmp/vitest/screenshot-abc123.png')).toBe(
          'file-path'
        );
      });

      it('should handle typical Buffer.toString("base64") output', () => {
        let buffer = Buffer.from('PNG image data here');
        expect(detectImageInputType(buffer.toString('base64'))).toBe('base64');
      });

      it('should handle Windows CI paths', () => {
        expect(
          detectImageInputType('D:\\a\\project\\screenshots\\test.png')
        ).toBe('file-path');
      });
    });
  });
});
