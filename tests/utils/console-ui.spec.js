import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleUI } from '../../src/utils/console-ui.js';

describe('ConsoleUI', () => {
  let consoleErrorSpy;
  let consoleLogSpy;
  let processExitSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('error()', () => {
    it('should display error message without verbose mode', () => {
      const ui = new ConsoleUI({ verbose: false });
      const error = new Error('Port 47392 is already in use');

      ui.error('Failed to start server', error, 0);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('✖ Failed to start server')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Port 47392 is already in use')
      );
    });

    it('should not display stack trace without verbose mode', () => {
      const ui = new ConsoleUI({ verbose: false });
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at something.js:10:5';

      ui.error('Operation failed', error, 0);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test error')
      );
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('at something.js:10:5')
      );
    });

    it('should display stack trace in verbose mode', () => {
      const ui = new ConsoleUI({ verbose: true });
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at something.js:10:5';

      ui.error('Operation failed', error, 0);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test error')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('at something.js:10:5')
      );
    });

    it('should handle string errors', () => {
      const ui = new ConsoleUI({ verbose: false });

      ui.error('Failed', 'Connection timeout', 0);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('✖ Failed')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Connection timeout')
      );
    });

    it('should handle error objects with custom getUserMessage', () => {
      const ui = new ConsoleUI({ verbose: false });
      const error = new Error('Internal error');
      error.getUserMessage = () => 'User-friendly error message';

      ui.error('Operation failed', error, 0);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('User-friendly error message')
      );
    });

    it('should display generic error messages from standard Error objects', () => {
      const ui = new ConsoleUI({ verbose: false });
      const error = new Error(
        'Port 47392 is already in use. Try a different port with --port.'
      );

      ui.error('Test run failed', error, 0);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('✖ Test run failed')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Port 47392 is already in use')
      );
    });

    it('should exit with specified code when exitCode > 0', () => {
      const ui = new ConsoleUI({ verbose: false });
      const error = new Error('Fatal error');

      ui.error('Critical failure', error, 1);

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should not exit when exitCode is 0', () => {
      const ui = new ConsoleUI({ verbose: false });
      const error = new Error('Non-fatal error');

      ui.error('Warning', error, 0);

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should output JSON format when json mode is enabled', () => {
      const ui = new ConsoleUI({ json: true, verbose: false });
      const error = new Error('Test error');

      ui.error('Operation failed', error, 0);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('"status":"error"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Operation failed"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test error"')
      );
    });

    it('should not show duplicate message when error message matches context message', () => {
      const ui = new ConsoleUI({ verbose: false });
      const error = new Error('Operation failed');

      ui.error('Operation failed', error, 0);

      // Should only show the message once (as the main error line)
      const calls = consoleErrorSpy.mock.calls;
      const errorMessageCalls = calls.filter(call =>
        call[0].includes('Operation failed')
      );
      expect(errorMessageCalls.length).toBe(1);
    });

    it('should handle plain error objects', () => {
      const ui = new ConsoleUI({ verbose: false });
      const error = { code: 'ECONNREFUSED', syscall: 'connect', port: 3000 };

      ui.error('Connection failed', error, 0);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('✖ Connection failed')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ECONNREFUSED')
      );
    });

    it('should handle circular references in error objects', () => {
      const ui = new ConsoleUI({ verbose: false });
      const error = { message: 'Circular error' };
      error.self = error; // Create circular reference

      ui.error('Circular reference error', error, 0);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('✖ Circular reference error')
      );
      // Should fallback to String(error) which outputs "[object Object]"
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[object Object]')
      );
    });
  });

  describe('success()', () => {
    it('should display success message', () => {
      const ui = new ConsoleUI();

      ui.success('Operation completed');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓ Operation completed')
      );
    });
  });

  describe('info()', () => {
    it('should display info message', () => {
      const ui = new ConsoleUI();

      ui.info('Processing...');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('ℹ Processing...')
      );
    });
  });

  describe('warning()', () => {
    it('should display warning message', () => {
      const ui = new ConsoleUI();

      ui.warning('Deprecated feature');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠ Deprecated feature')
      );
    });
  });
});
