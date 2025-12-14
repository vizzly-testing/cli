import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  cleanup,
  configure,
  getColors,
  getLogLevel,
  isVerbose,
  reset,
} from '../../src/utils/output.js';

describe('utils/output', () => {
  beforeEach(() => {
    // Reset output module state before each test
    reset();
  });

  afterEach(() => {
    cleanup();
    reset();
  });

  describe('configure', () => {
    it('sets json mode', () => {
      configure({ json: true });
      // Can't easily test internal state, but shouldn't throw
    });

    it('sets log level', () => {
      configure({ logLevel: 'debug' });
      assert.strictEqual(getLogLevel(), 'debug');
    });

    it('normalizes log level', () => {
      configure({ logLevel: 'DEBUG' });
      assert.strictEqual(getLogLevel(), 'debug');
    });

    it('sets verbose via verbose flag', () => {
      configure({ verbose: true });
      assert.strictEqual(getLogLevel(), 'debug');
    });

    it('sets silent mode', () => {
      configure({ silent: true });
      // Should not throw
    });

    it('sets color mode', () => {
      configure({ color: false });
      // Should not throw
    });

    it('defaults to info when invalid level provided', () => {
      configure({ logLevel: 'invalid' });
      assert.strictEqual(getLogLevel(), 'info');
    });

    it('can reset timer', () => {
      configure({ resetTimer: true });
      // Should not throw
    });

    it('preserves log level when not provided', () => {
      configure({ logLevel: 'warn' });
      configure({ json: true }); // No logLevel
      assert.strictEqual(getLogLevel(), 'warn');
    });
  });

  describe('getLogLevel', () => {
    it('returns info by default', () => {
      assert.strictEqual(getLogLevel(), 'info');
    });

    it('returns configured log level', () => {
      configure({ logLevel: 'error' });
      assert.strictEqual(getLogLevel(), 'error');
    });
  });

  describe('isVerbose', () => {
    it('returns false by default', () => {
      assert.strictEqual(isVerbose(), false);
    });

    it('returns true when debug level set', () => {
      configure({ logLevel: 'debug' });
      assert.strictEqual(isVerbose(), true);
    });

    it('returns false for other levels', () => {
      configure({ logLevel: 'info' });
      assert.strictEqual(isVerbose(), false);
    });
  });

  describe('getColors', () => {
    it('returns colors object', () => {
      let c = getColors();

      assert.ok(c);
      assert.ok(typeof c.green === 'function');
      assert.ok(typeof c.red === 'function');
      assert.ok(typeof c.yellow === 'function');
      assert.ok(typeof c.cyan === 'function');
      assert.ok(typeof c.dim === 'function');
    });
  });

  describe('reset', () => {
    it('resets log level to default', () => {
      configure({ logLevel: 'error' });
      reset();

      // After reset, first getLogLevel should return default
      assert.strictEqual(getLogLevel(), 'info');
    });
  });

  describe('cleanup', () => {
    it('does not throw', () => {
      cleanup();
      // Should not throw
    });
  });
});
