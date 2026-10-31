import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import {
  cleanup,
  configure,
  debug,
  error,
  getLogLevel,
  info,
  isVerbose,
  normalizeDebugArgs,
  reset,
  warn,
} from './output.js';

describe('output log levels', () => {
  let originalEnv;
  let consoleLogMock;
  let consoleErrorMock;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.VIZZLY_LOG_LEVEL;
    // Reset module state before each test
    reset();
    consoleLogMock = mock.method(console, 'log', () => {});
    consoleErrorMock = mock.method(console, 'error', () => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleLogMock.mock.restore();
    consoleErrorMock.mock.restore();
    cleanup();
    reset();
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

  it('preserves the configured level when changing another output option', () => {
    configure({ logLevel: 'warn' });
    configure({ json: true });
    assert.strictEqual(getLogLevel(), 'warn');
  });

  it('restores the default log level after reset', () => {
    configure({ logLevel: 'error' });
    reset();
    assert.strictEqual(getLogLevel(), 'info');
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
    let levels = ['debug', 'info', 'warn', 'error'];

    for (let [minimum, level] of levels.entries()) {
      it(`prints messages at ${level} level and above to the right streams`, () => {
        configure({ logLevel: level, color: false });
        debug('test', 'debug message');
        info('info message');
        warn('warn message');
        error('error message');

        let stdout = consoleLogMock.mock.calls
          .map(call => call.arguments.join(' '))
          .join('\n');
        let stderr = consoleErrorMock.mock.calls
          .map(call => call.arguments.join(' '))
          .join('\n');

        for (let [index, messageLevel] of levels.entries()) {
          let output = messageLevel === 'info' ? stdout : stderr;
          assert.strictEqual(
            output.includes(`${messageLevel} message`),
            index >= minimum,
            `${messageLevel} output at ${level} level`
          );
        }
        assert.doesNotMatch(stdout, /debug message|warn message|error message/);
        assert.doesNotMatch(stderr, /info message/);
      });
    }
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

  describe('debug argument normalization', () => {
    it('keeps component-scoped debug messages explicit', () => {
      assert.deepStrictEqual(
        normalizeDebugArgs('server', 'ready on :47392', { port: 47392 }),
        {
          component: 'server',
          message: 'ready on :47392',
          data: { port: 47392 },
        }
      );
    });

    it('preserves legacy message-only debug calls', () => {
      assert.deepStrictEqual(normalizeDebugArgs('Plugin loaded'), {
        component: null,
        message: 'Plugin loaded',
        data: {},
      });
    });

    it('preserves legacy message plus data debug calls', () => {
      assert.deepStrictEqual(
        normalizeDebugArgs('Failed to read cache', { error: 'ENOENT' }),
        {
          component: null,
          message: 'Failed to read cache',
          data: { error: 'ENOENT' },
        }
      );
    });

    it('prints legacy debug data in JSON mode without losing fields', () => {
      configure({ json: true, logLevel: 'debug' });

      debug('Failed to read cache', { error: 'ENOENT' });

      assert.strictEqual(consoleErrorMock.mock.calls.length, 1);
      let line = consoleErrorMock.mock.calls[0].arguments[0];
      let data = JSON.parse(line);
      assert.match(data.time, /^\d+ms$/);
      delete data.time;
      assert.deepStrictEqual(data, {
        status: 'debug',
        component: null,
        message: 'Failed to read cache',
        error: 'ENOENT',
      });
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
