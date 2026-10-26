import path from 'node:path';
import { readOptionalFile } from '../utils/config-discovery.js';

export async function inspectProject(cwd) {
  let source = await readOptionalFile(path.join(cwd, 'package.json'));
  let pkg = source ? JSON.parse(source) : null;
  let managerCandidates = new Set();
  for (let directory = cwd; ; directory = path.dirname(directory)) {
    let metadata = await readOptionalFile(path.join(directory, 'package.json'));
    let owner = metadata ? JSON.parse(metadata) : {};
    let pnpmWorkspace = await readOptionalFile(
      path.join(directory, 'pnpm-workspace.yaml')
    );
    if (directory === cwd || owner.workspaces || pnpmWorkspace) {
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
  return {
    cwd,
    manager,
    playwright: Boolean(dependencies['@playwright/test']),
    cliInstalled: Boolean(dependencies['@vizzly-testing/cli']),
  };
}
