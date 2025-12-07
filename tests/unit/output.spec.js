import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  let consoleLog;
  let consoleError;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Reset module state before each test
    reset();
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('configure with logLevel', () => {
    it('should default to info level', () => {
      delete process.env.VIZZLY_LOG_LEVEL;
      configure({});
      expect(getLogLevel()).toBe('info');
    });

    it('should use VIZZLY_LOG_LEVEL env var when no explicit option', () => {
      process.env.VIZZLY_LOG_LEVEL = 'debug';
      configure({});
      expect(getLogLevel()).toBe('debug');
    });

    it('should use VIZZLY_LOG_LEVEL=warn', () => {
      process.env.VIZZLY_LOG_LEVEL = 'warn';
      configure({});
      expect(getLogLevel()).toBe('warn');
    });

    it('should use VIZZLY_LOG_LEVEL=error', () => {
      process.env.VIZZLY_LOG_LEVEL = 'error';
      configure({});
      expect(getLogLevel()).toBe('error');
    });

    it('should prefer explicit logLevel option over env var', () => {
      process.env.VIZZLY_LOG_LEVEL = 'debug';
      configure({ logLevel: 'error' });
      expect(getLogLevel()).toBe('error');
    });

    it('should map verbose=true to debug level', () => {
      delete process.env.VIZZLY_LOG_LEVEL;
      configure({ verbose: true });
      expect(getLogLevel()).toBe('debug');
      expect(isVerbose()).toBe(true);
    });

    it('should prefer explicit logLevel over verbose flag', () => {
      configure({ logLevel: 'warn', verbose: true });
      expect(getLogLevel()).toBe('warn');
      expect(isVerbose()).toBe(false);
    });

    it('should normalize case-insensitive log levels', () => {
      configure({ logLevel: 'DEBUG' });
      expect(getLogLevel()).toBe('debug');

      configure({ logLevel: 'WARN' });
      expect(getLogLevel()).toBe('warn');
    });

    it('should default to info for invalid log level', () => {
      configure({ logLevel: 'invalid' });
      expect(getLogLevel()).toBe('info');
    });

    it('should handle whitespace in log level', () => {
      configure({ logLevel: '  debug  ' });
      expect(getLogLevel()).toBe('debug');
    });
  });

  describe('isVerbose', () => {
    it('should return true when log level is debug', () => {
      configure({ logLevel: 'debug' });
      expect(isVerbose()).toBe(true);
    });

    it('should return false when log level is info', () => {
      configure({ logLevel: 'info' });
      expect(isVerbose()).toBe(false);
    });

    it('should return false when log level is warn', () => {
      configure({ logLevel: 'warn' });
      expect(isVerbose()).toBe(false);
    });
  });

  describe('log level filtering', () => {
    describe('debug level', () => {
      beforeEach(() => {
        configure({ logLevel: 'debug' });
      });

      it('should show debug messages', () => {
        debug('test', 'debug message');
        expect(consoleError).toHaveBeenCalled();
      });

      it('should show info messages', () => {
        info('info message');
        expect(consoleLog).toHaveBeenCalled();
      });

      it('should show warn messages', () => {
        warn('warn message');
        expect(consoleError).toHaveBeenCalled();
      });

      it('should show error messages', () => {
        error('error message');
        expect(consoleError).toHaveBeenCalled();
      });
    });

    describe('info level', () => {
      beforeEach(() => {
        configure({ logLevel: 'info' });
      });

      it('should NOT show debug messages', () => {
        debug('test', 'debug message');
        expect(consoleError).not.toHaveBeenCalled();
      });

      it('should show info messages', () => {
        info('info message');
        expect(consoleLog).toHaveBeenCalled();
      });

      it('should show warn messages', () => {
        warn('warn message');
        expect(consoleError).toHaveBeenCalled();
      });

      it('should show error messages', () => {
        error('error message');
        expect(consoleError).toHaveBeenCalled();
      });
    });

    describe('warn level', () => {
      beforeEach(() => {
        configure({ logLevel: 'warn' });
      });

      it('should NOT show debug messages', () => {
        debug('test', 'debug message');
        expect(consoleError).not.toHaveBeenCalled();
      });

      it('should NOT show info messages', () => {
        info('info message');
        expect(consoleLog).not.toHaveBeenCalled();
      });

      it('should show warn messages', () => {
        warn('warn message');
        expect(consoleError).toHaveBeenCalled();
      });

      it('should show error messages', () => {
        error('error message');
        expect(consoleError).toHaveBeenCalled();
      });
    });

    describe('error level', () => {
      beforeEach(() => {
        configure({ logLevel: 'error' });
      });

      it('should NOT show debug messages', () => {
        debug('test', 'debug message');
        expect(consoleError).not.toHaveBeenCalled();
      });

      it('should NOT show info messages', () => {
        info('info message');
        expect(consoleLog).not.toHaveBeenCalled();
      });

      it('should NOT show warn messages', () => {
        warn('warn message');
        expect(consoleError).not.toHaveBeenCalled();
      });

      it('should show error messages', () => {
        error('error message');
        expect(consoleError).toHaveBeenCalled();
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

      expect(consoleLog).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe('priority order', () => {
    it('should prioritize: logLevel > verbose > env var > default', () => {
      process.env.VIZZLY_LOG_LEVEL = 'warn';

      // Default uses env var
      configure({});
      expect(getLogLevel()).toBe('warn');

      // verbose overrides env var
      configure({ verbose: true });
      expect(getLogLevel()).toBe('debug');

      // explicit logLevel overrides verbose
      configure({ logLevel: 'error', verbose: true });
      expect(getLogLevel()).toBe('error');
    });
  });
});
