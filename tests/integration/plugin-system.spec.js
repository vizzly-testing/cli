/**
 * Plugin System Integration Tests
 *
 * Tests the plugin discovery and registration system.
 * Uses a shared temp directory to reduce filesystem churn.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCLIRunner } from '../helpers/cli-runner.js';

describe('Plugin System Integration', () => {
  let baseDir;
  let cli;

  beforeAll(() => {
    // Create ONE temp directory for all tests
    baseDir = mkdtempSync(join(tmpdir(), 'vizzly-plugin-test-'));
    cli = createCLIRunner(baseDir);
  });

  afterAll(() => {
    try {
      rmSync(baseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper to create a test plugin in node_modules
   */
  function createPlugin(name, pluginCode, packageJsonExtras = {}) {
    let pluginDir = join(baseDir, 'node_modules', '@vizzly-testing', name);
    mkdirSync(pluginDir, { recursive: true });

    writeFileSync(
      join(pluginDir, 'package.json'),
      JSON.stringify({
        name: `@vizzly-testing/${name}`,
        version: '1.0.0',
        vizzly: { plugin: './plugin.js' },
        ...packageJsonExtras,
      })
    );

    writeFileSync(join(pluginDir, 'plugin.js'), pluginCode);
    return pluginDir;
  }

  /**
   * Helper to create a vizzly config file
   */
  function createConfig(content = 'export default {};') {
    writeFileSync(join(baseDir, 'vizzly.config.js'), content);
  }

  it('registers plugin commands and shows them in help', async () => {
    createPlugin(
      'test-plugin',
      `
      export default {
        name: 'test-plugin',
        version: '1.0.0',
        register(program, context) {
          program
            .command('test-command')
            .description('A test command from plugin')
            .action(() => {
              console.log('Test command executed');
            });
        }
      };
    `
    );
    createConfig();

    let result = await cli.run(['--help']);

    // Plugin command should appear in help output
    expect(result.stdout).toContain('test-command');
    expect(result.stdout).toContain('A test command from plugin');
  });

  it('provides context to plugins', async () => {
    createPlugin(
      'context-plugin',
      `
      export default {
        name: 'context-plugin',
        register(program, context) {
          if (!context.config) throw new Error('Missing config');
          if (!context.output) throw new Error('Missing output');
          if (!context.services) throw new Error('Missing services');

          program
            .command('context-test')
            .action(() => {
              console.log('Context validated');
            });
        }
      };
    `
    );
    createConfig();

    let result = await cli.run(['--help']);

    // If context validation failed, we'd see the error in stderr
    expect(result.stderr).not.toContain('Missing config');
    expect(result.stderr).not.toContain('Missing output');
    expect(result.stderr).not.toContain('Missing services');
  });

  it('handles plugin registration errors gracefully', async () => {
    createPlugin(
      'bad-plugin',
      `
      export default {
        name: 'bad-plugin',
        register(program, context) {
          throw new Error('Registration failed intentionally');
        }
      };
    `
    );
    createConfig();

    let result = await cli.run(['--version']);

    // CLI should still work despite plugin error
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    // Plugin error should be warned but not crash
    expect(result.stderr).toContain('Failed to register plugin');
    expect(result.stderr).toContain('bad-plugin');
  });
});
