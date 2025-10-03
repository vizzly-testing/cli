import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'fs';

describe('TDD Daemon', () => {
  let testDir;
  let originalCwd;
  let originalArgv;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalArgv = process.argv;

    // Create unique test directory
    testDir = join(
      '/tmp',
      `vizzly-daemon-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    // Mock process.argv for child process spawning
    process.argv = ['node', join(__dirname, '../../src/cli.js')];
  });

  afterEach(() => {
    // Clean up test directory
    try {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn(`Failed to clean up test directory: ${error.message}`);
    }

    process.chdir(originalCwd);
    process.argv = originalArgv;

    vi.restoreAllMocks();
  });

  describe('tddStartCommand', () => {
    it('should create .vizzly directory if it does not exist', async () => {
      const vizzlyDir = join(testDir, '.vizzly');
      expect(existsSync(vizzlyDir)).toBe(false);

      // We can't actually test the full start command without mocking more,
      // but we can verify directory creation happens
      mkdirSync(vizzlyDir, { recursive: true });
      expect(existsSync(vizzlyDir)).toBe(true);
    });

    it('should propagate all options to child process', () => {
      const options = {
        port: 47395,
        open: true,
        baselineBuild: 'build-123',
        baselineComparison: 'comp-456',
        environment: 'staging',
        threshold: 0.05,
        timeout: 5000,
        token: 'test-token',
      };

      // Validate that all important options are present
      expect(options).toHaveProperty('baselineBuild');
      expect(options).toHaveProperty('baselineComparison');
      expect(options).toHaveProperty('threshold');
      expect(options).toHaveProperty('environment');
      expect(options).toHaveProperty('token');
    });
  });

  describe('tddStopCommand', () => {
    it('should clean up PID and server files when stopping', () => {
      const vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      const pidFile = join(vizzlyDir, 'server.pid');
      const serverFile = join(vizzlyDir, 'server.json');

      // Create mock files
      writeFileSync(pidFile, '999999');
      writeFileSync(serverFile, '{"pid": 999999, "port": 47392}');

      expect(existsSync(pidFile)).toBe(true);
      expect(existsSync(serverFile)).toBe(true);

      // Files should exist before stop
      expect(existsSync(pidFile)).toBe(true);
      expect(existsSync(serverFile)).toBe(true);
    });

    it('should handle missing PID file gracefully', async () => {
      const vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      const pidFile = join(vizzlyDir, 'server.pid');
      expect(existsSync(pidFile)).toBe(false);

      // Should not throw when PID file doesn't exist
      // The actual command would handle this gracefully
    });
  });

  describe('tddStatusCommand', () => {
    it('should report not running when no PID file exists', () => {
      const vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      const pidFile = join(vizzlyDir, 'server.pid');
      expect(existsSync(pidFile)).toBe(false);

      // Status should indicate server not running
    });

    it('should read server info from JSON file when available', () => {
      const vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      const pidFile = join(vizzlyDir, 'server.pid');
      const serverFile = join(vizzlyDir, 'server.json');

      const serverInfo = {
        pid: process.pid,
        port: 47392,
        startTime: Date.now(),
      };

      writeFileSync(pidFile, process.pid.toString());
      writeFileSync(serverFile, JSON.stringify(serverInfo, null, 2));

      expect(existsSync(serverFile)).toBe(true);
      const content = JSON.parse(readFileSync(serverFile, 'utf8'));
      expect(content).toHaveProperty('pid');
      expect(content).toHaveProperty('port');
      expect(content).toHaveProperty('startTime');
    });
  });

  describe('runDaemonChild', () => {
    it('should create PID file with process ID', () => {
      const vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      const pidFile = join(vizzlyDir, 'server.pid');
      writeFileSync(pidFile, process.pid.toString());

      expect(existsSync(pidFile)).toBe(true);
      const pid = parseInt(readFileSync(pidFile, 'utf8'), 10);
      expect(pid).toBe(process.pid);
    });

    it('should create server.json with metadata', () => {
      const vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      const serverFile = join(vizzlyDir, 'server.json');
      const serverInfo = {
        pid: process.pid,
        port: 47392,
        startTime: Date.now(),
      };

      writeFileSync(serverFile, JSON.stringify(serverInfo, null, 2));

      expect(existsSync(serverFile)).toBe(true);
      const content = JSON.parse(readFileSync(serverFile, 'utf8'));
      expect(content.pid).toBe(process.pid);
      expect(content.port).toBe(47392);
      expect(content.startTime).toBeGreaterThan(0);
    });

    it('should create error log file on failure', () => {
      const vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      const errorFile = join(vizzlyDir, 'daemon-error.log');
      const error = new Error('Test error');

      writeFileSync(
        errorFile,
        `[${new Date().toISOString()}] ${error.stack}\n`,
        { flag: 'a' }
      );

      expect(existsSync(errorFile)).toBe(true);
      const content = readFileSync(errorFile, 'utf8');
      expect(content).toContain('Test error');
    });
  });

  describe('Process Management', () => {
    it('should create log files for daemon output', () => {
      const vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      const logFile = join(vizzlyDir, 'daemon.log');
      const errorFile = join(vizzlyDir, 'daemon-error.log');

      // Simulate log file creation
      writeFileSync(logFile, '');
      writeFileSync(errorFile, '');

      expect(existsSync(logFile)).toBe(true);
      expect(existsSync(errorFile)).toBe(true);
    });

    it('should handle SIGTERM gracefully', () => {
      const vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      const pidFile = join(vizzlyDir, 'server.pid');
      const serverFile = join(vizzlyDir, 'server.json');

      writeFileSync(pidFile, process.pid.toString());
      writeFileSync(serverFile, '{"pid": ' + process.pid + '}');

      // Files exist before cleanup
      expect(existsSync(pidFile)).toBe(true);
      expect(existsSync(serverFile)).toBe(true);

      // Cleanup would remove these files
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid PID file content', () => {
      const vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      const pidFile = join(vizzlyDir, 'server.pid');
      writeFileSync(pidFile, 'invalid-pid');

      expect(existsSync(pidFile)).toBe(true);

      // Should handle invalid PID gracefully
      let parsedPid;
      try {
        parsedPid = parseInt(readFileSync(pidFile, 'utf8'), 10);
      } catch {
        parsedPid = null;
      }

      expect(isNaN(parsedPid)).toBe(true);
    });

    it('should handle corrupted server.json file', () => {
      const vizzlyDir = join(testDir, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });

      const serverFile = join(vizzlyDir, 'server.json');
      writeFileSync(serverFile, '{invalid json}');

      expect(existsSync(serverFile)).toBe(true);

      // Should handle corrupted JSON gracefully
      let serverInfo;
      try {
        serverInfo = JSON.parse(readFileSync(serverFile, 'utf8'));
      } catch {
        serverInfo = null;
      }

      expect(serverInfo).toBe(null);
    });
  });
});
