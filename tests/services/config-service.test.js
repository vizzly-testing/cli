import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createConfigService } from '../../src/services/config-service.js';

/**
 * Create a unique temporary directory for each test
 */
function createTempDir() {
  let dir = join(
    tmpdir(),
    `vizzly-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Clean up temp directory
 */
function cleanupTempDir(dir) {
  try {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

describe('services/config-service', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
    // Clear any environment variables that might affect tests
    delete process.env.VIZZLY_THRESHOLD;
    delete process.env.VIZZLY_MIN_CLUSTER_SIZE;
    delete process.env.VIZZLY_PORT;
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    // Clean up environment variables after each test
    delete process.env.VIZZLY_THRESHOLD;
    delete process.env.VIZZLY_MIN_CLUSTER_SIZE;
    delete process.env.VIZZLY_PORT;
    delete process.env.VIZZLY_HOME;
  });

  describe('createConfigService', () => {
    it('creates a config service with all methods', () => {
      let service = createConfigService({ workingDir: tempDir });

      assert.ok(service.getConfig, 'Should have getConfig method');
      assert.ok(service.updateConfig, 'Should have updateConfig method');
      assert.ok(service.validateConfig, 'Should have validateConfig method');
    });
  });

  describe('getConfig - merged', () => {
    it('returns default config when no config files exist', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let { config } = await service.getConfig('merged');

      assert.strictEqual(config.comparison.threshold, 2.0);
      assert.strictEqual(config.server.port, 47392);
      assert.strictEqual(config.server.timeout, 30000);
    });

    it('merges project config over defaults', async () => {
      // Create a vizzly.config.js in temp dir
      writeFileSync(
        join(tempDir, 'vizzly.config.js'),
        `export default { comparison: { threshold: 5.0 } };`
      );

      let service = createConfigService({ workingDir: tempDir });
      let { config, sources } = await service.getConfig('merged');

      assert.strictEqual(config.comparison.threshold, 5.0);
      assert.strictEqual(sources.threshold, 'project');
    });

    it('applies VIZZLY_MIN_CLUSTER_SIZE env var override', async () => {
      process.env.VIZZLY_MIN_CLUSTER_SIZE = '10';

      let service = createConfigService({ workingDir: tempDir });
      let { config, sources } = await service.getConfig('merged');

      assert.strictEqual(config.comparison.minClusterSize, 10);
      assert.strictEqual(sources.comparison, 'env');
    });

    it('env var overrides project config for minClusterSize', async () => {
      // Create project config with minClusterSize
      writeFileSync(
        join(tempDir, 'vizzly.config.js'),
        `export default { comparison: { minClusterSize: 3 } };`
      );

      // Env var should win
      process.env.VIZZLY_MIN_CLUSTER_SIZE = '8';

      let service = createConfigService({ workingDir: tempDir });
      let { config } = await service.getConfig('merged');

      assert.strictEqual(config.comparison.minClusterSize, 8);
    });
  });

  describe('getConfig - project', () => {
    it('returns empty config when no project config exists', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let { config, path } = await service.getConfig('project');

      assert.deepStrictEqual(config, {});
      assert.strictEqual(path, null);
    });

    it('returns project config when it exists', async () => {
      writeFileSync(
        join(tempDir, 'vizzly.config.js'),
        `export default { server: { port: 9999 } };`
      );

      let service = createConfigService({ workingDir: tempDir });
      let { config, path } = await service.getConfig('project');

      assert.strictEqual(config.server.port, 9999);
      assert.ok(path.endsWith('vizzly.config.js'));
    });
  });

  describe('getConfig - global', () => {
    it('returns global config path', async () => {
      // Use isolated VIZZLY_HOME for this test
      let vizzlyHome = join(tempDir, '.vizzly-home');
      mkdirSync(vizzlyHome, { recursive: true });
      process.env.VIZZLY_HOME = vizzlyHome;

      let service = createConfigService({ workingDir: tempDir });
      let { path } = await service.getConfig('global');

      assert.ok(path.includes('config.json'));
    });
  });

  describe('getConfig - invalid type', () => {
    it('throws for unknown config type', async () => {
      let service = createConfigService({ workingDir: tempDir });

      await assert.rejects(
        () => service.getConfig('invalid'),
        /Unknown config type/
      );
    });
  });

  describe('updateConfig - project', () => {
    it('creates new project config file when none exists', async () => {
      let service = createConfigService({ workingDir: tempDir });

      await service.updateConfig('project', { comparison: { threshold: 4.0 } });

      let configPath = join(tempDir, 'vizzly.config.js');
      assert.ok(existsSync(configPath), 'Should create config file');

      let content = readFileSync(configPath, 'utf8');
      assert.ok(content.includes('defineConfig'), 'Should use defineConfig');
      assert.ok(content.includes('4'), 'Should include threshold value');
    });

    it('updates existing project config', async () => {
      // Create initial config
      writeFileSync(
        join(tempDir, 'vizzly.config.js'),
        `export default { comparison: { threshold: 2.0 }, server: { port: 3000 } };`
      );

      let service = createConfigService({ workingDir: tempDir });
      await service.updateConfig('project', { comparison: { threshold: 6.0 } });

      // Read the file directly to verify write (cosmiconfig may cache)
      let content = readFileSync(join(tempDir, 'vizzly.config.js'), 'utf8');
      assert.ok(content.includes('6'), 'Should have updated threshold');
      assert.ok(content.includes('3000'), 'Should preserve port');
    });

    it('returns success result with path', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.updateConfig('project', {
        tdd: { openReport: true },
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.path.includes('vizzly.config'));
    });
  });

  describe('updateConfig - global', () => {
    it('updates global config settings', async () => {
      // Use isolated VIZZLY_HOME for this test
      let vizzlyHome = join(tempDir, '.vizzly-home');
      mkdirSync(vizzlyHome, { recursive: true });
      process.env.VIZZLY_HOME = vizzlyHome;

      let service = createConfigService({ workingDir: tempDir });

      let result = await service.updateConfig('global', {
        server: { port: 7777 },
      });

      assert.strictEqual(result.success, true);

      // Verify the config was saved
      let { config } = await service.getConfig('global');
      assert.strictEqual(config.server.port, 7777);
    });

    it('merges with existing global config', async () => {
      // Use isolated VIZZLY_HOME
      let vizzlyHome = join(tempDir, '.vizzly-home');
      mkdirSync(vizzlyHome, { recursive: true });
      process.env.VIZZLY_HOME = vizzlyHome;

      // Create initial global config
      writeFileSync(
        join(vizzlyHome, 'config.json'),
        JSON.stringify({ settings: { comparison: { threshold: 1.0 } } })
      );

      let service = createConfigService({ workingDir: tempDir });
      await service.updateConfig('global', { server: { port: 8888 } });

      let { config } = await service.getConfig('global');
      assert.strictEqual(config.comparison.threshold, 1.0);
      assert.strictEqual(config.server.port, 8888);
    });
  });

  describe('updateConfig - invalid type', () => {
    it('throws for invalid update type', async () => {
      let service = createConfigService({ workingDir: tempDir });

      await assert.rejects(
        () => service.updateConfig('merged', {}),
        /Cannot update config type/
      );
    });
  });

  describe('validateConfig', () => {
    it('validates correct config', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.validateConfig({
        comparison: { threshold: 5.0 },
        server: { port: 8080, timeout: 10000 },
      });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('returns error for negative threshold', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.validateConfig({
        comparison: { threshold: -1 },
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('threshold')));
    });

    it('returns error for non-number threshold', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.validateConfig({
        comparison: { threshold: 'high' },
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('threshold')));
    });

    it('returns warning for very high threshold', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.validateConfig({
        comparison: { threshold: 150 },
      });

      assert.strictEqual(result.valid, true);
      assert.ok(result.warnings.some(w => w.includes('100')));
    });

    it('returns error for invalid port', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.validateConfig({
        server: { port: 70000 },
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('port')));
    });

    it('returns error for non-integer port', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.validateConfig({
        server: { port: 8080.5 },
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('port')));
    });

    it('returns warning for privileged port', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.validateConfig({
        server: { port: 80 },
      });

      assert.strictEqual(result.valid, true);
      assert.ok(result.warnings.some(w => w.includes('1024')));
    });

    it('returns error for negative timeout', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.validateConfig({
        server: { timeout: -1000 },
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('timeout')));
    });

    it('returns error for non-integer timeout', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.validateConfig({
        server: { timeout: 'slow' },
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('timeout')));
    });

    it('returns error for non-integer minClusterSize', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.validateConfig({
        comparison: { minClusterSize: 3.5 },
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('minClusterSize')));
    });

    it('returns error for zero or negative minClusterSize', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.validateConfig({
        comparison: { minClusterSize: 0 },
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('minClusterSize')));
    });

    it('returns warning for very high minClusterSize', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.validateConfig({
        comparison: { minClusterSize: 150 },
      });

      assert.strictEqual(result.valid, true);
      assert.ok(result.warnings.some(w => w.includes('100')));
    });

    it('validates valid minClusterSize', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.validateConfig({
        comparison: { minClusterSize: 5 },
      });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('validates empty config as valid', async () => {
      let service = createConfigService({ workingDir: tempDir });

      let result = await service.validateConfig({});

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });
  });

  describe('config merging', () => {
    it('deep merges nested objects', async () => {
      writeFileSync(
        join(tempDir, 'vizzly.config.js'),
        `export default {
          comparison: { threshold: 3.0, minClusterSize: 5 },
          server: { port: 9000 }
        };`
      );

      let service = createConfigService({ workingDir: tempDir });
      let { config } = await service.getConfig('merged');

      // Should have values from both default and project
      assert.strictEqual(config.comparison.threshold, 3.0);
      assert.strictEqual(config.comparison.minClusterSize, 5);
      assert.strictEqual(config.server.port, 9000);
      assert.strictEqual(config.server.timeout, 30000); // Default
    });
  });

  describe('config with defineConfig wrapper', () => {
    it('handles config with default export', async () => {
      writeFileSync(
        join(tempDir, 'vizzly.config.js'),
        `export default { comparison: { threshold: 8.0 } };`
      );

      let service = createConfigService({ workingDir: tempDir });
      let { config } = await service.getConfig('merged');

      assert.strictEqual(config.comparison.threshold, 8.0);
    });
  });
});
