import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { getRepositoryInfo } from '../../shared/git.js';
import { normalizeRepositoryRemote } from './project-selection.normalizers.js';
import { resolveProjectSelection } from './project-selection.service.js';

let credential = {
  kind: 'user',
  source: 'user',
  authorization: { scopes: ['read', 'builds:write'] },
};
let first = { id: 'one', organizationSlug: 'acme', slug: 'website' };
let second = { id: 'two', organizationSlug: 'acme', slug: 'dashboard' };

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function workspace(t) {
  let directory = await mkdtemp(join(tmpdir(), 'vizzly-project-selection-'));
  let originalHome = process.env.VIZZLY_HOME;
  process.env.VIZZLY_HOME = join(directory, 'state');
  t.after(async () => {
    if (originalHome === undefined) delete process.env.VIZZLY_HOME;
    else process.env.VIZZLY_HOME = originalHome;
    await rm(directory, { recursive: true, force: true });
  });
  let cwd = join(directory, 'checkout');
  await mkdir(cwd);
  git(cwd, ['init', '--initial-branch=main']);
  git(cwd, ['remote', 'add', 'origin', 'git@github.com:Acme/Website.git']);
  return { directory, cwd, config: { apiUrl: 'https://app.example.test' } };
}

function projectApi(repositories) {
  let requests = [];
  return {
    requests,
    async request(endpoint) {
      requests.push(endpoint);
      let url = new URL(endpoint, 'https://app.example.test');
      let projects = repositories[url.searchParams.get('repository')] || [];
      let offset = Number(url.searchParams.get('offset'));
      let limit = Number(url.searchParams.get('limit'));
      return {
        projects: projects.slice(offset, offset + limit),
        meta: {
          offset,
          limit,
          total: projects.length,
          hasMore: offset + limit < projects.length,
        },
      };
    },
  };
}

test('normalizes supported GitHub remotes and rejects unrelated or malformed URLs', () => {
  for (let value of [
    'git@github.com:Acme/Website.git',
    'ssh://git@github.com/Acme/Website.git',
    'ssh://git@github.com:22/Acme/Website.git',
    'https://github.com/acme/website',
    'https://secret@github.com/acme/website.git/',
  ]) {
    assert.equal(normalizeRepositoryRemote(value), 'github.com/acme/website');
  }
  for (let value of [
    '/tmp/website.git',
    'git@evil.example:acme/website.git',
    'https://github.com.evil.example/acme/website',
    'https://github.com/acme/website?token=secret',
    'https://github.com/a/../acme/website',
    'https://github.com/acme/..',
    'https://github.com/acme/website/extra',
    `https://github.com/${'a'.repeat(40)}/website`,
    `https://github.com/acme/${'a'.repeat(101)}`,
  ]) {
    assert.equal(normalizeRepositoryRemote(value), null, value);
  }
});

test('uses Git from nested directories and linked worktrees', async t => {
  let { cwd, directory } = await workspace(t);
  git(cwd, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '--allow-empty',
    '-m',
    'fixture',
  ]);
  let nested = join(cwd, 'packages', 'web');
  await mkdir(nested, { recursive: true });
  let worktree = join(directory, 'worktree');
  git(cwd, ['worktree', 'add', '-b', 'review', worktree]);
  for (let location of [cwd, nested, worktree]) {
    let repository = await getRepositoryInfo(location);
    assert.deepEqual(repository.remotes, [
      { name: 'origin', url: 'git@github.com:Acme/Website.git' },
    ]);
    let selection = await resolveProjectSelection(
      { apiUrl: 'https://app.example.test' },
      {
        credential,
        client: projectApi({ 'github.com/acme/website': [first] }),
        cwd: location,
      }
    );
    assert.equal(selection.source, 'repository');
    assert.equal(selection.projectQuery.project, 'website');
  }
});

test('explicit flags, config and project tokens bypass discovery', async () => {
  let config = { project: { organizationSlug: 'acme', projectSlug: 'saved' } };
  let configured = await resolveProjectSelection(config, { credential });
  assert.equal(configured.source, 'config');
  let flags = await resolveProjectSelection(config, {
    credential,
    org: 'other',
  });
  assert.deepEqual(flags.projectQuery, { organization: 'other' });
  let token = await resolveProjectSelection(
    {},
    { credential: { kind: 'project' } }
  );
  assert.deepEqual(token.projectQuery, {});
});

test('deduplicates all remote matches and never writes automatic matches', async t => {
  let { cwd, config } = await workspace(t);
  git(cwd, [
    'remote',
    'add',
    'upstream',
    'https://github.com/Acme/Website.git',
  ]);
  let client = projectApi({ 'github.com/acme/website': [first] });
  let selection = await resolveProjectSelection(config, {
    cwd,
    credential,
    client,
  });
  assert.equal(selection.project.projectSlug, 'website');
  assert.equal(client.requests.length, 1);
  await assert.rejects(readdir(process.env.VIZZLY_HOME), { code: 'ENOENT' });
  git(cwd, [
    'remote',
    'set-url',
    'upstream',
    'git@github.com:Acme/Product.git',
  ]);
  client = projectApi({
    'github.com/acme/website': [first],
    'github.com/acme/product': [second],
  });
  await assert.rejects(
    resolveProjectSelection(config, { cwd, credential, client }),
    {
      code: 'PROJECT_SELECTION_AMBIGUOUS',
    }
  );
});

test('reads every candidate page before deciding the project is unique', async t => {
  let { cwd, config } = await workspace(t);
  let projects = Array.from({ length: 251 }, (_, index) => ({
    ...first,
    id: String(index),
  }));
  let client = projectApi({ 'github.com/acme/website': projects });
  await assert.rejects(
    resolveProjectSelection(config, { cwd, credential, client }),
    error => {
      assert.equal(error.code, 'PROJECT_SELECTION_AMBIGUOUS');
      assert.equal(error.context.candidates.length, 251);
      return true;
    }
  );
  assert.equal(client.requests.length, 6);
});

test('saves a choice only after selection and revalidates current access', async t => {
  let { cwd, config } = await workspace(t);
  let projects = { 'github.com/acme/website': [first, second] };
  let client = projectApi(projects);
  await assert.rejects(
    resolveProjectSelection(config, {
      cwd,
      credential,
      client,
      interactive: true,
      selectProject: async () => null,
    }),
    { code: 'PROMPT_CANCELLED' }
  );
  await assert.rejects(readdir(process.env.VIZZLY_HOME), { code: 'ENOENT' });
  let selected = await resolveProjectSelection(config, {
    cwd,
    credential,
    client,
    interactive: true,
    selectProject: async candidates => candidates[1],
  });
  assert.equal(selected.project.projectSlug, 'dashboard');
  let saved = await resolveProjectSelection(config, {
    cwd,
    credential,
    client,
  });
  assert.equal(saved.source, 'saved-selection');
  assert.equal(saved.project.projectSlug, 'dashboard');
  await assert.rejects(
    resolveProjectSelection(
      { ...config, apiUrl: 'https://different.example.test' },
      {
        cwd,
        credential,
        client,
      }
    ),
    { code: 'PROJECT_SELECTION_AMBIGUOUS' }
  );
  projects['github.com/acme/website'] = [
    first,
    { ...second, id: 'replacement' },
  ];
  await assert.rejects(
    resolveProjectSelection(config, { cwd, credential, client }),
    {
      code: 'PROJECT_SELECTION_AMBIGUOUS',
    }
  );
});

test('keeps package and worktree choices separate', async t => {
  let { cwd, config, directory } = await workspace(t);
  let packageDirectory = join(cwd, 'packages', 'web');
  await mkdir(packageDirectory, { recursive: true });
  let configPath = join(packageDirectory, 'vizzly.config.js');
  await writeFile(configPath, 'export default {};\n');
  let client = projectApi({ 'github.com/acme/website': [first, second] });
  await resolveProjectSelection(
    { ...config, _configPath: configPath },
    {
      cwd,
      credential,
      client,
      interactive: true,
      selectProject: async candidates => candidates[1],
    }
  );
  await assert.rejects(
    resolveProjectSelection(config, { cwd, credential, client }),
    {
      code: 'PROJECT_SELECTION_AMBIGUOUS',
    }
  );
  git(cwd, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '--allow-empty',
    '-m',
    'fixture',
  ]);
  let worktree = join(directory, 'worktree');
  git(cwd, ['worktree', 'add', '-b', 'review', worktree]);
  await assert.rejects(
    resolveProjectSelection(config, { cwd: worktree, credential, client }),
    {
      code: 'PROJECT_SELECTION_AMBIGUOUS',
    }
  );
});
