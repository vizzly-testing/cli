import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import {
  InitCommand,
  createInitCommand,
  init,
} from '../../src/commands/init.js';
import { VizzlyError } from '../../src/errors/vizzly-error.js';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('../../src/utils/logger-factory.js', () => ({
  createComponentLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('InitCommand', () => {
  let initCommand;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    initCommand = new InitCommand(mockLogger);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided logger', () => {
      const command = new InitCommand(mockLogger);
      expect(command.logger).toBe(mockLogger);
    });

    it('should create default logger when none provided', () => {
      const command = new InitCommand();
      expect(command.logger).toBeDefined();
    });
  });

  describe('run', () => {
    beforeEach(() => {
      vi.spyOn(path, 'join').mockReturnValue('/mock/path/vizzly.config.js');
      vi.spyOn(initCommand, 'fileExists').mockResolvedValue(false);
      vi.spyOn(initCommand, 'generateConfigFile').mockResolvedValue();
      vi.spyOn(initCommand, 'showNextSteps').mockImplementation(() => {});
    });

    it('should successfully initialize when no config exists', async () => {
      await initCommand.run();

      expect(mockLogger.info).toHaveBeenCalledWith(
        '🎯 Initializing Vizzly configuration...\n'
      );
      expect(initCommand.fileExists).toHaveBeenCalledWith(
        '/mock/path/vizzly.config.js'
      );
      expect(initCommand.generateConfigFile).toHaveBeenCalledWith(
        '/mock/path/vizzly.config.js'
      );
      expect(initCommand.showNextSteps).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        '\n✅ Vizzly CLI setup complete!'
      );
    });

    it('should warn and exit when config exists without force', async () => {
      initCommand.fileExists.mockResolvedValue(true);

      await initCommand.run({ force: false });

      expect(mockLogger.info).toHaveBeenCalledWith(
        '❌ A vizzly.config.js file already exists. Use --force to overwrite.'
      );
      expect(initCommand.generateConfigFile).not.toHaveBeenCalled();
      expect(initCommand.showNextSteps).not.toHaveBeenCalled();
    });

    it('should overwrite config when force option is provided', async () => {
      initCommand.fileExists.mockResolvedValue(true);

      await initCommand.run({ force: true });

      expect(initCommand.generateConfigFile).toHaveBeenCalledWith(
        '/mock/path/vizzly.config.js'
      );
      expect(initCommand.showNextSteps).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        '\n✅ Vizzly CLI setup complete!'
      );
    });

    it('should throw VizzlyError when file generation fails', async () => {
      const error = new Error('Permission denied');
      initCommand.generateConfigFile.mockRejectedValue(error);

      await expect(initCommand.run()).rejects.toThrow(VizzlyError);
      await expect(initCommand.run()).rejects.toThrow(
        'Failed to initialize Vizzly configuration'
      );
    });

    it('should handle missing options gracefully', async () => {
      await initCommand.run();

      expect(initCommand.fileExists).toHaveBeenCalled();
      expect(initCommand.generateConfigFile).toHaveBeenCalled();
    });
  });

  describe('generateConfigFile', () => {
    it('should write config file with correct content', async () => {
      const configPath = '/test/vizzly.config.js';
      fs.writeFile.mockResolvedValue();

      await initCommand.generateConfigFile(configPath);

      expect(fs.writeFile).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('export default {'),
        'utf8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('build:'),
        'utf8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('server:'),
        'utf8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('comparison:'),
        'utf8'
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('upload:'),
        'utf8'
      );
      // Ensure apiKey comment is NOT present
      expect(fs.writeFile).not.toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('apiKey'),
        'utf8'
      );
      // Ensure screenshotPath is NOT present
      expect(fs.writeFile).not.toHaveBeenCalledWith(
        configPath,
        expect.stringContaining('screenshotPath'),
        'utf8'
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        '📄 Created vizzly.config.js'
      );
    });

    it('should handle file write errors', async () => {
      const configPath = '/test/vizzly.config.js';
      const error = new Error('Write failed');
      fs.writeFile.mockRejectedValue(error);

      await expect(initCommand.generateConfigFile(configPath)).rejects.toThrow(
        'Write failed'
      );
    });
  });

  describe('showNextSteps', () => {
    it('should log next steps information', () => {
      initCommand.showNextSteps();

      expect(mockLogger.info).toHaveBeenCalledWith('\n📚 Next steps:');
      expect(mockLogger.info).toHaveBeenCalledWith('   1. Set your API token:');
      expect(mockLogger.info).toHaveBeenCalledWith(
        '      export VIZZLY_TOKEN="your-api-key"'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '   2. Run your tests with Vizzly:'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '      npx vizzly run "npm test"'
      );
      expect(mockLogger.info).toHaveBeenCalledWith('   3. Upload screenshots:');
      expect(mockLogger.info).toHaveBeenCalledWith(
        '      npx vizzly upload ./screenshots'
      );
    });
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      fs.access.mockResolvedValue();

      const result = await initCommand.fileExists('/test/file.js');

      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith('/test/file.js');
    });

    it('should return false when file does not exist', async () => {
      fs.access.mockRejectedValue(new Error('File not found'));

      const result = await initCommand.fileExists('/test/nonexistent.js');

      expect(result).toBe(false);
      expect(fs.access).toHaveBeenCalledWith('/test/nonexistent.js');
    });
  });
});

describe('createInitCommand', () => {
  it('should return a function that runs the init command', async () => {
    const testLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    const options = { logger: testLogger, force: true };

    vi.spyOn(InitCommand.prototype, 'run').mockResolvedValue();

    const commandFn = createInitCommand(options);

    expect(typeof commandFn).toBe('function');

    await commandFn();

    expect(InitCommand.prototype.run).toHaveBeenCalledWith(options);
  });
});

describe('init', () => {
  it('should create and run InitCommand with provided options', async () => {
    const options = { force: true };

    vi.spyOn(InitCommand.prototype, 'run').mockResolvedValue();

    await init(options);

    expect(InitCommand.prototype.run).toHaveBeenCalledWith(options);
  });

  it('should work with no options', async () => {
    vi.spyOn(InitCommand.prototype, 'run').mockResolvedValue();

    await init();

    expect(InitCommand.prototype.run).toHaveBeenCalledWith({});
  });
});
