import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import {
  findDirectoryProjectLink,
  writeDirectoryProjectLink,
} from './directory-link.service.js';
import {
  validateDirectoryProjectLink,
  validateProjectApiOrigin,
} from './directory-link.validations.js';
import { resolveDirectoryProjectLinkScope } from './directory-link-scope.js';

let run = promisify(execFile);
let first = {
  version: 1,
  apiOrigin: 'https://app.vizzly.dev',
  projectId: '11111111-1111-4111-8111-111111111111',
};
let second = { ...first, projectId: '22222222-2222-4222-8222-222222222222' };
let third = { ...first, projectId: '33333333-3333-4333-8333-333333333333' };

async function fixture(t, { git = true } = {}) {
  let directory = await realpath(
    await mkdtemp(path.join(os.tmpdir(), 'vizzly-directory-link-'))
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  if (git) await run('git', ['init', '--quiet', directory]);
  return directory;
}

async function packageDirectory(root, relative) {
  let directory = path.join(root, relative);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'package.json'), '{"name":"app"}');
  return directory;
}

async function record(directory, value) {
  await writeFile(
    path.join(directory, 'vizzly.project.json'),
    JSON.stringify(value)
  );
}

function code(expected) {
  return error => error.code === expected;
}

test('directory link records accept only stable IDs and data without credentials', () => {
  assert.deepEqual(validateDirectoryProjectLink(first), first);
  assert.deepEqual(
    validateDirectoryProjectLink({
      ...first,
      projectId: first.projectId.toUpperCase(),
    }),
    first
  );
  for (let invalid of [
    null,
    [],
    { ...first, version: 2 },
    { ...first, token: 'secret' },
    { ...first, projectId: 'rob/project' },
    { ...first, projectId: '../other' },
  ]) {
    assert.throws(
      () => validateDirectoryProjectLink(invalid),
      code('PROJECT_LINK_INVALID')
    );
  }
  for (let origin of [
    'https://user:password@example.com',
    'file:///tmp/config',
    'https://app.vizzly.dev/path',
    'https://app.vizzly.dev?token=secret',
    'https://app.vizzly.dev#fragment',
    'https://app.vizzly.dev\\evil',
  ]) {
    assert.throws(
      () => validateProjectApiOrigin(origin),
      code('PROJECT_LINK_INVALID')
    );
  }
  assert.equal(
    validateProjectApiOrigin('http://localhost:3000/'),
    'http://localhost:3000'
  );
});

test('commands inherit a package link from descendants without swallowing an unlinked sibling', async t => {
  let root = await fixture(t);
  let app = await packageDirectory(root, 'apps/web');
  let sibling = await packageDirectory(root, 'apps/mobile');
  let deep = path.join(app, 'src/components');
  await mkdir(deep, { recursive: true });
  await record(root, third);
  await record(app, first);
  assert.equal(
    (await findDirectoryProjectLink({ cwd: deep })).binding.projectId,
    first.projectId
  );
  assert.equal(
    (await resolveDirectoryProjectLinkScope({ cwd: deep })).directory,
    app
  );
  let unlinked = await findDirectoryProjectLink({ cwd: sibling });
  assert.equal(unlinked.binding, null);
  assert.equal(unlinked.directory, sibling);
});

test('workspace-root setup requires a deliberate directory, including pnpm workspaces', async t => {
  for (let workspace of ['npm', 'pnpm']) {
    let root = await fixture(t);
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        workspaces: workspace === 'npm' ? ['apps/*'] : undefined,
      })
    );
    if (workspace === 'pnpm')
      await writeFile(
        path.join(root, 'pnpm-workspace.yaml'),
        'packages:\n - apps/*\n'
      );
    await assert.rejects(
      resolveDirectoryProjectLinkScope({ cwd: root }),
      code('PROJECT_LINK_DIRECTORY_REQUIRED')
    );
    assert.equal(
      (await resolveDirectoryProjectLinkScope({ cwd: root, directory: '.' }))
        .directory,
      root
    );
  }
});

test('native directories can link explicitly and outside Git do not inherit ambient parent links', async t => {
  let root = await fixture(t, { git: false });
  await record(root, first);
  let native = path.join(root, 'native');
  await mkdir(native);
  assert.equal((await findDirectoryProjectLink({ cwd: native })).binding, null);
  let scope = await resolveDirectoryProjectLinkScope({
    cwd: root,
    directory: native,
  });
  let result = await writeDirectoryProjectLink({
    directory: scope.directory,
    binding: second,
  });
  assert.equal(result.status, 'written');
  assert.equal(
    (await findDirectoryProjectLink({ cwd: native })).binding.projectId,
    second.projectId
  );
});

test('Git boundaries include nested repositories and linked worktrees', async t => {
  let root = await fixture(t);
  await record(root, first);
  let nested = await packageDirectory(root, 'nested');
  await run('git', ['init', '--quiet', nested]);
  assert.equal((await findDirectoryProjectLink({ cwd: nested })).binding, null);
  await run('git', [
    '-C',
    root,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--allow-empty',
    '-m',
    'fixture',
  ]);
  let worktree = `${root}-worktree`;
  t.after(() => rm(worktree, { recursive: true, force: true }));
  await run('git', ['-C', root, 'worktree', 'add', '--detach', worktree]);
  let physical = await realpath(worktree);
  await record(physical, second);
  let child = path.join(physical, 'src');
  await mkdir(child);
  let found = await findDirectoryProjectLink({ cwd: child });
  assert.equal(found.root, physical);
  assert.equal(found.binding.projectId, second.projectId);
});

test('links cannot select the server receiving credentials', async t => {
  let root = await fixture(t);
  await record(root, { ...first, apiOrigin: 'https://other.example.com' });
  await assert.rejects(
    findDirectoryProjectLink({ cwd: root, apiOrigin: first.apiOrigin }),
    code('PROJECT_LINK_ORIGIN_MISMATCH')
  );
  assert.equal(
    (
      await findDirectoryProjectLink({
        cwd: root,
        apiOrigin: 'https://other.example.com',
      })
    ).binding.apiOrigin,
    'https://other.example.com'
  );
});

test('rejects corrupt, oversized, and nonregular records without following redirects', async t => {
  let root = await fixture(t);
  let filename = path.join(root, 'vizzly.project.json');
  await writeFile(filename, '{bad json');
  await assert.rejects(
    findDirectoryProjectLink({ cwd: root }),
    code('PROJECT_LINK_INVALID')
  );
  await writeFile(filename, `${JSON.stringify(first)}${' '.repeat(16 * 1024)}`);
  await assert.rejects(
    findDirectoryProjectLink({ cwd: root }),
    code('PROJECT_LINK_INVALID')
  );
  await rm(filename);
  await mkdir(filename);
  await assert.rejects(
    findDirectoryProjectLink({ cwd: root }),
    code('PROJECT_LINK_UNSAFE_PATH')
  );
  await rm(filename, { recursive: true });
  let target = path.join(root, 'target.json');
  await writeFile(target, JSON.stringify(first));
  await symlink(target, filename);
  await assert.rejects(
    findDirectoryProjectLink({ cwd: root }),
    code('PROJECT_LINK_UNSAFE_PATH')
  );
  await assert.rejects(
    writeDirectoryProjectLink({ directory: root, binding: second }),
    code('PROJECT_LINK_UNSAFE_PATH')
  );
  await rm(filename);
  await link(target, filename);
  await assert.rejects(
    findDirectoryProjectLink({ cwd: root }),
    code('PROJECT_LINK_UNSAFE_PATH')
  );
  await assert.rejects(
    writeDirectoryProjectLink({ directory: root, binding: second }),
    code('PROJECT_LINK_UNSAFE_PATH')
  );
  assert.equal(await readFile(target, 'utf8'), JSON.stringify(first));
});

test('rejects missing parents, symlink traversal, and a sibling sharing the checkout prefix', async t => {
  let root = await fixture(t);
  let sibling = `${root}-sibling`;
  await mkdir(sibling);
  t.after(() => rm(sibling, { recursive: true, force: true }));
  await assert.rejects(
    resolveDirectoryProjectLinkScope({ cwd: root, directory: sibling }),
    code('PROJECT_LINK_UNSAFE_PATH')
  );
  await symlink(sibling, path.join(root, 'redirect'));
  await assert.rejects(
    resolveDirectoryProjectLinkScope({ cwd: root, directory: 'redirect' }),
    code('PROJECT_LINK_UNSAFE_PATH')
  );
  await assert.rejects(
    resolveDirectoryProjectLinkScope({ cwd: root, directory: 'redirect/..' }),
    code('PROJECT_LINK_UNSAFE_PATH')
  );
  await assert.rejects(
    writeDirectoryProjectLink({
      directory: path.join(root, 'missing'),
      binding: first,
    }),
    code('PROJECT_LINK_DIRECTORY_INVALID')
  );
});

test('same link leaves the file untouched and an explicit relink returns the previous destination', async t => {
  let root = await fixture(t);
  let initial = await writeDirectoryProjectLink({
    directory: root,
    binding: first,
    expectedBefore: null,
  });
  assert.equal(initial.previous, null);
  let before = await stat(initial.path, { bigint: true });
  let unchanged = await writeDirectoryProjectLink({
    directory: root,
    binding: first,
  });
  assert.equal(unchanged.status, 'unchanged');
  assert.equal(
    (await stat(initial.path, { bigint: true })).mtimeNs,
    before.mtimeNs
  );
  assert.equal((await stat(initial.path, { bigint: true })).ino, before.ino);
  let updated = await writeDirectoryProjectLink({
    directory: root,
    binding: second,
    expectedBefore: initial.source,
  });
  assert.deepEqual(updated.previous, first);
  assert.deepEqual(JSON.parse(await readFile(initial.path, 'utf8')), second);
});

test('competing project selections cannot silently overwrite each other', async t => {
  let root = await fixture(t);
  let initial = await writeDirectoryProjectLink({
    directory: root,
    binding: first,
  });
  let results = await Promise.allSettled(
    [second, third].map(binding =>
      writeDirectoryProjectLink({
        directory: root,
        binding,
        expectedBefore: initial.source,
      })
    )
  );
  let winner = results.find(result => result.status === 'fulfilled').value;
  let loser = results.find(result => result.status === 'rejected').reason;
  assert.equal(loser.code, 'PROJECT_LINK_CONFLICT');
  assert.deepEqual(
    (await findDirectoryProjectLink({ cwd: root })).binding,
    winner.binding
  );
});
