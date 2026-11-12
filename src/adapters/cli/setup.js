import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../domains/config/config-loader.js';
import { projectLinkCommand } from '../../domains/projects/project.commands.js';
import { pickProject } from '../../domains/projects/project-picker.service.js';

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

export async function connectProject(options) {
  let config = await loadConfig(options.config, {
    ...options,
    _ignoreProjectBinding: true,
  });
  let selected;
  try {
    selected = await pickProject(config, options);
  } catch (error) {
    if (error.code !== 'LOGIN_REQUIRED') throw error;
    let cli = fileURLToPath(new URL('./cli.js', import.meta.url));
    await runProcess(process.execPath, [
      cli,
      'login',
      '--api-url',
      config.apiUrl,
    ]);
    config = await loadConfig(options.config, {
      ...options,
      _ignoreProjectBinding: true,
    });
    selected = await pickProject(config, options);
  }
  if (!selected) return { status: 'cancelled' };
  let project = selected.projectId;
  let result = await projectLinkCommand(project, {}, options, {
    exit: code => {
      process.exitCode = code;
    },
  });
  return { status: result?.linked ? 'linked' : 'failed', project };
}
