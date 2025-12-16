import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createColors } from '../../src/utils/colors.js';

describe('utils/colors', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('createColors', () => {
    it('creates color functions when useColor is true', () => {
      let c = createColors({ useColor: true });

      assert.strictEqual(c.red('test'), '\x1b[31mtest\x1b[39m');
      assert.strictEqual(c.green('hello'), '\x1b[32mhello\x1b[39m');
      assert.strictEqual(c.bold('strong'), '\x1b[1mstrong\x1b[22m');
    });

    it('returns plain text when useColor is false', () => {
      let c = createColors({ useColor: false });

      assert.strictEqual(c.red('test'), 'test');
      assert.strictEqual(c.green('hello'), 'hello');
      assert.strictEqual(c.bold('strong'), 'strong');
    });

    it('handles empty string input', () => {
      let c = createColors({ useColor: true });

      // ansis returns empty string for empty input (optimized behavior)
      assert.strictEqual(c.red(''), '');
    });

    it('handles undefined input', () => {
      let c = createColors({ useColor: true });

      // ansis returns empty string for undefined input
      assert.strictEqual(c.red(), '');
    });

    it('converts non-string input to string', () => {
      let c = createColors({ useColor: true });

      assert.strictEqual(c.red(123), '\x1b[31m123\x1b[39m');
      // ansis returns empty for null input
      assert.strictEqual(c.green(null), '');
    });

    it('provides semantic aliases', () => {
      let c = createColors({ useColor: true });

      assert.strictEqual(c.success, c.green);
      assert.strictEqual(c.error, c.red);
      assert.strictEqual(c.warning, c.yellow);
      assert.strictEqual(c.info, c.blue);
    });

    it('provides all expected style functions', () => {
      let c = createColors({ useColor: false });

      let expectedStyles = [
        'reset',
        'bold',
        'dim',
        'italic',
        'underline',
        'strikethrough',
        'red',
        'green',
        'yellow',
        'blue',
        'magenta',
        'cyan',
        'white',
        'gray',
        'success',
        'error',
        'warning',
        'info',
      ];

      for (let style of expectedStyles) {
        assert.strictEqual(
          typeof c[style],
          'function',
          `${style} should be a function`
        );
      }
    });

    it('respects NO_COLOR environment variable', () => {
      process.env.NO_COLOR = '1';
      delete process.env.FORCE_COLOR;

      let c = createColors();

      assert.strictEqual(c.red('test'), 'test');
    });

    it('respects FORCE_COLOR environment variable', () => {
      delete process.env.NO_COLOR;
      process.env.FORCE_COLOR = '1';

      let c = createColors();

      assert.strictEqual(c.red('test'), '\x1b[31mtest\x1b[39m');
    });

    it('FORCE_COLOR=0 disables colors', () => {
      delete process.env.NO_COLOR;
      process.env.FORCE_COLOR = '0';

      let c = createColors();

      assert.strictEqual(c.red('test'), 'test');
    });

    it('reset style wraps text correctly', () => {
      let c = createColors({ useColor: true });

      // ansis reset uses \x1b[0m for both open and close
      let result = c.reset('test');
      // Just verify it starts with reset code and contains the text
      assert.ok(result.includes('test'), 'should contain the text');
      assert.ok(result.startsWith('\x1b[0m'), 'should start with reset code');
    });
  });
});
