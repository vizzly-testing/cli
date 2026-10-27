import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

let exec = promisify(execFile);
let cli = fileURLToPath(new URL('../../src/cli.js', import.meta.url));

async function project(t) {
  let cwd = await realpath(await mkdtemp(path.join(tmpdir(), 'vizzly-init-')));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}

async function run(cwd, args = [], json = true) {
  let env = { ...process.env };
  for (let name of Object.keys(env)) {
    if (name.startsWith('VIZZLY_') || name === 'NODE_V8_COVERAGE')
      delete env[name];
  }
  env.VIZZLY_HOME = path.join(cwd, 'user-state');
  env.VIZZLY_DISABLE_KEYCHAIN = 'true';
  let result;
  try {
    result = await exec(
      process.execPath,
      [cli, 'init', ...args, ...(json ? ['--json'] : [])],
      { cwd, env }
    );
    result.code = 0;
  } catch (error) {
    result = error;
  }
  return {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    data: json && result.stdout.trim() ? JSON.parse(result.stdout).data : null,
  };
}

async function missing(filename) {
  await assert.rejects(access(filename), { code: 'ENOENT' });
}

test('quick needs only one flag, creates minimal config and never touches user state', async t => {
  let cwd = await project(t);
  let result = await run(cwd, ['--quick'], false);
  assert.equal(result.code, 0, result.stderr);
  let filename = path.join(cwd, 'vizzly.config.js');
  assert.match(result.stdout, /Config created/);
  assert.match(result.stdout, /Edit this config/);
  let source = await readFile(filename, 'utf8');
  assert.match(source, /\/\/ comparison:/);
  let { default: config } = await import(filename);
  assert.deepEqual(config, {});
  assert.deepEqual(await readdir(cwd), ['vizzly.config.js']);
});

test('JSON uses quick behavior and keeps created/skipped config statuses', async t => {
  let cwd = await project(t);
  let first = await run(cwd);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(first.data.status, 'created');
  assert.equal(first.data.mode, 'quick');
  let source = await readFile(first.data.configPath, 'utf8');
  let again = await run(cwd);
  assert.equal(again.data.status, 'skipped');
  assert.deepEqual(again.data.changes, []);
  assert.equal(await readFile(first.data.configPath, 'utf8'), source);
  await missing(path.join(cwd, 'user-state'));
});

test('quick does not require framework or manager choices and never executes plugins', async t => {
  let cwd = await project(t);
  let pkg = {
    devDependencies: {
      '@playwright/test': '*',
      vitest: '*',
      '@vizzly-testing/fake': '*',
    },
  };
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify(pkg));
  let plugin = path.join(cwd, 'node_modules', '@vizzly-testing', 'fake');
  await mkdir(plugin, { recursive: true });
  await writeFile(
    path.join(plugin, 'package.json'),
    JSON.stringify({
      name: '@vizzly-testing/fake',
      type: 'module',
      vizzlyPlugin: './plugin.js',
    })
  );
  await writeFile(
    path.join(plugin, 'plugin.js'),
    "throw new Error('Plugin must not run during init');"
  );
  let result = await run(cwd, ['--quick']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8')),
    pkg
  );
  await missing(path.join(cwd, '.gitignore'));
  await missing(path.join(cwd, '.agents'));
});

test('existing executable config is preserved without being evaluated', async t => {
  let cwd = await project(t);
  let source =
    "// Preserve my source\nthrow new Error('must not execute');\nexport default {};\n";
  await writeFile(path.join(cwd, 'vizzly.config.ts'), source);
  let result = await run(cwd, ['--quick']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.data.status, 'skipped');
  assert.equal(path.basename(result.data.configPath), 'vizzly.config.ts');
  assert.equal(await readFile(result.data.configPath, 'utf8'), source);
  await missing(path.join(cwd, 'vizzly.config.js'));
});

test('package config outranks JS and force replaces only its vizzly property', async t => {
  let cwd = await project(t);
  let pkg = {
    name: 'fixture',
    scripts: { test: 'keep-me' },
    vizzly: { comparison: { threshold: 7 } },
  };
  let filename = path.join(cwd, 'package.json');
  await writeFile(filename, JSON.stringify(pkg));
  let js = path.join(cwd, 'vizzly.config.js');
  await writeFile(js, 'throw new Error("shadowed config");');
  let first = await run(cwd);
  assert.equal(first.data.configPath, filename);
  let forced = await run(cwd, ['--quick', '--force']);
  assert.equal(forced.code, 0, forced.stderr);
  assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), {
    ...pkg,
    vizzly: {},
  });
  assert.equal(
    await readFile(js, 'utf8'),
    'throw new Error("shadowed config");'
  );
});

test('rc config is recognized and a parent workspace config is not implicitly selected', async t => {
  let cwd = await project(t);
  let parent = path.join(cwd, 'vizzly.config.js');
  await writeFile(parent, 'throw new Error("parent config must not run");');
  let child = path.join(cwd, 'packages', 'app');
  await mkdir(child, { recursive: true });
  let rc = path.join(child, '.vizzlyrc.json');
  await writeFile(rc, '{"comparison":{"threshold":1}}');
  let result = await run(child);
  assert.equal(result.data.configPath, rc);
  await rm(rc);
  result = await run(child);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.data.configPath, path.join(child, 'vizzly.config.js'));
});

test('new explicit config destinations are created in their selected format', async t => {
  let cwd = await project(t);
  let result = await run(cwd, ['--quick', '--config', 'config/visual.json']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(await readFile(result.data.configPath, 'utf8')),
    {}
  );
  await missing(path.join(cwd, 'vizzly.config.js'));
  await missing(path.join(cwd, 'user-state'));
});

test('force can replace malformed standalone config while preserving malformed package source', async t => {
  let cwd = await project(t);
  let filename = path.join(cwd, '.vizzlyrc.json');
  await writeFile(filename, '{unfinished');
  let result = await run(cwd, ['--quick', '--force']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), {});
  await writeFile(path.join(cwd, 'package.json'), '{unfinished package');
  result = await run(cwd, ['--quick', '--force']);
  assert.equal(result.code, 1);
  assert.equal(
    await readFile(path.join(cwd, 'package.json'), 'utf8'),
    '{unfinished package'
  );
});

test('bare nonterminal invocation gives the single-flag shortcut without writes', async t => {
  let cwd = await project(t);
  let result = await run(cwd, [], false);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /vizzly init --quick/);
  assert.deepEqual(await readdir(cwd), []);
});

test('agent setup installs the skill and preserves surrounding guidance', async t => {
  let cwd = await project(t);
  let original = '# My repo\n\nKeep my instructions.\n';
  await writeFile(path.join(cwd, 'AGENTS.md'), original);
  let result = await run(cwd, ['--agent-guidance']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.data.agentSkill.status, 'installed');
  let target = path.join(cwd, '.agents', 'skills', 'vizzly');
  assert.match(
    await readFile(path.join(target, 'SKILL.md'), 'utf8'),
    /name: vizzly/
  );
  let agents = await readFile(path.join(cwd, 'AGENTS.md'), 'utf8');
  assert.ok(agents.startsWith(original.trimEnd()));
  assert.equal(agents.split('<!-- vizzly-agent-guidance -->').length, 2);
  await missing(path.join(cwd, 'user-state'));
});

test('explicit agent setup preserves existing config and refreshes managed guidance', async t => {
  let cwd = await project(t);
  let source = 'export default { comparison: { threshold: 7 } };\n';
  await writeFile(path.join(cwd, 'vizzly.config.js'), source);
  let bare = await run(cwd, [], false);
  assert.equal(bare.code, 0, bare.stderr);
  assert.match(bare.stdout, /Edit this config to change your setup/);
  assert.deepEqual(await readdir(cwd), ['vizzly.config.js']);
  let result = await run(cwd, ['--agent-guidance']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.data.status, 'skipped');
  assert.equal(result.data.agentSkill.status, 'installed');
  assert.equal(
    await readFile(path.join(cwd, 'vizzly.config.js'), 'utf8'),
    source
  );
  let skill = path.join(cwd, '.agents', 'skills', 'vizzly');
  let bundled = await readFile(path.join(skill, 'SKILL.md'), 'utf8');
  await writeFile(path.join(skill, 'SKILL.md'), 'Old skill');
  await writeFile(path.join(skill, 'references', 'ci.md'), 'Old CI reference');
  await writeFile(path.join(skill, 'my-notes.md'), 'Keep my extra file');
  await writeFile(
    path.join(cwd, 'AGENTS.md'),
    '# Keep before\n\n<!-- vizzly-agent-guidance -->\nOld guidance\n<!-- /vizzly-agent-guidance -->\n\nKeep after.\n'
  );
  result = await run(cwd, ['--agent-guidance']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.data.agentSkill.status, 'updated');
  assert.equal(await readFile(path.join(skill, 'SKILL.md'), 'utf8'), bundled);
  assert.equal(
    await readFile(path.join(skill, 'references', 'ci.md'), 'utf8'),
    await readFile(
      path.join(result.data.agentSkill.sourcePath, 'references', 'ci.md'),
      'utf8'
    )
  );
  assert.equal(
    await readFile(path.join(skill, 'my-notes.md'), 'utf8'),
    'Keep my extra file'
  );
  let agents = await readFile(path.join(cwd, 'AGENTS.md'), 'utf8');
  assert.match(agents, /^# Keep before/);
  assert.match(agents, /Visual testing with Vizzly/);
  assert.match(agents, /Keep after\.\n$/);
  assert.doesNotMatch(agents, /Old guidance/);
  assert.equal(
    await readFile(path.join(cwd, 'vizzly.config.js'), 'utf8'),
    source
  );
  let state = JSON.parse(
    await readFile(path.join(cwd, '.vizzly', 'agent-guidance.json'), 'utf8')
  );
  assert.equal(state.version, result.data.agentSkill.version);
  let again = await run(cwd, ['--agent-guidance']);
  assert.equal(again.data.agentSkill.status, 'exists');
  assert.deepEqual(again.data.changes, []);
  await missing(path.join(cwd, 'user-state'));
});

test('skill-only remains skill-only and explicit skip suppresses it', async t => {
  for (let args of [
    ['--agent-skill'],
    ['--agent-skill', '--skip-agent-skill'],
  ]) {
    let cwd = await project(t);
    let result = await run(cwd, args);
    assert.equal(result.code, 0, result.stderr);
    if (args.includes('--skip-agent-skill'))
      await missing(path.join(cwd, '.agents'));
    else
      await access(path.join(cwd, '.agents', 'skills', 'vizzly', 'SKILL.md'));
    await missing(path.join(cwd, 'AGENTS.md'));
  }
});

test('malformed guidance and invalid JSON fail before config or skill writes', async t => {
  let cwd = await project(t);
  await writeFile(
    path.join(cwd, 'AGENTS.md'),
    '<!-- vizzly-agent-guidance -->\n'
  );
  let result = await run(cwd, ['--agent-guidance']);
  assert.equal(result.code, 1);
  await missing(path.join(cwd, 'vizzly.config.js'));
  await missing(path.join(cwd, '.agents'));
  await writeFile(path.join(cwd, '.vizzlyrc.json'), '{invalid');
  result = await run(cwd, ['--quick']);
  assert.equal(result.code, 1);
  await missing(path.join(cwd, 'vizzly.config.js'));
});

test('force never follows a config symlink or writes agent files before preflight', async t => {
  let cwd = await project(t);
  let actual = path.join(cwd, 'actual.js');
  await writeFile(actual, 'export default { keep: true };');
  await symlink(actual, path.join(cwd, 'vizzly.config.js'));
  let result = await run(cwd, ['--quick', '--force', '--agent-guidance']);
  assert.equal(result.code, 1);
  assert.equal(
    await readFile(actual, 'utf8'),
    'export default { keep: true };'
  );
  await missing(path.join(cwd, '.agents'));
});

test('agent setup rejects symlinked parent folders before writing any files', async t => {
  let cwd = await project(t);
  let outside = await project(t);
  await symlink(outside, path.join(cwd, '.agents'));
  let result = await run(cwd, ['--agent-guidance']);
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /will not write through a symlink/);
  assert.deepEqual(await readdir(outside), []);
  assert.deepEqual(await readdir(cwd), ['.agents']);
});

test('guidance metadata rejects symlinked state folders before config or skill writes', async t => {
  let cwd = await project(t);
  let outside = await project(t);
  await symlink(outside, path.join(cwd, '.vizzly'));
  let result = await run(cwd, ['--agent-guidance']);
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /will not write through a symlink/);
  assert.deepEqual(await readdir(outside), []);
  await missing(path.join(cwd, 'vizzly.config.js'));
  await missing(path.join(cwd, '.agents'));
});

test('dangling agent file symlinks fail before config creation', async t => {
  let cwd = await project(t);
  let skill = path.join(cwd, '.agents', 'skills', 'vizzly');
  await mkdir(skill, { recursive: true });
  await symlink(path.join(cwd, 'missing-skill'), path.join(skill, 'SKILL.md'));
  let result = await run(cwd, ['--agent-guidance']);
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /will not replace a symlink/);
  await missing(path.join(cwd, 'vizzly.config.js'));
  await missing(path.join(cwd, 'AGENTS.md'));
  await missing(path.join(cwd, 'missing-skill'));
});

test('explicit config paths also reject symlinked parent folders', async t => {
  let cwd = await project(t);
  let destination = await project(t);
  let outside = await project(t);
  await symlink(outside, path.join(destination, 'linked'));
  let result = await run(cwd, [
    '--config',
    path.join(destination, 'linked', 'visual.json'),
  ]);
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /will not write through a symlink/);
  assert.deepEqual(await readdir(outside), []);
  assert.deepEqual(await readdir(cwd), []);
});

test('read-only guidance preflight prevents otherwise writable config changes', {
  skip: process.platform === 'win32',
}, async t => {
  let cwd = await project(t);
  let filename = path.join(cwd, 'AGENTS.md');
  await writeFile(filename, 'Keep this');
  await chmod(filename, 0o444);
  t.after(() => chmod(filename, 0o644).catch(() => {}));
  let result = await run(cwd, ['--quick', '--agent-guidance']);
  assert.equal(result.code, 1);
  await missing(path.join(cwd, 'vizzly.config.js'));
  await missing(path.join(cwd, '.agents'));
});
