import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planAgentSetup } from '../init/agents.js';
import { planConfig } from '../init/core.js';
import { chooseIntegration, planVisualScript } from '../init/integrations.js';
import { inspectProject } from '../init/project.js';
import { createPrompts } from '../init/prompts.js';
import { discoverConfig, readOptionalFile } from '../utils/config-discovery.js';
import { applyChanges, fileChange } from '../utils/file-changes.js';
import * as output from '../utils/output.js';
import { projectLinkCommand, validateProjectLinkOptions } from './project.js';
import { tddCommand } from './tdd.js';

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

async function ignoreChange(cwd, prompts) {
  let filename = path.join(cwd, '.gitignore');
  let source = (await readOptionalFile(filename)) || '';
  if (
    source
      .split(/\r?\n/)
      .some(line =>
        ['.vizzly', '.vizzly/', '/.vizzly', '/.vizzly/'].includes(line)
      )
  )
    return null;
  if (
    !(await prompts.confirm(
      'Ignore generated .vizzly/ data here, including local baselines?'
    ))
  )
    return null;
  return fileChange(
    filename,
    `${source}${source && !source.endsWith('\n') ? '\n' : ''}# Vizzly local review data\n/.vizzly/\n`
  );
}

async function guidedPlan(cwd, config, options, prompts) {
  let project = await inspectProject(cwd);
  output.hint(`Project: ${cwd}`);
  if (project.manager) output.hint(`Package manager: ${project.manager}`);
  if (project.scripts.length)
    output.hint(
      `Found scripts: ${project.scripts.map(([name]) => name).join(', ')}`
    );
  let integration = await chooseIntegration(project, prompts);
  let { skill, guidance, refresh } = agentOptions(options);
  if (!guidance && !skill && !options.skipAgentSkill) {
    guidance = await prompts.confirm(
      'Add the Vizzly skill and AGENTS.md instructions?'
    );
    skill = guidance;
  }
  let plannedConfig = planConfig(config, integration.settings, options.force);
  let scriptProject = project;
  if (plannedConfig.change?.path === path.join(cwd, 'package.json')) {
    scriptProject = {
      ...project,
      pkg: JSON.parse(plannedConfig.change.after),
      packageSource: plannedConfig.change.after,
    };
  }
  let scripts = integration.command
    ? await planVisualScript(scriptProject, integration.command, prompts)
    : [];
  let changes = [...integration.changes, ...scripts];
  if (
    plannedConfig.change &&
    !scripts.some(change => change?.path === plannedConfig.change.path)
  ) {
    changes.unshift(plannedConfig.change);
  }
  if (integration.command) changes.push(await ignoreChange(cwd, prompts));
  let install = false;
  if (integration.install.length && project.manager) {
    install = await prompts.confirm(
      `Install ${integration.install.join(' and ')} using ${project.manager}?`
    );
  }
  let requirements = [
    ...plannedConfig.requirements,
    ...integration.requirements,
  ];
  if (integration.install.length && !install) {
    requirements.push(
      `Install the required development dependencies: ${integration.install.join(', ')}.`
    );
  }
  let verify = false;
  let open = false;
  if (integration.command && !requirements.length) {
    output.hint(
      'First local captures create new baselines; existing baselines will not be replaced.'
    );
    verify = await prompts.confirm(
      'Run the selected command now to check screenshot capture?'
    );
    if (verify)
      open = await prompts.confirm('Open the generated report after capture?');
  }
  let cloudProject = null;
  if (
    await prompts.confirm('Connect this repository to a Vizzly Cloud project?')
  ) {
    cloudProject = await prompts.ask('Project (organization/project)');
    let errors = validateProjectLinkOptions(cloudProject);
    if (errors.length) throw new Error(errors.join(' '));
  }
  let agents = await planAgentSetup(cwd, {
    skill,
    guidance,
    refresh,
  });
  changes.push(...agents.changes);
  changes = changes.filter(Boolean);
  output.labelValue('Proposed changes', '');
  output.list(changes.map(change => path.relative(cwd, change.path)));
  for (let requirement of requirements) output.hint(requirement);
  if (install) output.hint(`Install: ${integration.install.join(', ')}`);
  if (verify) {
    let action =
      integration.integration === 'images'
        ? `Capture screenshots from ${integration.settings.upload.screenshotsDir}`
        : `Run: ${integration.command}`;
    output.hint(action);
  }
  if (cloudProject) output.hint(`Connect project: ${cloudProject}`);
  if (cloudProject)
    output.hint(
      'Local setup is saved first. If cloud linking fails, your local files stay in place.'
    );
  if (!(await prompts.confirm('Apply this setup?', true))) {
    throw Object.assign(new Error('Setup cancelled.'), {
      code: 'INIT_CANCELLED',
    });
  }
  return {
    project,
    integration,
    ...agents,
    changes,
    requirements,
    install,
    verify,
    open,
    cloudProject,
  };
}

function agentOptions(options) {
  let guidance = Boolean(options.agentGuidance);
  return {
    guidance,
    skill: guidance || (!options.skipAgentSkill && Boolean(options.agentSkill)),
    refresh: Boolean(options.agentSkill || options.agentGuidance),
  };
}

async function verifyCapture(command, options, open) {
  let run;
  try {
    run = await tddCommand(
      command,
      { emitOutput: false, open, autoPort: true },
      { ...options, json: false }
    );
    let result = run.result;
    let capture = result.capture;
    let status = 'failed';
    if (
      result.success &&
      capture?.setup === 'ready' &&
      !capture.rejected &&
      !capture.errors
    ) {
      status =
        capture.accepted > 0 && result.reportPath
          ? 'captured'
          : 'no_screenshots';
    }
    return {
      capture: status,
      count: capture?.accepted || 0,
      reportPath: result.reportPath || null,
      error:
        [
          ...new Set(
            [capture?.reason, result.error, result.reportError].filter(Boolean)
          ),
        ].join(' ') || null,
    };
  } finally {
    await run?.cleanup();
    output.configure({ json: options.json || false });
  }
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
    let cli = fileURLToPath(new URL('../cli.js', import.meta.url));
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
  if (result.verification.capture === 'captured') {
    let count = result.verification.count;
    output.complete(`Captured ${count} screenshot${count === 1 ? '' : 's'}`);
    output.hint(`Report: ${result.verification.reportPath}`);
  } else if (result.verification.capture !== 'not_run') {
    output.warn(
      result.verification.capture === 'no_screenshots'
        ? 'The command completed without capturing screenshots.'
        : 'Screenshot verification failed.'
    );
    if (result.verification.error) output.hint(result.verification.error);
  }
  for (let requirement of result.requirements) output.hint(requirement);
  if (result.mode === 'quick') {
    output.hint(
      'Edit this config for your project. Run vizzly init for guided setup.'
    );
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
  if (
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
  let config = await discoverConfig({
    cwd,
    configPath: options.config,
    allowInvalid: options.force,
  });
  let mode = quick ? 'quick' : 'guided';
  let plan;
  let prompts;
  try {
    if (quick) {
      let configPlan = planConfig(config, {}, options.force);
      let agents = await planAgentSetup(cwd, agentOptions(options));
      plan = {
        ...agents,
        changes: [configPlan.change, ...agents.changes],
        requirements: configPlan.requirements,
      };
    } else {
      output.header('init');
      prompts = createPrompts();
      plan = await guidedPlan(cwd, config, options, prompts);
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
    status: config.exists && !options.force ? 'skipped' : 'created',
    ...(config.exists && !options.force ? { reason: 'config_exists' } : {}),
    configPath: config.configPath,
    mode,
    plugins: [],
    changes,
    requirements: plan.requirements,
    verification: { capture: 'not_run' },
    cloud: { status: 'not_requested' },
    ...(plan.agentSkill ? { agentSkill: plan.agentSkill } : {}),
    ...(plan.agentGuidance ? { agentGuidance: plan.agentGuidance } : {}),
    exitCode: plan.requirements.length ? 2 : 0,
  };
  try {
    if (plan.install) {
      let manager = plan.project.manager;
      let args = manager === 'npm' ? ['install', '--save-dev'] : ['add', '-D'];
      await runProcess(manager, [...args, ...plan.integration.install]);
    }
    if (plan.cloudProject)
      result.cloud = await connectProject(plan.cloudProject, options);
    if (plan.verify) {
      result.verification = await verifyCapture(
        plan.integration.command,
        options,
        plan.open
      );
      if (result.verification.capture !== 'captured') result.exitCode = 1;
    }
    if (
      result.cloud.status !== 'not_requested' &&
      result.cloud.status !== 'linked'
    )
      result.exitCode = 1;
  } catch (error) {
    result.exitCode = 1;
    result.requirements.push(error.message);
  }
  output.configure({ json: options.json || false });
  showResult(result, options.json);
  return result;
}
