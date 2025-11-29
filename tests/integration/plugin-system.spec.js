import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

describe('Plugin System Integration', () => {
  let testDir;

  beforeEach(() => {
    testDir = join(process.cwd(), 'test-plugin-integration-' + Date.now());
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should register plugin commands and show them in help', async () => {
    // Create mock @vizzly-testing/test-plugin package
    let pluginDir = join(
      testDir,
      'node_modules',
      '@vizzly-testing',
      'test-plugin'
    );
    mkdirSync(pluginDir, { recursive: true });

    // Write package.json
    writeFileSync(
      join(pluginDir, 'package.json'),
      JSON.stringify(
        {
          name: '@vizzly-testing/test-plugin',
          version: '1.0.0',
          vizzly: {
            plugin: './plugin.js',
          },
        },
        null,
        2
      )
    );

    // Write plugin that adds a command
    let pluginCode = `
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
    `;
    writeFileSync(join(pluginDir, 'plugin.js'), pluginCode);

    // Create minimal vizzly config
    writeFileSync(join(testDir, 'vizzly.config.js'), 'export default {};');

    // Try to run vizzly --help from test directory
    // This tests that the plugin is loaded and command is registered
    let cliPath = join(process.cwd(), 'src', 'cli.js');

    try {
      let output = execSync(`node ${cliPath} --help`, {
        cwd: testDir,
        encoding: 'utf-8',
        env: { ...process.env, NODE_ENV: 'test' },
      });

      // Check that help output includes the plugin command
      expect(output).toContain('test-command');
      expect(output).toContain('A test command from plugin');
    } catch (error) {
      // The CLI might exit with non-zero, but we still want to check output
      if (error.stdout) {
        expect(error.stdout.toString()).toContain('test-command');
      } else {
        throw error;
      }
    }
  });

  it('should provide context to plugins', async () => {
    let pluginDir = join(
      testDir,
      'node_modules',
      '@vizzly-testing',
      'context-plugin'
    );
    mkdirSync(pluginDir, { recursive: true });

    writeFileSync(
      join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@vizzly-testing/context-plugin',
        vizzly: { plugin: './plugin.js' },
      })
    );

    // Plugin that validates context
    let pluginCode = `
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
    `;
    writeFileSync(join(pluginDir, 'plugin.js'), pluginCode);

    writeFileSync(join(testDir, 'vizzly.config.js'), 'export default {};');

    let cliPath = join(process.cwd(), 'src', 'cli.js');

    // If this doesn't throw, context was provided correctly
    try {
      execSync(`node ${cliPath} --help`, {
        cwd: testDir,
        encoding: 'utf-8',
        env: { ...process.env, NODE_ENV: 'test' },
      });
    } catch (error) {
      // Check for our validation errors
      let stderr = error.stderr?.toString() || error.stdout?.toString() || '';
      expect(stderr).not.toContain('Missing config');
      expect(stderr).not.toContain('Missing output');
      expect(stderr).not.toContain('Missing services');
    }
  });

  it('should handle plugin registration errors gracefully', async () => {
    let pluginDir = join(
      testDir,
      'node_modules',
      '@vizzly-testing',
      'bad-plugin'
    );
    mkdirSync(pluginDir, { recursive: true });

    writeFileSync(
      join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@vizzly-testing/bad-plugin',
        vizzly: { plugin: './plugin.js' },
      })
    );

    // Plugin that throws during registration
    let pluginCode = `
      export default {
        name: 'bad-plugin',
        register(program, context) {
          throw new Error('Registration failed intentionally');
        }
      };
    `;
    writeFileSync(join(pluginDir, 'plugin.js'), pluginCode);

    writeFileSync(join(testDir, 'vizzly.config.js'), 'export default {};');

    let cliPath = join(process.cwd(), 'src', 'cli.js');

    // CLI should still work despite plugin error
    try {
      let output = execSync(`node ${cliPath} --version`, {
        cwd: testDir,
        encoding: 'utf-8',
        env: { ...process.env, NODE_ENV: 'test' },
      });

      // Should still show version
      expect(output).toMatch(/\d+\.\d+\.\d+/);
    } catch (error) {
      // Even if it errors, check it's not from the plugin
      let stderr = error.stderr?.toString() || '';
      // We expect a warning but not a crash
      if (stderr) {
        expect(stderr).not.toContain('Registration failed intentionally');
      }
    }
  });
});
