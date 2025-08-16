import { describe, it, expect, vi } from 'vitest';

describe('CLI Module Import', () => {
  it('should import cli.js without errors', async () => {
    // This test ensures the CLI module can be imported, which exercises the module-level code
    // that sets up Commander.js commands and options

    // Mock process.argv to prevent CLI from actually running
    const originalArgv = process.argv;
    const originalExit = process.exit;

    // Mock process.exit to prevent test from terminating
    process.exit = vi.fn();

    // Set argv to just show help (non-destructive)
    process.argv = ['node', 'cli.js', '--help'];

    try {
      // Import the CLI module - this will execute the module-level code
      await import('../../src/cli.js');

      // If we get here, the import succeeded
      expect(true).toBe(true);
    } catch (error) {
      // CLI might exit with help, that's ok
      if (
        error.message?.includes('help') ||
        process.exit.mock?.calls?.length > 0
      ) {
        expect(true).toBe(true);
      } else {
        throw error;
      }
    } finally {
      // Restore original values
      process.argv = originalArgv;
      process.exit = originalExit;
    }
  });

  it('should import index.js without errors', async () => {
    // This test ensures the main index module can be imported
    const indexModule = await import('../../src/index.js');

    // Verify key exports are available
    expect(indexModule.createVizzly).toBeDefined();
    expect(indexModule.vizzlyScreenshot).toBeDefined();
    expect(indexModule.configure).toBeDefined();
    expect(indexModule.createUploader).toBeDefined();
    expect(indexModule.loadConfig).toBeDefined();
  });
});
