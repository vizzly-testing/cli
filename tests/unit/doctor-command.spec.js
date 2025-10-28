import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  doctorCommand,
  validateDoctorOptions,
} from '../../src/commands/doctor.js';

// Mock dependencies actually used by the lean doctor
const mockConsoleUIStore = { mockInstance: null };
const mockApiServiceStore = { mockInstance: null };

vi.mock('../../src/utils/config-loader.js');
vi.mock('../../src/utils/console-ui.js', () => ({
  ConsoleUI: vi.fn(function () {
    return mockConsoleUIStore.mockInstance;
  }),
}));
vi.mock('../../src/services/api-service.js', () => ({
  ApiService: vi.fn(function () {
    return mockApiServiceStore.mockInstance;
  }),
}));

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

const mockLoadConfig = vi.fn();

// Mock ApiService class with getBuilds
class MockApiService {
  constructor() {}
  getBuilds = vi.fn().mockResolvedValue({ data: [] });
}

describe('Doctor Command (lean preflight)', () => {
  let originalNodeVersion;
  let originalConsoleLog;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mocks
    mockConsoleUIStore.mockInstance = mockConsoleUI;

    const { loadConfig } = await import('../../src/utils/config-loader.js');
    loadConfig.mockImplementation(mockLoadConfig);

    let mockApiService = new MockApiService();
    mockApiServiceStore.mockInstance = mockApiService;

    // Mock process.version
    originalNodeVersion = process.version;
    Object.defineProperty(process, 'version', {
      value: 'v20.15.0',
      configurable: true,
    });

    // Quiet console
    originalConsoleLog = console.log;
    console.log = vi.fn();
    console.error = vi.fn();

    // Default config
    mockLoadConfig.mockResolvedValue({
      apiKey: 'test-token',
      apiUrl: 'https://vizzly.dev',
      server: { port: 47392 },
      comparison: { threshold: 0.1 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'version', {
      value: originalNodeVersion,
      configurable: true,
    });
    console.log = originalConsoleLog;
    console.error = originalConsoleLog;
  });

  it('runs local preflight checks successfully', async () => {
    await doctorCommand({}, { verbose: false, json: false });

    expect(mockConsoleUI.info).toHaveBeenCalledWith(
      'Running Vizzly preflight (local checks only)...'
    );
    expect(mockConsoleUI.success).toHaveBeenCalledWith(
      'Node.js version: v20.15.0 (supported)'
    );
    expect(mockConsoleUI.success).toHaveBeenCalledWith(
      'API URL: https://vizzly.dev'
    );
    expect(mockConsoleUI.success).toHaveBeenCalledWith('Threshold: 0.1');
    expect(mockConsoleUI.info).toHaveBeenCalledWith('Effective port: 47392');
    expect(mockConsoleUI.success).toHaveBeenCalledWith('Preflight passed.');
  });

  it('fails when Node < 20', async () => {
    Object.defineProperty(process, 'version', {
      value: 'v18.19.1',
      configurable: true,
    });
    const spyExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

    await doctorCommand({}, { verbose: false, json: false });

    expect(mockConsoleUI.error).toHaveBeenCalledWith(
      'Node.js version must be \u003e= 20',
      {},
      0
    );
    expect(spyExit).toHaveBeenCalledWith(1);
    spyExit.mockRestore();
  });

  it('validates apiUrl format', async () => {
    mockLoadConfig.mockResolvedValueOnce({
      apiKey: 'test-token',
      apiUrl: 'not-a-url',
      server: { port: 47392 },
      comparison: { threshold: 0.1 },
    });
    const spyExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

    await doctorCommand({}, { verbose: false, json: false });

    expect(mockConsoleUI.error).toHaveBeenCalledWith(
      'Invalid apiUrl in configuration (set VIZZLY_API_URL or config file)',
      expect.any(Error),
      0
    );
    expect(spyExit).toHaveBeenCalledWith(1);
    spyExit.mockRestore();
  });

  it('validates threshold range', async () => {
    mockLoadConfig.mockResolvedValueOnce({
      apiKey: 'test-token',
      apiUrl: 'https://vizzly.dev',
      server: { port: 47392 },
      comparison: { threshold: 5 },
    });
    const spyExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

    await doctorCommand({}, { verbose: false, json: false });

    expect(mockConsoleUI.error).toHaveBeenCalledWith(
      'Invalid threshold (expected number between 0 and 1)',
      {},
      0
    );
    expect(spyExit).toHaveBeenCalledWith(1);
    spyExit.mockRestore();
  });

  it('skips API connectivity by default', async () => {
    await doctorCommand({}, { verbose: false, json: false });

    // No progress message about API if not requested
    expect(mockConsoleUI.progress).not.toHaveBeenCalledWith(
      'Checking API connectivity...'
    );
  });

  it('checks API connectivity when --api flag is set and token exists', async () => {
    const instance = new MockApiService();
    mockApiServiceStore.mockInstance = instance;

    await doctorCommand({ api: true }, { verbose: false, json: false });

    expect(mockConsoleUI.progress).toHaveBeenCalledWith(
      'Checking API connectivity...'
    );
    expect(instance.getBuilds).toHaveBeenCalledWith({ limit: 1 });
    expect(mockConsoleUI.success).toHaveBeenCalledWith('API connectivity OK');
  });

  it('fails API connectivity when --api is set and token missing', async () => {
    mockLoadConfig.mockResolvedValueOnce({
      apiKey: null,
      apiUrl: 'https://vizzly.dev',
      server: { port: 47392 },
      comparison: { threshold: 0.1 },
    });
    const spyExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

    await doctorCommand({ api: true }, { verbose: false, json: false });

    expect(mockConsoleUI.error).toHaveBeenCalledWith(
      'Missing API token for connectivity check',
      {},
      0
    );
    expect(spyExit).toHaveBeenCalledWith(1);
    spyExit.mockRestore();
  });

  it('surfaces API connectivity errors when --api is set', async () => {
    class FailingApi extends MockApiService {
      getBuilds = vi.fn().mockRejectedValue(new Error('Network error'));
    }
    mockApiServiceStore.mockInstance = new FailingApi();
    const spyExit = vi.spyOn(process, 'exit').mockImplementation(() => {});

    await doctorCommand({ api: true }, { verbose: false, json: false });

    expect(mockConsoleUI.error).toHaveBeenCalledWith(
      'API connectivity failed',
      expect.any(Error),
      0
    );
    expect(spyExit).toHaveBeenCalledWith(1);
    spyExit.mockRestore();
  });

  it('outputs JSON diagnostics when requested', async () => {
    await doctorCommand({}, { verbose: false, json: true });

    expect(mockConsoleUI.data).toHaveBeenCalledWith({
      passed: true,
      diagnostics: expect.any(Object),
      timestamp: expect.any(String),
    });
  });

  describe('validateDoctorOptions', () => {
    it('returns no errors', () => {
      const errors = validateDoctorOptions({});
      expect(errors).toEqual([]);
    });
  });
});
