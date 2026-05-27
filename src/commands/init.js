#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { VizzlyError } from '../errors/vizzly-error.js';
import { loadPlugins } from '../plugin-loader.js';
import { loadConfig } from '../utils/config-loader.js';
import * as output from '../utils/output.js';

let commandDir = path.dirname(fileURLToPath(import.meta.url));

let configValueSchema = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(configValueSchema),
    z.record(z.string(), configValueSchema),
  ])
);
let configSchemaValidator = z.record(z.string(), configValueSchema);

function createInitDeps(deps = {}) {
  return {
    access: deps.access || fs.access,
    copy: deps.copy || fs.cp,
    cwd: deps.cwd || (() => process.cwd()),
    isInteractive:
      deps.isInteractive ||
      (() => Boolean(process.stdin.isTTY && process.stdout.isTTY)),
    loadConfig: deps.loadConfig || loadConfig,
    loadPlugins: deps.loadPlugins || loadPlugins,
    mkdir: deps.mkdir || fs.mkdir,
    output: deps.output || output,
    promptAgentSkill: deps.promptAgentSkill || promptAgentSkill,
    readFile: deps.readFile || fs.readFile,
    skillSourcePath: deps.skillSourcePath || getPackagedAgentSkillPath(),
    writeFile: deps.writeFile || fs.writeFile,
  };
}

function configureOutput(output, options) {
  output.configure({
    json: options.json || false,
    verbose: options.verbose || false,
    color: options.color !== false,
  });
}

export function getInitConfigPath(cwd = process.cwd()) {
  return path.join(cwd, 'vizzly.config.js');
}

export function getPackagedAgentSkillPath(baseDir = commandDir) {
  return path.resolve(baseDir, '..', '..', 'skills', 'vizzly');
}

export function getProjectAgentSkillPath(cwd = process.cwd()) {
  return path.join(cwd, '.agents', 'skills', 'vizzly');
}

export function getProjectAgentsPath(cwd = process.cwd()) {
  return path.join(cwd, 'AGENTS.md');
}

export async function fileExists(filePath, access = fs.access) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function getPluginsWithConfig(plugins = []) {
  return plugins.filter(plugin => plugin.configSchema);
}

export function getPluginConfigNames(plugins = []) {
  return getPluginsWithConfig(plugins).map(plugin => plugin.name);
}

function formatObjectKey(key) {
  if (/^[A-Za-z_$][\w$]*$/.test(key)) {
    return key;
  }

  return formatValue(key);
}

export function formatValue(value, depth = 0) {
  let indent = '  '.repeat(depth);
  let nextIndent = '  '.repeat(depth + 1);

  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') {
    return `'${value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')}'`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';

    let items = value.map(item => {
      let formatted = formatValue(item, depth + 1);
      return `${nextIndent}${formatted}`;
    });

    return `[\n${items.join(',\n')}\n${indent}]`;
  }

  if (typeof value === 'object') {
    let entries = Object.entries(value);
    if (entries.length === 0) return '{}';

    let props = entries.map(([key, entryValue]) => {
      let formatted = formatValue(entryValue, depth + 1);
      return `${nextIndent}${formatObjectKey(key)}: ${formatted}`;
    });

    return `{\n${props.join(',\n')}\n${indent}}`;
  }

  return String(value);
}

export function formatPluginConfig(plugin, output = null) {
  try {
    configSchemaValidator.parse(plugin.configSchema);

    let configEntries = [];

    for (let [key, value] of Object.entries(plugin.configSchema)) {
      let formattedValue = formatValue(value, 1);
      configEntries.push(
        `  // ${plugin.name} plugin configuration\n  ${formatObjectKey(key)}: ${formattedValue}`
      );
    }

    return configEntries.join(',\n\n');
  } catch (error) {
    if (error instanceof z.ZodError) {
      let messages = error.issues.map(
        zodError => `${zodError.path.join('.')}: ${zodError.message}`
      );
      output?.warn(
        `Invalid config schema for plugin ${plugin.name}: ${messages.join(', ')}`
      );
    } else {
      output?.warn(
        `Failed to format config for plugin ${plugin.name}: ${error.message}`
      );
    }
    return '';
  }
}

export function generatePluginConfigs(plugins = [], output = null) {
  let sections = [];

  for (let plugin of plugins) {
    if (plugin.configSchema) {
      let configStr = formatPluginConfig(plugin, output);
      if (configStr) {
        sections.push(configStr);
      }
    }
  }

  return sections.length > 0 ? sections.join(',\n\n') : '';
}

export function createConfigContent(plugins = [], output = null) {
  let coreConfig = `export default {
  // Server configuration (for run command)
  server: {
    port: 47392,
    timeout: 30000
  },

  // Build configuration
  build: {
    name: 'Build {timestamp}',
    environment: 'test'
  },

  // Upload configuration (for upload command)
  upload: {
    screenshotsDir: './screenshots',
    batchSize: 10,
    timeout: 30000
  },

  // Comparison configuration (CIEDE2000 Delta E: 0=exact, 1=JND, 2=recommended)
  comparison: {
    threshold: 2.0,
    minClusterSize: 2
  },

  // TDD configuration
  tdd: {
    openReport: false // Whether to auto-open HTML report in browser
  }`;

  let pluginConfigs = generatePluginConfigs(plugins, output);
  if (pluginConfigs) {
    coreConfig += `,\n\n${pluginConfigs}`;
  }

  return `${coreConfig}\n};\n`;
}

function writeHumanCreatedOutput(output, plugins) {
  output.header('init');
  output.complete('Created vizzly.config.js');

  let pluginsWithConfig = getPluginsWithConfig(plugins);
  if (pluginsWithConfig.length > 0) {
    output.hint(`Added config for ${pluginsWithConfig.length} plugin(s):`);
    output.list(
      pluginsWithConfig.map(plugin => plugin.name),
      { indent: 4 }
    );
  }
}

function showNextSteps(output) {
  output.blank();
  output.labelValue('Next steps', '');
  output.list([
    'Set your API token: export VIZZLY_TOKEN="your-api-key"',
    'Run your tests with Vizzly: pnpm exec vizzly run "pnpm test"',
    'Upload screenshots: pnpm exec vizzly upload ./screenshots',
  ]);
}

async function promptAgentSkill({
  stdin = process.stdin,
  stdout = process.stdout,
} = {}) {
  let rl = createInterface({ input: stdin, output: stdout });

  try {
    let answer = await rl.question(
      'Add the Vizzly agent skill to this repo? [Y/n] '
    );
    return !['n', 'no'].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

async function shouldInstallAgentSkill(options, deps) {
  if (options.agentGuidance) {
    return true;
  }

  if (options.skipAgentSkill) {
    return false;
  }

  if (options.agentSkill) {
    return true;
  }

  if (options.json || !deps.isInteractive()) {
    return false;
  }

  return await deps.promptAgentSkill();
}

let agentGuidanceStart = '<!-- vizzly-agent-guidance -->';
let agentGuidanceEnd = '<!-- /vizzly-agent-guidance -->';

export function createAgentGuidanceContent() {
  return `${agentGuidanceStart}
## Visual Testing With Vizzly

Use Vizzly for user-facing UI changes when this repo has Vizzly configured.

- Read visual history before changing UI: \`npx vizzly context build current --source local --agent\`
- Inspect named screenshot history when useful: \`npx vizzly context screenshot "<screenshot-name>" --source local --json\`
- Verify visual changes through the existing user workflow that owns the surface: \`npx vizzly tdd run "<test command>" --no-open\`

Prefer existing E2E/user journeys over narrow screenshot-only specs. Treat Vizzly diffs as review evidence; do not approve or reject changes unless asked.
${agentGuidanceEnd}
`;
}

function appendSection(content, section) {
  if (!content.trim()) {
    return section;
  }

  return `${content.replace(/\s*$/, '')}\n\n${section}`;
}

export async function upsertProjectAgentGuidance({
  cwd,
  access = fs.access,
  readFile = fs.readFile,
  writeFile = fs.writeFile,
}) {
  let agentsPath = getProjectAgentsPath(cwd);
  let guidance = createAgentGuidanceContent();

  if (!(await fileExists(agentsPath, access))) {
    await writeFile(agentsPath, guidance, 'utf8');
    return {
      status: 'created',
      agentsPath,
    };
  }

  let existingContent = await readFile(agentsPath, 'utf8');
  if (existingContent.includes(agentGuidanceStart)) {
    return {
      status: 'exists',
      agentsPath,
    };
  }

  await writeFile(agentsPath, appendSection(existingContent, guidance), 'utf8');
  return {
    status: 'updated',
    agentsPath,
  };
}

export async function installProjectAgentSkill({
  cwd,
  sourcePath,
  access = fs.access,
  copy = fs.cp,
  mkdir = fs.mkdir,
}) {
  let targetPath = getProjectAgentSkillPath(cwd);

  if (!(await fileExists(path.join(sourcePath, 'SKILL.md'), access))) {
    return {
      status: 'missing-source',
      sourcePath,
      targetPath,
    };
  }

  if (await fileExists(targetPath, access)) {
    return {
      status: 'exists',
      sourcePath,
      targetPath,
    };
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await copy(sourcePath, targetPath, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });

  return {
    status: 'installed',
    sourcePath,
    targetPath,
  };
}

function writeAgentSkillOutput(output, result) {
  if (!result) {
    return;
  }

  if (result.status === 'installed') {
    output.complete('Added Vizzly agent skill');
    output.hint(`Installed at ${result.targetPath}`);
    return;
  }

  if (result.status === 'exists') {
    output.hint('Vizzly agent skill already exists in this repo');
    return;
  }

  if (result.status === 'missing-source') {
    output.warn('Vizzly agent skill was not found in this CLI package');
  }
}

function writeAgentGuidanceOutput(output, result) {
  if (!result) {
    return;
  }

  if (result.status === 'created') {
    output.complete('Created AGENTS.md with Vizzly guidance');
    output.hint(`Wrote ${result.agentsPath}`);
    return;
  }

  if (result.status === 'updated') {
    output.complete('Added Vizzly guidance to AGENTS.md');
    output.hint(`Updated ${result.agentsPath}`);
    return;
  }

  if (result.status === 'exists') {
    output.hint('Vizzly guidance already exists in AGENTS.md');
  }
}

function withAgentSetupResults(
  payload,
  { agentSkillResult, agentGuidanceResult }
) {
  if (agentSkillResult) {
    payload.agentSkill = agentSkillResult;
  }
  if (agentGuidanceResult) {
    payload.agentGuidance = agentGuidanceResult;
  }

  return payload;
}

async function writeConfigFile({
  configPath,
  plugins,
  options,
  output,
  writeFile,
}) {
  let coreConfig = createConfigContent(plugins, output);

  await writeFile(configPath, coreConfig, 'utf8');

  if (!options.json) {
    writeHumanCreatedOutput(output, plugins);
  }
}

async function loadInitPlugins(options, deps) {
  if (options.plugins) {
    return options.plugins;
  }

  try {
    let config = await deps.loadConfig(options.config, {});
    return await deps.loadPlugins(options.config, config, null);
  } catch {
    return [];
  }
}

// Export factory function for CLI
export function createInitCommand(options) {
  return () => init(options);
}

export async function init(options = {}, deps = {}) {
  let resolvedDeps = createInitDeps(deps);

  configureOutput(resolvedDeps.output, options);

  let plugins = await loadInitPlugins(options, resolvedDeps);
  let configPath = getInitConfigPath(resolvedDeps.cwd());
  let hasConfig = await fileExists(configPath, resolvedDeps.access);
  let agentSkillResult = null;
  let agentGuidanceResult = null;

  if (await shouldInstallAgentSkill(options, resolvedDeps)) {
    agentSkillResult = await installProjectAgentSkill({
      cwd: resolvedDeps.cwd(),
      sourcePath: resolvedDeps.skillSourcePath,
      access: resolvedDeps.access,
      copy: resolvedDeps.copy,
      mkdir: resolvedDeps.mkdir,
    });
  }

  if (options.agentGuidance) {
    agentGuidanceResult = await upsertProjectAgentGuidance({
      cwd: resolvedDeps.cwd(),
      access: resolvedDeps.access,
      readFile: resolvedDeps.readFile,
      writeFile: resolvedDeps.writeFile,
    });
  }

  if (hasConfig && !options.force) {
    if (options.json) {
      let payload = withAgentSetupResults(
        {
          status: 'skipped',
          reason: 'config_exists',
          configPath,
          message:
            'A vizzly.config.js file already exists. Use --force to overwrite.',
        },
        { agentSkillResult, agentGuidanceResult }
      );
      resolvedDeps.output.data(payload);
      return { status: 'skipped', configPath };
    }

    resolvedDeps.output.header('init');
    resolvedDeps.output.warn('A vizzly.config.js file already exists');
    resolvedDeps.output.hint('Use --force to overwrite');
    writeAgentSkillOutput(resolvedDeps.output, agentSkillResult);
    writeAgentGuidanceOutput(resolvedDeps.output, agentGuidanceResult);
    return { status: 'skipped', configPath };
  }

  try {
    await writeConfigFile({
      configPath,
      plugins,
      options,
      output: resolvedDeps.output,
      writeFile: resolvedDeps.writeFile,
    });

    let pluginNames = getPluginConfigNames(plugins);

    if (options.json) {
      let payload = withAgentSetupResults(
        {
          status: 'created',
          configPath,
          plugins: pluginNames,
        },
        { agentSkillResult, agentGuidanceResult }
      );
      resolvedDeps.output.data(payload);
      return { status: 'created', configPath, plugins: pluginNames };
    }

    showNextSteps(resolvedDeps.output);
    writeAgentSkillOutput(resolvedDeps.output, agentSkillResult);
    writeAgentGuidanceOutput(resolvedDeps.output, agentGuidanceResult);

    resolvedDeps.output.blank();
    resolvedDeps.output.complete('Vizzly CLI setup complete');

    return { status: 'created', configPath, plugins: pluginNames };
  } catch (error) {
    throw new VizzlyError(
      'Failed to initialize Vizzly configuration',
      'INIT_FAILED',
      { error: error.message }
    );
  }
}
