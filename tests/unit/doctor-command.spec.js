import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  doctorCommand,
  validateDoctorOptions,
} from '../../src/commands/doctor.js';

// Mock Node.js modules
vi.mock('fs');
vi.mock('child_process');
vi.mock('net');

// Mock dependencies
vi.mock('../../src/utils/config-loader.js');
vi.mock('../../src/utils/console-ui.js');
vi.mock('../../src/container/index.js');

const mockConsoleUI = {
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  data: vi.fn(),
  progress: vi.fn(),
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  cleanup: vi.fn(),
};

const mockApiService = {
  validateToken: vi.fn(),
};

const mockContainer = {
  get: vi.fn(),
};

const mockLoadConfig = vi.fn();

describe('Doctor Command', () => {
  let mockFs, mockChildProcess, mockNet;
  let originalNodeVersion, originalConsoleLog;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock Node.js modules
    mockFs = await import('fs');
    mockChildProcess = await import('child_process');
    mockNet = await import('net');

    // Setup mocks
    const { ConsoleUI } = await import('../../src/utils/console-ui.js');
    ConsoleUI.mockImplementation(() => mockConsoleUI);

    const { loadConfig } = await import('../../src/utils/config-loader.js');
    loadConfig.mockImplementation(mockLoadConfig);

    const { container } = await import('../../src/container/index.js');
    container.get.mockImplementation(mockContainer.get);

    // Mock process.version
    originalNodeVersion = process.version;
    Object.defineProperty(process, 'version', {
      value: 'v20.15.0',
      configurable: true,
    });

    // Mock console.log and console.error to prevent output during tests
    originalConsoleLog = console.log;
    console.log = vi.fn();
    console.error = vi.fn();

    // Default mock responses
    mockLoadConfig.mockResolvedValue({
      apiKey: 'test-token',
      apiUrl: 'https://api.test.com',
      server: { port: 3001 },
      build: { environment: 'test' },
      comparison: { threshold: 0.01 },
    });

    mockContainer.get.mockResolvedValue(mockApiService);
    mockApiService.validateToken.mockResolvedValue({ valid: true });

    // Mock fs operations
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        name: '@vizzly-testing/cli',
        dependencies: {
          commander: '^11.1.0',
          cosmiconfig: '^9.0.0',
          colorette: '^2.0.20',
        },
      })
    );
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.unlinkSync.mockImplementation(() => {});

    // Mock child_process.execSync
    mockChildProcess.execSync.mockReturnValue('8.19.2\n');

    // Mock net server
    const mockServer = {
      listen: vi.fn((port, callback) => callback()),
      close: vi.fn(),
    };
    mockNet.createServer.mockReturnValue(mockServer);

    // Mock environment variables
    delete process.env.CI;
    delete process.env.CONTINUOUS_INTEGRATION;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'version', {
      value: originalNodeVersion,
      configurable: true,
    });
    console.log = originalConsoleLog;
    console.error = originalConsoleLog; // Reset to original
  });

  describe('doctorCommand', () => {
    it('should run all diagnostic checks successfully', async () => {
      await doctorCommand({}, { verbose: false, json: false });

      expect(mockConsoleUI.info).toHaveBeenCalledWith(
        'Running Vizzly environment diagnostics...'
      );
      expect(mockConsoleUI.success).toHaveBeenCalledWith(
        '✓ Node.js version: v20.15.0 (supported)'
      );
      expect(mockConsoleUI.success).toHaveBeenCalledWith(
        '✓ npm version: 8.19.2'
      );
      expect(mockConsoleUI.success).toHaveBeenCalledWith(
        '✓ package.json found (project: @vizzly-testing/cli)'
      );
      expect(mockConsoleUI.success).toHaveBeenCalledWith(
        '✓ API token configured'
      );
      expect(mockConsoleUI.success).toHaveBeenCalledWith(
        '✓ API connectivity working'
      );
      expect(mockConsoleUI.success).toHaveBeenCalledWith(
        'All diagnostics passed! Vizzly CLI is ready to use'
      );
      expect(mockConsoleUI.cleanup).toHaveBeenCalled();
    });

    it('should handle old Node.js version', async () => {
      Object.defineProperty(process, 'version', {
        value: 'v16.14.0',
        configurable: true,
      });

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await doctorCommand({}, { verbose: false, json: false });

      expect(console.error).toHaveBeenCalledWith(
        '✗ Node.js version: v16.14.0 (requires >= 20.0.0)'
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('should handle missing npm', async () => {
      mockChildProcess.execSync.mockImplementation(() => {
        throw new Error('npm not found');
      });

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await doctorCommand({}, { verbose: false, json: false });

      expect(console.error).toHaveBeenCalledWith('✗ npm not found in PATH');
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('should handle missing package.json', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await doctorCommand({}, { verbose: false, json: false });

      expect(mockConsoleUI.warning).toHaveBeenCalledWith(
        '⚠ package.json not found (not in a Node.js project?)'
      );
    });

    it('should handle invalid package.json', async () => {
      mockFs.readFileSync.mockReturnValue('invalid json');

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await doctorCommand({}, { verbose: false, json: false });

      expect(console.error).toHaveBeenCalledWith(
        '✗ package.json exists but is invalid JSON'
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('should handle missing API token', async () => {
      mockLoadConfig.mockResolvedValue({ apiKey: null });

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await doctorCommand({}, { verbose: false, json: false });

      expect(console.error).toHaveBeenCalledWith(
        '✗ API token not found (set VIZZLY_TOKEN or use --token)'
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('should handle API connectivity failure', async () => {
      const apiError = new Error('Network error');
      mockApiService.validateToken.mockRejectedValue(apiError);

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await doctorCommand({}, { verbose: false, json: false });

      expect(console.error).toHaveBeenCalledWith(
        '✗ API connectivity failed: Network error'
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('should skip API test when no token is configured', async () => {
      mockLoadConfig.mockResolvedValue({ apiKey: null });

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await doctorCommand({}, { verbose: false, json: false });

      expect(mockConsoleUI.warning).toHaveBeenCalledWith(
        '⚠ Skipping API connectivity test (no token configured)'
      );
      expect(mockApiService.validateToken).not.toHaveBeenCalled();

      mockExit.mockRestore();
    });

    it('should handle write permission errors', async () => {
      // Mock writeFileSync to throw error but make sure unlinkSync doesn't get called
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await doctorCommand({}, { verbose: false, json: false });

      expect(console.error).toHaveBeenCalledWith(
        '✗ Cannot write to current directory'
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('should detect CI environment', async () => {
      process.env.CI = 'true';

      await doctorCommand({}, { verbose: false, json: false });

      expect(mockConsoleUI.info).toHaveBeenCalledWith(
        'ℹ Running in CI environment'
      );
    });

    it('should show verbose configuration details', async () => {
      await doctorCommand({}, { verbose: true, json: false });

      expect(mockConsoleUI.info).toHaveBeenCalledWith(
        'Configuration details:',
        {
          serverPort: 3001,
          buildEnvironment: 'test',
          threshold: 0.01,
        }
      );
    });

    it('should output JSON diagnostics when requested', async () => {
      await doctorCommand({}, { verbose: false, json: true });

      expect(mockConsoleUI.data).toHaveBeenCalledWith({
        summary: {
          passed: true,
          errors: false,
          timestamp: expect.any(String),
        },
        diagnostics: expect.any(Object),
      });
    });

    it('should pass global options to ConsoleUI', async () => {
      const globalOptions = {
        json: true,
        verbose: true,
        noColor: true,
      };

      const { ConsoleUI } = await import('../../src/utils/console-ui.js');

      await doctorCommand({}, globalOptions);

      expect(ConsoleUI).toHaveBeenCalledWith({
        json: true,
        verbose: true,
        color: false,
      });
    });

    it('should handle configuration loading errors', async () => {
      const configError = new Error('Config file not found');
      mockLoadConfig.mockRejectedValue(configError);

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await doctorCommand({}, { verbose: false, json: false });

      expect(console.error).toHaveBeenCalledWith(
        '✗ Failed to load configuration:',
        'Config file not found'
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });

    it('should show next steps when all diagnostics pass', async () => {
      await doctorCommand({}, { verbose: false, json: false });

      expect(mockConsoleUI.info).toHaveBeenCalledWith('Next steps:');
      expect(console.log).toHaveBeenCalledWith(
        '  1. Try uploading screenshots: vizzly upload ./screenshots'
      );
      expect(console.log).toHaveBeenCalledWith(
        '  2. Or integrate with tests: vizzly run "npm test"'
      );
      expect(console.log).toHaveBeenCalledWith('  3. See help: vizzly --help');
    });

    it('should not show next steps in JSON mode', async () => {
      await doctorCommand({}, { verbose: false, json: true });

      expect(mockConsoleUI.info).not.toHaveBeenCalledWith('Next steps:');
    });

    it('should handle overall command errors gracefully', async () => {
      const commandError = new Error('Unexpected error');
      mockConsoleUI.info.mockImplementation(() => {
        throw commandError;
      });

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await doctorCommand({}, { verbose: false, json: false });

      expect(console.error).toHaveBeenCalledWith(
        'Failed to run diagnostics:',
        'Unexpected error'
      );
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockRestore();
    });
  });

  describe('validateDoctorOptions', () => {
    it('should return no errors (doctor command has no options to validate)', () => {
      const errors = validateDoctorOptions({});
      expect(errors).toEqual([]);
    });

    it('should return no errors regardless of input', () => {
      const errors = validateDoctorOptions({ anyOption: 'value' });
      expect(errors).toEqual([]);
    });
  });
});
