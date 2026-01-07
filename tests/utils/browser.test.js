import assert from 'node:assert';
import { describe, it } from 'node:test';
import { isValidBrowserUrl } from '../../src/utils/browser.js';

describe('utils/browser', () => {
  describe('isValidBrowserUrl', () => {
    it('should accept http:// URLs', () => {
      assert.strictEqual(isValidBrowserUrl('http://localhost:3000'), true);
      assert.strictEqual(isValidBrowserUrl('http://example.com/path'), true);
    });

    it('should accept https:// URLs', () => {
      assert.strictEqual(isValidBrowserUrl('https://example.com'), true);
      assert.strictEqual(
        isValidBrowserUrl('https://localhost:8080/report'),
        true
      );
    });

    it('should accept file:// URLs', () => {
      assert.strictEqual(isValidBrowserUrl('file:///path/to/file.html'), true);
      assert.strictEqual(
        isValidBrowserUrl('file:///C:/Users/report.html'),
        true
      );
    });

    it('should reject javascript: URLs', () => {
      assert.strictEqual(isValidBrowserUrl('javascript:alert(1)'), false);
      assert.strictEqual(isValidBrowserUrl('javascript:void(0)'), false);
    });

    it('should reject data: URLs', () => {
      assert.strictEqual(
        isValidBrowserUrl('data:text/html,<script>alert(1)</script>'),
        false
      );
      assert.strictEqual(isValidBrowserUrl('data:image/png;base64,abc'), false);
    });

    it('should reject command injection attempts', () => {
      assert.strictEqual(isValidBrowserUrl('& calc.exe'), false);
      assert.strictEqual(isValidBrowserUrl('| notepad.exe'), false);
      assert.strictEqual(isValidBrowserUrl('; rm -rf /'), false);
      assert.strictEqual(isValidBrowserUrl('$(whoami)'), false);
    });

    it('should reject empty strings', () => {
      assert.strictEqual(isValidBrowserUrl(''), false);
    });

    it('should reject non-string inputs', () => {
      assert.strictEqual(isValidBrowserUrl(null), false);
      assert.strictEqual(isValidBrowserUrl(undefined), false);
      assert.strictEqual(isValidBrowserUrl(123), false);
      assert.strictEqual(isValidBrowserUrl({}), false);
    });
  });
});
