/**
 * Tests for project commands
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  projectSelectCommand,
  projectListCommand,
  projectTokenCommand,
  projectRemoveCommand,
} from '../../src/commands/project.js';
import * as globalConfig from '../../src/utils/global-config.js';
import readline from 'readline';

// Mock AuthService
const mockAuthServiceStore = { mockInstance: null };

vi.mock('../../src/services/auth-service.js', () => ({
  AuthService: vi.fn(function () {
    return mockAuthServiceStore.mockInstance;
  }),
}));

// Mock global-config
vi.mock('../../src/utils/global-config.js', () => ({
  getAuthTokens: vi.fn(),
  saveProjectMapping: vi.fn(),
  getProjectMapping: vi.fn(),
  getProjectMappings: vi.fn(),
  deleteProjectMapping: vi.fn(),
}));

// Mock readline
vi.mock('readline', () => ({
  default: {
    createInterface: vi.fn(),
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe('Project Commands', () => {
  let mockAuthService;
  let consoleLogSpy;
  let processExitSpy;
  let mockRl;

  beforeEach(() => {
    // Mock AuthService instance
    mockAuthService = {
      whoami: vi.fn(),
    };
    mockAuthServiceStore.mockInstance = mockAuthService;

    // Mock readline interface
    mockRl = {
      question: vi.fn(),
      close: vi.fn(),
    };
    readline.createInterface.mockReturnValue(mockRl);

    // Spy on console.log
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Mock process.exit - throw to stop execution
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`process.exit(${code})`);
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('projectSelectCommand', () => {
    it('should require authentication', async () => {
      globalConfig.getAuthTokens.mockResolvedValue(null);

      try {
        await projectSelectCommand({}, {});
      } catch {
        // Expected to throw from process.exit
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should select and configure project successfully', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
      });

      mockAuthService.whoami.mockResolvedValue({
        user: { name: 'Test User', email: 'test@example.com' },
        organizations: [{ id: 'org_1', name: 'Test Org', slug: 'test-org' }],
      });

      // Mock project API response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'proj_1', name: 'Test Project', slug: 'test-project' },
        ],
      });

      // Mock token creation response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'vzt_test_token_123',
        }),
      });

      // Mock readline prompts - organization and project selection
      mockRl.question
        .mockImplementationOnce((prompt, callback) => callback('1')) // Select org
        .mockImplementationOnce((prompt, callback) => callback('1')); // Select project

      await projectSelectCommand({}, {});

      expect(mockAuthService.whoami).toHaveBeenCalled();
      expect(globalConfig.saveProjectMapping).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          token: 'vzt_test_token_123',
          projectSlug: 'test-project',
          organizationSlug: 'test-org',
        })
      );
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should handle no organizations', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
      });

      mockAuthService.whoami.mockResolvedValue({
        user: { name: 'Test User' },
        organizations: [],
      });

      try {
        await projectSelectCommand({}, {});
      } catch {
        // Expected to throw from process.exit
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle no projects', async () => {
      globalConfig.getAuthTokens.mockResolvedValue({
        accessToken: 'test_access_token',
      });

      mockAuthService.whoami.mockResolvedValue({
        user: { name: 'Test User' },
        organizations: [{ name: 'Test Org', slug: 'test-org' }],
      });

      // Mock project API response with empty array
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      mockRl.question.mockImplementationOnce((prompt, callback) =>
        callback('1')
      );

      try {
        await projectSelectCommand({}, {});
      } catch {
        // Expected to throw from process.exit
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('projectListCommand', () => {
    it('should show message when no projects configured', async () => {
      globalConfig.getProjectMappings.mockResolvedValue({});

      await projectListCommand({}, {});

      expect(processExitSpy).not.toHaveBeenCalled();
      let logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
      let hasMessage = logCalls.some(call => call.includes('No projects'));
      expect(hasMessage).toBe(true);
    });

    it('should list configured projects', async () => {
      globalConfig.getProjectMappings.mockResolvedValue({
        '/path/to/project1': {
          token: 'vzt_token_1',
          projectName: 'Project One',
          projectSlug: 'project-one',
          organizationSlug: 'test-org',
          createdAt: new Date().toISOString(),
        },
        '/path/to/project2': {
          token: 'vzt_token_2',
          projectName: 'Project Two',
          projectSlug: 'project-two',
          organizationSlug: 'test-org',
          createdAt: new Date().toISOString(),
        },
      });

      await projectListCommand({}, {});

      expect(processExitSpy).not.toHaveBeenCalled();
      let logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
      let hasProjects = logCalls.some(
        call => call.includes('Project One') || call.includes('Project Two')
      );
      expect(hasProjects).toBe(true);
    });

    it('should output JSON when --json flag is set', async () => {
      let mappings = {
        '/path/to/project': {
          token: 'vzt_token_1',
          projectName: 'Test Project',
          projectSlug: 'test-project',
          organizationSlug: 'test-org',
        },
      };

      globalConfig.getProjectMappings.mockResolvedValue(mappings);

      await projectListCommand({}, { json: true });

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should show verbose info when --verbose flag is set', async () => {
      globalConfig.getProjectMappings.mockResolvedValue({
        '/path/to/project': {
          token: 'vzt_token_123_very_long_token',
          projectName: 'Test Project',
          projectSlug: 'test-project',
          organizationSlug: 'test-org',
          createdAt: new Date().toISOString(),
        },
      });

      await projectListCommand({}, { verbose: true });

      let logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
      let hasTokenInfo = logCalls.some(call => call.includes('Token:'));
      expect(hasTokenInfo).toBe(true);
    });
  });

  describe('projectTokenCommand', () => {
    it('should show error when no project configured', async () => {
      globalConfig.getProjectMapping.mockResolvedValue(null);

      try {
        await projectTokenCommand({}, {});
      } catch {
        // Expected to throw from process.exit
      }

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should display project token', async () => {
      globalConfig.getProjectMapping.mockResolvedValue({
        token: 'vzt_test_token_123',
        projectName: 'Test Project',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });

      await projectTokenCommand({}, {});

      expect(processExitSpy).not.toHaveBeenCalled();
      let logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
      let hasToken = logCalls.some(call => call.includes('vzt_test_token_123'));
      expect(hasToken).toBe(true);
    });

    it('should output JSON when --json flag is set', async () => {
      globalConfig.getProjectMapping.mockResolvedValue({
        token: 'vzt_test_token_123',
        projectName: 'Test Project',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });

      await projectTokenCommand({}, { json: true });

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should handle token object format', async () => {
      globalConfig.getProjectMapping.mockResolvedValue({
        token: {
          token: 'vzt_nested_token_123',
        },
        projectName: 'Test Project',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });

      await projectTokenCommand({}, {});

      let logCalls = consoleLogSpy.mock.calls.map(call => call.join(' '));
      let hasToken = logCalls.some(call =>
        call.includes('vzt_nested_token_123')
      );
      expect(hasToken).toBe(true);
    });
  });

  describe('projectRemoveCommand', () => {
    it('should show message when no project configured', async () => {
      globalConfig.getProjectMapping.mockResolvedValue(null);

      await projectRemoveCommand({}, {});

      expect(globalConfig.deleteProjectMapping).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should remove project configuration when confirmed', async () => {
      globalConfig.getProjectMapping.mockResolvedValue({
        token: 'vzt_test_token_123',
        projectName: 'Test Project',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });

      // Mock confirmation prompt - user answers 'y'
      mockRl.question.mockImplementationOnce((prompt, callback) =>
        callback('y')
      );

      await projectRemoveCommand({}, {});

      expect(globalConfig.deleteProjectMapping).toHaveBeenCalledWith(
        expect.any(String)
      );
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should cancel removal when not confirmed', async () => {
      globalConfig.getProjectMapping.mockResolvedValue({
        token: 'vzt_test_token_123',
        projectName: 'Test Project',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });

      // Mock confirmation prompt - user answers 'n'
      mockRl.question.mockImplementationOnce((prompt, callback) =>
        callback('n')
      );

      await projectRemoveCommand({}, {});

      expect(globalConfig.deleteProjectMapping).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should accept "yes" as confirmation', async () => {
      globalConfig.getProjectMapping.mockResolvedValue({
        token: 'vzt_test_token_123',
        projectName: 'Test Project',
        projectSlug: 'test-project',
        organizationSlug: 'test-org',
      });

      mockRl.question.mockImplementationOnce((prompt, callback) =>
        callback('yes')
      );

      await projectRemoveCommand({}, {});

      expect(globalConfig.deleteProjectMapping).toHaveBeenCalled();
    });
  });
});
