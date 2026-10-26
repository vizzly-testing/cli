import path from 'node:path';
import { readOptionalFile } from '../utils/config-discovery.js';
import { packageCommand } from './core.js';

export async function inspectProject(cwd) {
  let source = await readOptionalFile(path.join(cwd, 'package.json'));
  let pkg = source ? JSON.parse(source) : null;
  let managerCandidates = new Set();
  let workspace = cwd;
  for (let directory = cwd; ; directory = path.dirname(directory)) {
    let metadata = await readOptionalFile(path.join(directory, 'package.json'));
    let owner = metadata ? JSON.parse(metadata) : {};
    let pnpmWorkspace = await readOptionalFile(
      path.join(directory, 'pnpm-workspace.yaml')
    );
    if (directory === cwd || owner.workspaces || pnpmWorkspace) {
      workspace = directory;
      if (owner.packageManager)
        managerCandidates.add(owner.packageManager.split('@')[0]);
      for (let [lock, manager] of [
        ['pnpm-lock.yaml', 'pnpm'],
        ['package-lock.json', 'npm'],
        ['yarn.lock', 'yarn'],
        ['bun.lock', 'bun'],
        ['bun.lockb', 'bun'],
      ]) {
        if ((await readOptionalFile(path.join(directory, lock))) !== null)
          managerCandidates.add(manager);
      }
      if (managerCandidates.size || owner.workspaces || pnpmWorkspace) break;
    }
    if (path.dirname(directory) === directory) break;
  }
  let manager = managerCandidates.size === 1 ? [...managerCandidates][0] : null;
  let dependencies = { ...pkg?.dependencies, ...pkg?.devDependencies };
  let scripts = Object.entries(pkg?.scripts || {}).filter(([name]) =>
    /visual|e2e|playwright|storybook/.test(name)
  );
  let suggested =
    scripts.length === 1 && manager
      ? packageCommand(manager, scripts[0][0])
      : null;
  return {
    cwd,
    packageSource: source,
    pkg,
    manager,
    workspace,
    managerCandidates: [...managerCandidates],
    scripts,
    suggested,
    playwright: Boolean(dependencies['@playwright/test']),
    cliInstalled: Boolean(dependencies['@vizzly-testing/cli']),
  };
}
