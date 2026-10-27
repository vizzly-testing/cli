import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { findCliUpdatePlan } from '../../src/utils/cli-update.js';

let name = '@vizzly-testing/cli';

async function installation(t, pkg) {
  let cwd = await realpath(
    await mkdtemp(path.join(tmpdir(), 'vizzly-installer-'))
  );
  t.after(() => rm(cwd, { recursive: true, force: true }));
  let packageRoot = path.join(cwd, 'node_modules', name);
  await mkdir(path.join(packageRoot, 'dist'), { recursive: true });
  await writeFile(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name, main: './dist/index.js' })
  );
  await writeFile(path.join(packageRoot, 'dist', 'index.js'), '');
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify(pkg));
  return { cwd, packageRoot };
}

test('local upgrade plans keep the owning manager, directory, and dependency group', async t => {
  for (let [manager, group, flag] of [
    ['npm', 'devDependencies', '--save-dev'],
    ['pnpm', 'dependencies', '--save-prod'],
    ['pnpm', 'optionalDependencies', '--save-optional'],
  ]) {
    let { cwd, packageRoot } = await installation(t, {
      packageManager: `${manager}@11.0.0`,
      [group]: { [name]: '^0.39.0' },
    });
    let nested = path.join(cwd, 'packages', 'app');
    await mkdir(nested, { recursive: true });
    assert.deepEqual(await findCliUpdatePlan(nested, '0.40.0', packageRoot), {
      command: manager,
      args: [manager === 'pnpm' ? 'add' : 'install', flag, `${name}@0.40.0`],
      cwd,
      cliPath: path.join(packageRoot, 'dist', 'cli.js'),
    });
  }
});

test('lockfiles identify npm and pnpm when the manifest has no manager', async t => {
  for (let [manager, lockfile] of [
    ['npm', 'package-lock.json'],
    ['pnpm', 'pnpm-lock.yaml'],
  ]) {
    let { cwd, packageRoot } = await installation(t, {
      devDependencies: { [name]: '^0.39.0' },
    });
    await writeFile(path.join(cwd, lockfile), '');
    let plan = await findCliUpdatePlan(cwd, '0.40.0', packageRoot);
    assert.equal(plan.command, manager);
  }
});

test('upgrading an exact dependency keeps it pinned', async t => {
  let { cwd, packageRoot } = await installation(t, {
    packageManager: 'npm@11.0.0',
    devDependencies: { [name]: '0.39.0' },
  });
  let plan = await findCliUpdatePlan(cwd, '0.40.0', packageRoot);
  assert.deepEqual(plan.args, [
    'install',
    '--save-dev',
    '--save-exact',
    `${name}@0.40.0`,
  ]);
});

test('global upgrades match the package manager root to the running installation', {
  skip: process.platform === 'win32',
}, async t => {
  let { cwd, packageRoot } = await installation(t, {});
  let bin = path.join(cwd, 'bin');
  await mkdir(bin);
  let manager = path.join(bin, 'npm.js');
  await writeFile(
    manager,
    `#!/usr/bin/env node\nconsole.log(${JSON.stringify(path.join(cwd, 'node_modules'))});\n`
  );
  await chmod(manager, 0o755);
  await symlink(manager, path.join(bin, 'npm'));
  let previousPath = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${previousPath}`;
  t.after(() => {
    process.env.PATH = previousPath;
  });
  let project = path.join(cwd, 'project');
  await mkdir(project);
  let plan = await findCliUpdatePlan(project, '0.40.0', packageRoot);
  assert.equal(plan.command, 'npm');
  assert.deepEqual(plan.args, ['install', '--global', `${name}@0.40.0`]);
  assert.equal(plan.cwd, project);
  assert.equal(plan.cliPath, path.join(packageRoot, 'dist', 'cli.js'));
});

test('unsupported managers, linked packages, and mismatched installations stay manual', async t => {
  for (let pkg of [
    { packageManager: 'yarn@4.0.0', devDependencies: { [name]: '^0.39.0' } },
    {
      packageManager: 'npm@11.0.0',
      devDependencies: { [name]: 'file:../cli' },
    },
    {
      packageManager: 'npm@11.0.0',
      devDependencies: { [name]: 'workspace:*' },
    },
    { devDependencies: { [name]: '^0.39.0' } },
  ]) {
    let { cwd, packageRoot } = await installation(t, pkg);
    assert.equal(await findCliUpdatePlan(cwd, '0.40.0', packageRoot), null);
  }
  let local = await installation(t, {
    packageManager: 'npm@11.0.0',
    dependencies: { [name]: '^0.39.0' },
  });
  let other = await installation(t, {});
  assert.equal(
    await findCliUpdatePlan(local.cwd, '0.40.0', other.packageRoot),
    null
  );
  assert.equal(
    await findCliUpdatePlan(local.cwd, 'bad; command', local.packageRoot),
    null
  );
  assert.equal(await findCliUpdatePlan(local.cwd, '0.40.0', local.cwd), null);
});
