import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import {
  createConfigContent,
  formatPluginConfig,
  formatValue,
  getInitConfigPath,
  init,
} from '../../src/commands/init.js';

let execFileAsync = promisify(execFile);

function createMockOutput() {
  let calls = [];
  return {
    calls,
    blank: () => calls.push({ method: 'blank', args: [] }),
    complete: message => calls.push({ method: 'complete', args: [message] }),
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    data: value => calls.push({ method: 'data', args: [value] }),
    header: command => calls.push({ method: 'header', args: [command] }),
    hint: message => calls.push({ method: 'hint', args: [message] }),
    labelValue: (label, value) =>
      calls.push({ method: 'labelValue', args: [label, value] }),
    list: (items, options) =>
      calls.push({ method: 'list', args: [items, options] }),
    warn: message => calls.push({ method: 'warn', args: [message] }),
  };
}

async function createTempProject() {
  return mkdtemp(path.join(tmpdir(), 'vizzly-init-test-'));
}

describe('commands/init', () => {
  describe('config helpers', () => {
    it('formats plugin config as valid object properties', () => {
      let pluginConfig = formatPluginConfig({
        name: 'custom',
        configSchema: {
          'api-token': "rob's-token",
          nested: {
            'branch-name': 'main',
            paths: ['screenshots', 'visuals'],
          },
        },
      });

      assert.match(pluginConfig, /'api-token': 'rob\\'s-token'/);
      assert.match(pluginConfig, /'branch-name': 'main'/);
      assert.match(pluginConfig, /paths: \[/);
    });

    it('escapes strings without changing supported scalar values', () => {
      assert.strictEqual(
        formatValue("rob's\\path\nnext"),
        "'rob\\'s\\\\path\\nnext'"
      );
      assert.strictEqual(formatValue(true), 'true');
      assert.strictEqual(formatValue(null), 'null');
      assert.strictEqual(formatValue([1, 'two']), "[\n  1,\n  'two'\n]");
    });

    it('creates config content with plugin sections', () => {
      let config = createConfigContent([
        {
          name: 'storybook',
          configSchema: {
            storybook: {
              url: 'http://localhost:6006',
            },
          },
        },
      ]);

      assert.match(config, /export default \{/);
      assert.match(config, /server: \{/);
      assert.match(config, /storybook plugin configuration/);
      assert.match(config, /url: 'http:\/\/localhost:6006'/);
      assert.match(config, /\n\};\n$/);
    });

    it('creates syntactically valid config when plugin keys need quoting', async () => {
      let cwd = await createTempProject();
      let configPath = path.join(cwd, 'vizzly.config.js');
      let config = createConfigContent([
        {
          name: 'custom',
          configSchema: {
            'api-token': "rob's-token",
          },
        },
      ]);

      await writeFile(configPath, config);

      let { NODE_V8_COVERAGE: _coverage, ...env } = process.env;
      await execFileAsync(process.execPath, ['--check', configPath], { env });

      assert.match(config, /'api-token': 'rob\\'s-token'/);
    });
  });

  describe('init', () => {
    it('creates a default config and prints human next steps', async () => {
      let cwd = await createTempProject();
      let output = createMockOutput();

      let result = await init(
        {
          plugins: [
            {
              name: 'storybook',
              configSchema: { storybook: { url: 'http://localhost:6006' } },
            },
          ],
        },
        {
          cwd: () => cwd,
          output,
        }
      );

      let configPath = getInitConfigPath(cwd);
      let config = await readFile(configPath, 'utf8');

      assert.deepStrictEqual(result, {
        status: 'created',
        configPath,
        plugins: ['storybook'],
      });
      assert.match(config, /Build \{timestamp\}/);
      assert.match(config, /minClusterSize: 2/);
      assert.match(config, /storybook plugin configuration/);
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'complete' &&
            call.args[0] === 'Created vizzly.config.js'
        )
      );
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'complete' &&
            call.args[0] === 'Vizzly CLI setup complete'
        )
      );
    });

    it('returns JSON output when config is created in JSON mode', async () => {
      let cwd = await createTempProject();
      let output = createMockOutput();

      await init(
        {
          json: true,
          plugins: [{ name: 'plain-plugin' }],
        },
        {
          cwd: () => cwd,
          output,
        }
      );

      let dataCall = output.calls.find(call => call.method === 'data');
      assert.deepStrictEqual(dataCall.args[0], {
        status: 'created',
        configPath: getInitConfigPath(cwd),
        plugins: [],
      });
      assert.ok(!output.calls.some(call => call.method === 'header'));
    });

    it('skips an existing config without overwriting it', async () => {
      let cwd = await createTempProject();
      let configPath = getInitConfigPath(cwd);
      let output = createMockOutput();

      await writeFile(configPath, 'export default { existing: true };\n');

      let result = await init(
        {
          plugins: [],
        },
        {
          cwd: () => cwd,
          output,
        }
      );

      let config = await readFile(configPath, 'utf8');

      assert.deepStrictEqual(result, { status: 'skipped', configPath });
      assert.strictEqual(config, 'export default { existing: true };\n');
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'warn' &&
            call.args[0] === 'A vizzly.config.js file already exists'
        )
      );
    });

    it('overwrites an existing config when forced', async () => {
      let cwd = await createTempProject();
      let configPath = getInitConfigPath(cwd);

      await writeFile(configPath, 'export default { existing: true };\n');

      let result = await init(
        {
          force: true,
          json: true,
          plugins: [],
        },
        {
          cwd: () => cwd,
          output: createMockOutput(),
        }
      );

      let config = await readFile(configPath, 'utf8');

      assert.strictEqual(result.status, 'created');
      assert.match(config, /server: \{/);
      assert.doesNotMatch(config, /existing: true/);
    });

    it('loads plugins from config when plugins are not provided', async () => {
      let cwd = await createTempProject();
      let output = createMockOutput();
      let loadedConfig = null;

      await init(
        { json: true, config: 'vizzly.config.js' },
        {
          cwd: () => cwd,
          loadConfig: async (configPath, defaults) => {
            loadedConfig = { configPath, defaults };
            return { apiUrl: 'https://api.example.test' };
          },
          loadPlugins: async (_configPath, config) => [
            {
              name: 'loaded',
              config,
              configSchema: { loaded: true },
            },
          ],
          output,
        }
      );

      let dataCall = output.calls.find(call => call.method === 'data');

      assert.deepStrictEqual(loadedConfig, {
        configPath: 'vizzly.config.js',
        defaults: {},
      });
      assert.deepStrictEqual(dataCall.args[0].plugins, ['loaded']);
    });
  });
});
