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

      assert.strictEqual(c.red(''), '\x1b[31m\x1b[39m');
    });

    it('handles undefined input', () => {
      let c = createColors({ useColor: true });

      assert.strictEqual(c.red(), '\x1b[31m\x1b[39m');
    });

    it('converts non-string input to string', () => {
      let c = createColors({ useColor: true });

      assert.strictEqual(c.red(123), '\x1b[31m123\x1b[39m');
      assert.strictEqual(c.green(null), '\x1b[32mnull\x1b[39m');
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

    it('reset style uses empty close code', () => {
      let c = createColors({ useColor: true });

      // reset uses '' as close, which should fallback to \x1b[0m
      assert.strictEqual(c.reset('test'), '\x1b[0mtest\x1b[0m');
    });
  });
});
