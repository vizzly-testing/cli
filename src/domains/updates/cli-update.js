import { execFile, spawn } from 'node:child_process';
import { access, readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { getPackageName, getPackageRoot } from '../../services/package-info.js';

let exec = promisify(execFile);
let installCommands = { npm: 'install', pnpm: 'add' };
let saveFlags = {
  dependencies: '--save-prod',
  devDependencies: '--save-dev',
  optionalDependencies: '--save-optional',
};

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

// Only offer an installer when the running package can be matched to that
// installation. A checkout, npx cache, or unknown manager gets manual guidance.
export async function findCliUpdatePlan(
  cwd,
  version,
  packageRoot = getPackageRoot()
) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
  let installed = await realpath(packageRoot);
  if (!installed.split(path.sep).includes('node_modules')) return null;
  let name = getPackageName();
  let spec = `${name}@${version}`;
  for (let directory = cwd; ; directory = path.dirname(directory)) {
    let manifest = path.join(directory, 'package.json');
    try {
      let pkg = JSON.parse(await readFile(manifest, 'utf8'));
      let group = Object.keys(saveFlags).find(key => pkg[key]?.[name]);
      if (group) {
        let resolved = createRequire(manifest).resolve(name);
        if (
          (await realpath(resolved)) !==
          path.join(installed, 'dist', 'index.js')
        )
          return null;
        if (/^(workspace:|file:|link:|git|https?:|npm:)/.test(pkg[group][name]))
          return null;
        let manager = pkg.packageManager?.split('@')[0];
        if (!manager) {
          if (await exists(path.join(directory, 'pnpm-lock.yaml')))
            manager = 'pnpm';
          else if (await exists(path.join(directory, 'package-lock.json')))
            manager = 'npm';
        }
        if (!['npm', 'pnpm'].includes(manager)) return null;
        let args = [installCommands[manager], saveFlags[group]];
        let preserveExactVersion = /^\d+\.\d+\.\d+(?:[-+].*)?$/.test(
          pkg[group][name]
        );
        if (preserveExactVersion) args.push('--save-exact');
        args.push(spec);
        return {
          command: manager,
          args,
          cwd: directory,
          cliPath: path.join(directory, 'node_modules', name, 'dist', 'cli.js'),
        };
      }
    } catch {
      // Keep looking for the workspace manifest that owns the dependency.
    }
    if (directory === path.dirname(directory)) break;
  }

  for (let manager of ['npm', 'pnpm']) {
    try {
      let { stdout } = await exec(manager, ['root', '--global'], {
        timeout: 3000,
      });
      let globalPackage = path.join(stdout.trim(), name);
      if ((await realpath(globalPackage)) === installed) {
        return {
          command: manager,
          args: [installCommands[manager], '--global', spec],
          cwd,
          cliPath: path.join(globalPackage, 'dist', 'cli.js'),
        };
      }
    } catch {
      // An unavailable manager cannot own an update we offer to install.
    }
  }
  return null;
}

function runProcess(command, args, cwd, stdio) {
  return new Promise((resolve, reject) => {
    let child = spawn(command, args, {
      cwd,
      stdio,
      shell: process.platform === 'win32' && ['npm', 'pnpm'].includes(command),
    });
    child.once('error', reject);
    child.once('close', (code, signal) =>
      resolve(code ?? (signal === 'SIGINT' ? 130 : 1))
    );
  });
}

export async function runUpdateProcess(command, args, cwd) {
  let code = await runProcess(command, args, cwd, [
    'inherit',
    process.stderr,
    process.stderr,
  ]);
  if (code !== 0) throw new Error(`${command} exited with status ${code}.`);
}

export function runUpdatedCli(cliPath, args, cwd) {
  return runProcess(
    process.execPath,
    [cliPath, '--no-update-notifier', ...args],
    cwd,
    'inherit'
  );
}
