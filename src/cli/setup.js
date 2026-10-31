import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectLinkCommand } from '../domains/projects/project.commands.js';

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

export async function connectProject(project, options) {
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
