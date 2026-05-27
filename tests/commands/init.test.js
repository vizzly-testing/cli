import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import {
  createConfigContent,
  formatPluginConfig,
  formatValue,
  getInitConfigPath,
  getProjectAgentSkillPath,
  getProjectAgentsPath,
  init,
  installProjectAgentSkill,
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

    it('can add the agent skill when config already exists', async () => {
      let cwd = await createTempProject();
      let configPath = getInitConfigPath(cwd);
      let skillSourcePath = path.join(await createTempProject(), 'vizzly');
      let output = createMockOutput();

      await writeFile(configPath, 'export default { existing: true };\n');
      await mkdir(skillSourcePath, { recursive: true });
      await writeFile(
        path.join(skillSourcePath, 'SKILL.md'),
        '---\nname: vizzly\ndescription: Use Vizzly.\n---\n'
      );

      let result = await init(
        {
          agentSkill: true,
          plugins: [],
        },
        {
          cwd: () => cwd,
          output,
          skillSourcePath,
        }
      );

      let config = await readFile(configPath, 'utf8');
      let installedSkill = await readFile(
        path.join(getProjectAgentSkillPath(cwd), 'SKILL.md'),
        'utf8'
      );

      assert.deepStrictEqual(result, { status: 'skipped', configPath });
      assert.strictEqual(config, 'export default { existing: true };\n');
      assert.match(installedSkill, /name: vizzly/);
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'complete' &&
            call.args[0] === 'Added Vizzly agent skill'
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

    it('installs the repo-local agent skill when requested', async () => {
      let cwd = await createTempProject();
      let skillSourcePath = path.join(await createTempProject(), 'vizzly');
      let output = createMockOutput();

      await mkdir(skillSourcePath, { recursive: true });
      await writeFile(
        path.join(skillSourcePath, 'SKILL.md'),
        '---\nname: vizzly\ndescription: Use Vizzly.\n---\n'
      );

      let result = await init(
        {
          agentSkill: true,
          plugins: [],
        },
        {
          cwd: () => cwd,
          output,
          skillSourcePath,
        }
      );

      let installedSkill = await readFile(
        path.join(getProjectAgentSkillPath(cwd), 'SKILL.md'),
        'utf8'
      );

      assert.strictEqual(result.status, 'created');
      assert.match(installedSkill, /name: vizzly/);
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'complete' &&
            call.args[0] === 'Added Vizzly agent skill'
        )
      );
    });

    it('adds project AGENTS.md guidance when requested', async () => {
      let cwd = await createTempProject();
      let skillSourcePath = path.join(await createTempProject(), 'vizzly');
      let output = createMockOutput();

      await mkdir(skillSourcePath, { recursive: true });
      await writeFile(
        path.join(skillSourcePath, 'SKILL.md'),
        '---\nname: vizzly\ndescription: Use Vizzly.\n---\n'
      );

      let result = await init(
        {
          agentGuidance: true,
          plugins: [],
        },
        {
          cwd: () => cwd,
          output,
          skillSourcePath,
        }
      );

      let installedSkill = await readFile(
        path.join(getProjectAgentSkillPath(cwd), 'SKILL.md'),
        'utf8'
      );
      let agentsContent = await readFile(getProjectAgentsPath(cwd), 'utf8');

      assert.strictEqual(result.status, 'created');
      assert.match(installedSkill, /name: vizzly/);
      assert.match(agentsContent, /Visual Testing With Vizzly/);
      assert.match(
        agentsContent,
        /npx vizzly context build current --source local --agent/
      );
      assert.match(
        agentsContent,
        /npx vizzly tdd run "<test command>" --no-open/
      );
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'complete' &&
            call.args[0] === 'Created AGENTS.md with Vizzly guidance'
        )
      );
    });

    it('appends project AGENTS.md guidance without duplicating it', async () => {
      let cwd = await createTempProject();
      let skillSourcePath = path.join(await createTempProject(), 'vizzly');
      let agentsPath = getProjectAgentsPath(cwd);

      await mkdir(skillSourcePath, { recursive: true });
      await writeFile(
        path.join(skillSourcePath, 'SKILL.md'),
        '---\nname: vizzly\ndescription: Use Vizzly.\n---\n'
      );
      await writeFile(agentsPath, '# Repo Guidance\n\nKeep existing notes.\n');

      await init(
        {
          agentGuidance: true,
          plugins: [],
        },
        {
          cwd: () => cwd,
          output: createMockOutput(),
          skillSourcePath,
        }
      );
      await init(
        {
          agentGuidance: true,
          force: true,
          plugins: [],
        },
        {
          cwd: () => cwd,
          output: createMockOutput(),
          skillSourcePath,
        }
      );

      let agentsContent = await readFile(agentsPath, 'utf8');
      let guidanceCount =
        agentsContent.split('Visual Testing With Vizzly').length - 1;

      assert.match(agentsContent, /# Repo Guidance/);
      assert.match(agentsContent, /Keep existing notes/);
      assert.strictEqual(guidanceCount, 1);
    });

    it('can add AGENTS.md guidance when config already exists', async () => {
      let cwd = await createTempProject();
      let configPath = getInitConfigPath(cwd);
      let skillSourcePath = path.join(await createTempProject(), 'vizzly');
      let output = createMockOutput();

      await writeFile(configPath, 'export default { existing: true };\n');
      await mkdir(skillSourcePath, { recursive: true });
      await writeFile(
        path.join(skillSourcePath, 'SKILL.md'),
        '---\nname: vizzly\ndescription: Use Vizzly.\n---\n'
      );

      let result = await init(
        {
          agentGuidance: true,
          plugins: [],
        },
        {
          cwd: () => cwd,
          output,
          skillSourcePath,
        }
      );

      let config = await readFile(configPath, 'utf8');
      let agentsContent = await readFile(getProjectAgentsPath(cwd), 'utf8');

      assert.deepStrictEqual(result, { status: 'skipped', configPath });
      assert.strictEqual(config, 'export default { existing: true };\n');
      assert.match(agentsContent, /Visual Testing With Vizzly/);
      assert.ok(
        output.calls.some(
          call =>
            call.method === 'complete' &&
            call.args[0] === 'Created AGENTS.md with Vizzly guidance'
        )
      );
    });

    it('prompts for the agent skill in interactive init', async () => {
      let cwd = await createTempProject();
      let skillSourcePath = path.join(await createTempProject(), 'vizzly');
      let prompted = false;

      await mkdir(skillSourcePath, { recursive: true });
      await writeFile(
        path.join(skillSourcePath, 'SKILL.md'),
        '---\nname: vizzly\ndescription: Use Vizzly.\n---\n'
      );

      await init(
        {
          plugins: [],
        },
        {
          cwd: () => cwd,
          output: createMockOutput(),
          skillSourcePath,
          isInteractive: () => true,
          promptAgentSkill: async () => {
            prompted = true;
            return true;
          },
        }
      );

      assert.strictEqual(prompted, true);
      let installedSkill = await readFile(
        path.join(getProjectAgentSkillPath(cwd), 'SKILL.md'),
        'utf8'
      );
      assert.match(installedSkill, /name: vizzly/);
    });

    it('does not overwrite an existing repo-local agent skill', async () => {
      let cwd = await createTempProject();
      let skillSourcePath = path.join(await createTempProject(), 'vizzly');
      let targetPath = getProjectAgentSkillPath(cwd);

      await mkdir(skillSourcePath, { recursive: true });
      await mkdir(targetPath, { recursive: true });
      await writeFile(
        path.join(skillSourcePath, 'SKILL.md'),
        '---\nname: vizzly\ndescription: Packaged.\n---\n'
      );
      await writeFile(path.join(targetPath, 'SKILL.md'), 'local skill\n');

      let result = await installProjectAgentSkill({
        cwd,
        sourcePath: skillSourcePath,
      });
      let existingSkill = await readFile(
        path.join(targetPath, 'SKILL.md'),
        'utf8'
      );

      assert.strictEqual(result.status, 'exists');
      assert.strictEqual(existingSkill, 'local skill\n');
    });
  });
});
