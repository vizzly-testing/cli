import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import {
  configure,
  debug,
  error,
  getLogLevel,
  info,
  isVerbose,
  reset,
  warn,
} from '../../src/utils/output.js';

describe('Output - Log Levels', () => {
  let originalEnv;
  let consoleLogMock;
  let consoleErrorMock;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Reset module state before each test
    reset();
    consoleLogMock = mock.method(console, 'log', () => {});
    consoleErrorMock = mock.method(console, 'error', () => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleLogMock.mock.restore();
    consoleErrorMock.mock.restore();
  });

  describe('configure with logLevel', () => {
    it('should default to info level', () => {
      delete process.env.VIZZLY_LOG_LEVEL;
      configure({});
      assert.strictEqual(getLogLevel(), 'info');
    });

    it('should use VIZZLY_LOG_LEVEL env var when no explicit option', () => {
      process.env.VIZZLY_LOG_LEVEL = 'debug';
      configure({});
      assert.strictEqual(getLogLevel(), 'debug');
    });

    it('should use VIZZLY_LOG_LEVEL=warn', () => {
      process.env.VIZZLY_LOG_LEVEL = 'warn';
      configure({});
      assert.strictEqual(getLogLevel(), 'warn');
    });

    it('should use VIZZLY_LOG_LEVEL=error', () => {
      process.env.VIZZLY_LOG_LEVEL = 'error';
      configure({});
      assert.strictEqual(getLogLevel(), 'error');
    });

    it('should prefer explicit logLevel option over env var', () => {
      process.env.VIZZLY_LOG_LEVEL = 'debug';
      configure({ logLevel: 'error' });
      assert.strictEqual(getLogLevel(), 'error');
    });

    it('should map verbose=true to debug level', () => {
      delete process.env.VIZZLY_LOG_LEVEL;
      configure({ verbose: true });
      assert.strictEqual(getLogLevel(), 'debug');
      assert.strictEqual(isVerbose(), true);
    });

    it('should prefer explicit logLevel over verbose flag', () => {
      configure({ logLevel: 'warn', verbose: true });
      assert.strictEqual(getLogLevel(), 'warn');
      assert.strictEqual(isVerbose(), false);
    });

    it('should normalize case-insensitive log levels', () => {
      configure({ logLevel: 'DEBUG' });
      assert.strictEqual(getLogLevel(), 'debug');

      configure({ logLevel: 'WARN' });
      assert.strictEqual(getLogLevel(), 'warn');
    });

    it('should default to info for invalid log level', () => {
      configure({ logLevel: 'invalid' });
      assert.strictEqual(getLogLevel(), 'info');
    });

    it('should handle whitespace in log level', () => {
      configure({ logLevel: '  debug  ' });
      assert.strictEqual(getLogLevel(), 'debug');
    });
  });

  describe('isVerbose', () => {
    it('should return true when log level is debug', () => {
      configure({ logLevel: 'debug' });
      assert.strictEqual(isVerbose(), true);
    });

    it('should return false when log level is info', () => {
      configure({ logLevel: 'info' });
      assert.strictEqual(isVerbose(), false);
    });

    it('should return false when log level is warn', () => {
      configure({ logLevel: 'warn' });
      assert.strictEqual(isVerbose(), false);
    });
  });

  describe('log level filtering', () => {
    describe('debug level', () => {
      beforeEach(() => {
        configure({ logLevel: 'debug' });
      });

      it('should show debug messages', () => {
        debug('test', 'debug message');
        assert.strictEqual(consoleErrorMock.mock.calls.length > 0, true);
      });

      it('should show info messages', () => {
        info('info message');
        assert.strictEqual(consoleLogMock.mock.calls.length > 0, true);
      });

      it('should show warn messages', () => {
        warn('warn message');
        assert.strictEqual(consoleErrorMock.mock.calls.length > 0, true);
      });

      it('should show error messages', () => {
        error('error message');
        assert.strictEqual(consoleErrorMock.mock.calls.length > 0, true);
      });
    });

    describe('info level', () => {
      beforeEach(() => {
        configure({ logLevel: 'info' });
      });

      it('should NOT show debug messages', () => {
        debug('test', 'debug message');
        assert.strictEqual(consoleErrorMock.mock.calls.length, 0);
      });

      it('should show info messages', () => {
        info('info message');
        assert.strictEqual(consoleLogMock.mock.calls.length > 0, true);
      });

      it('should show warn messages', () => {
        warn('warn message');
        assert.strictEqual(consoleErrorMock.mock.calls.length > 0, true);
      });

      it('should show error messages', () => {
        error('error message');
        assert.strictEqual(consoleErrorMock.mock.calls.length > 0, true);
      });
    });

    describe('warn level', () => {
      beforeEach(() => {
        configure({ logLevel: 'warn' });
      });

      it('should NOT show debug messages', () => {
        debug('test', 'debug message');
        assert.strictEqual(consoleErrorMock.mock.calls.length, 0);
      });

      it('should NOT show info messages', () => {
        info('info message');
        assert.strictEqual(consoleLogMock.mock.calls.length, 0);
      });

      it('should show warn messages', () => {
        warn('warn message');
        assert.strictEqual(consoleErrorMock.mock.calls.length > 0, true);
      });

      it('should show error messages', () => {
        error('error message');
        assert.strictEqual(consoleErrorMock.mock.calls.length > 0, true);
      });
    });

    describe('error level', () => {
      beforeEach(() => {
        configure({ logLevel: 'error' });
      });

      it('should NOT show debug messages', () => {
        debug('test', 'debug message');
        assert.strictEqual(consoleErrorMock.mock.calls.length, 0);
      });

      it('should NOT show info messages', () => {
        info('info message');
        assert.strictEqual(consoleLogMock.mock.calls.length, 0);
      });

      it('should NOT show warn messages', () => {
        warn('warn message');
        assert.strictEqual(consoleErrorMock.mock.calls.length, 0);
      });

      it('should show error messages', () => {
        error('error message');
        assert.strictEqual(consoleErrorMock.mock.calls.length > 0, true);
      });
    });
  });

  describe('silent mode', () => {
    beforeEach(() => {
      configure({ silent: true });
    });

    it('should suppress all output regardless of log level', () => {
      debug('test', 'debug message');
      info('info message');
      warn('warn message');
      error('error message');

      assert.strictEqual(consoleLogMock.mock.calls.length, 0);
      assert.strictEqual(consoleErrorMock.mock.calls.length, 0);
    });
  });

  describe('priority order', () => {
    it('should prioritize: logLevel > verbose > env var > default', () => {
      process.env.VIZZLY_LOG_LEVEL = 'warn';

      // Default uses env var
      configure({});
      assert.strictEqual(getLogLevel(), 'warn');

      // verbose overrides env var
      configure({ verbose: true });
      assert.strictEqual(getLogLevel(), 'debug');

      // explicit logLevel overrides verbose
      configure({ logLevel: 'error', verbose: true });
      assert.strictEqual(getLogLevel(), 'error');
    });
  });
});
