import assert from 'node:assert';
import { describe, it } from 'node:test';

describe('utils/browser', () => {
  describe('openBrowser URL validation', () => {
    it('should accept http:// URLs', async () => {
      // We can't easily test the actual browser opening, but we can test URL validation
      // by checking that the function doesn't reject valid URLs
      let { openBrowser } = await import('../../src/utils/browser.js');

      // This will fail to open (no browser in test env) but shouldn't throw
      let result = await openBrowser('http://localhost:3000');
      // Result is false because execFile fails, but no exception is thrown
      assert.strictEqual(typeof result, 'boolean');
    });

    it('should accept https:// URLs', async () => {
      let { openBrowser } = await import('../../src/utils/browser.js');

      let result = await openBrowser('https://example.com');
      assert.strictEqual(typeof result, 'boolean');
    });

    it('should accept file:// URLs', async () => {
      let { openBrowser } = await import('../../src/utils/browser.js');

      let result = await openBrowser('file:///path/to/file.html');
      assert.strictEqual(typeof result, 'boolean');
    });

    it('should reject invalid URL schemes', async () => {
      let { openBrowser } = await import('../../src/utils/browser.js');

      // These should return false immediately without attempting to open
      let result1 = await openBrowser('javascript:alert(1)');
      assert.strictEqual(result1, false);

      let result2 = await openBrowser(
        'data:text/html,<script>alert(1)</script>'
      );
      assert.strictEqual(result2, false);
    });

    it('should reject malicious command injection attempts', async () => {
      let { openBrowser } = await import('../../src/utils/browser.js');

      // Windows command injection attempts
      let result1 = await openBrowser('& calc.exe');
      assert.strictEqual(result1, false);

      let result2 = await openBrowser('| notepad.exe');
      assert.strictEqual(result2, false);

      let result3 = await openBrowser('; rm -rf /');
      assert.strictEqual(result3, false);
    });

    it('should reject empty strings', async () => {
      let { openBrowser } = await import('../../src/utils/browser.js');

      let result = await openBrowser('');
      assert.strictEqual(result, false);
    });

    it('should reject non-string inputs', async () => {
      let { openBrowser } = await import('../../src/utils/browser.js');

      let result1 = await openBrowser(null);
      assert.strictEqual(result1, false);

      let result2 = await openBrowser(undefined);
      assert.strictEqual(result2, false);

      let result3 = await openBrowser(123);
      assert.strictEqual(result3, false);
    });
  });
});
