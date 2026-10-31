import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyChanges } from '../../services/file-changes.js';
import * as output from '../../services/output.js';
import { discoverConfig } from '../config/config-discovery.js';
import { planConfig } from '../config/config-plan.js';
import {
  projectLinkCommand,
  validateProjectLinkOptions,
} from '../projects/project.commands.js';
import { planAgentSetup } from './agent-setup.js';
import { createPrompts } from './setup-prompts.js';

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    let child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${command} did not finish successfully (${signal || code}).`
          )
        );
    });
  });
}

async function guidedPlan(cwd, config, prompts) {
  output.hint(`Project: ${cwd}`);
  let guidance = await prompts.confirm(
    'Add the Vizzly skill and AGENTS.md instructions?'
  );
  let cloudProject = null;
  if (
    await prompts.confirm('Connect this repository to a Vizzly Cloud project?')
  ) {
    cloudProject = await prompts.ask('Project (organization/project)');
    let errors = validateProjectLinkOptions(cloudProject);
    if (errors.length) throw new Error(errors.join(' '));
  }
  let agents = await planAgentSetup(cwd, { skill: guidance, guidance });
  let changes = [planConfig(config), ...agents.changes];
  output.labelValue('Proposed changes', '');
  output.list(changes.map(change => path.relative(cwd, change.path)));
  if (cloudProject) {
    output.hint(`Connect project: ${cloudProject}`);
    output.hint(
      'Local setup is saved first. If cloud linking fails, your local files stay in place.'
    );
  }
  if (!(await prompts.confirm('Apply this setup?', true))) {
    throw Object.assign(new Error('Setup cancelled.'), {
      code: 'INIT_CANCELLED',
    });
  }
  return { ...agents, changes, cloudProject };
}

function agentOptions(options) {
  let guidance = Boolean(options.agentGuidance);
  return {
    guidance,
    skill: guidance || (!options.skipAgentSkill && Boolean(options.agentSkill)),
  };
}

async function connectProject(project, options) {
  let exitCode = 0;
  let link = () =>
    projectLinkCommand(project, {}, options, {
      exit: code => {
        exitCode = code;
      },
    });
  let result = await link();
  if (result?.reason === 'auth_required') {
    let cli = fileURLToPath(new URL('../../cli.js', import.meta.url));
    await runProcess(process.execPath, [cli, 'login']);
    result = await link();
  }
  let status = result?.linked ? 'linked' : 'failed';
  if (!result?.linked && exitCode === 1) status = 'auth_required';
  return { status, project };
}

function showResult(result, json) {
  if (json) {
    output.data(result);
    return;
  }
  output.complete(
    result.status === 'created' ? 'Config created' : 'Existing config preserved'
  );
  output.hint(result.configPath);
  if (result.agentSkill)
    output.hint(`Vizzly agent skill: ${result.agentSkill.status}`);
  if (result.agentGuidance)
    output.hint(`AGENTS.md guidance: ${result.agentGuidance.status}`);
  if (result.cloud.error)
    output.warn(`Cloud linking failed: ${result.cloud.error}`);
  if (result.status === 'skipped') {
    output.hint(
      'Edit this config to change your setup. Use --force to replace it.'
    );
  } else {
    output.hint('Edit this config for your project.');
    output.hint('Use a Vizzly client to add screenshot capture.');
  }
}

export async function init(options = {}) {
  output.configure({
    json: options.json || false,
    verbose: options.verbose,
    color: options.color,
  });
  let cwd = process.cwd();
  let explicitAgentOption =
    options.agentSkill || options.agentGuidance || options.skipAgentSkill;
  let quick = Boolean(options.quick || options.json || explicitAgentOption);
  let config = await discoverConfig({
    cwd,
    configPath: options.config,
    allowInvalid: options.force,
  });
  let initialized = config.exists && !options.force;
  if (
    !initialized &&
    !quick &&
    (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI)
  ) {
    throw Object.assign(
      new Error(
        'Use vizzly init --quick to create config without a terminal, or run vizzly init interactively.'
      ),
      { code: 'INIT_INPUT_REQUIRED' }
    );
  }
  let mode = quick ? 'quick' : 'guided';
  let plan;
  let prompts;
  try {
    if (initialized) {
      plan = await planAgentSetup(cwd, agentOptions(options));
    } else if (quick) {
      let configChange = planConfig(config);
      let agents = await planAgentSetup(cwd, agentOptions(options));
      plan = {
        ...agents,
        changes: [configChange, ...agents.changes],
      };
    } else {
      output.header('init');
      prompts = createPrompts();
      plan = await guidedPlan(cwd, config, prompts);
    }
  } catch (error) {
    if (error.code !== 'INIT_CANCELLED') throw error;
    output.hint('Setup cancelled; no files changed.');
    return { status: 'cancelled', mode, exitCode: 130 };
  } finally {
    prompts?.close();
  }

  let changes = await applyChanges(plan.changes);
  let result = {
    status: initialized ? 'skipped' : 'created',
    ...(initialized ? { reason: 'config_exists' } : {}),
    configPath: config.configPath,
    mode,
    plugins: [],
    changes,
    cloud: { status: 'not_requested' },
    ...(plan.agentSkill ? { agentSkill: plan.agentSkill } : {}),
    ...(plan.agentGuidance ? { agentGuidance: plan.agentGuidance } : {}),
    exitCode: 0,
  };
  if (plan.cloudProject) {
    try {
      result.cloud = await connectProject(plan.cloudProject, options);
    } catch (error) {
      result.cloud = {
        status: 'failed',
        project: plan.cloudProject,
        error: error.message,
      };
    }
    if (result.cloud.status !== 'linked') result.exitCode = 1;
  }
  output.configure({ json: options.json || false });
  showResult(result, options.json);
  return result;
}
