import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { isNewerStableVersion } from '../../../src/domains/updates/update-notifications.js';

let exec = promisify(execFile);
let worker = fileURLToPath(
  new URL('../../../src/domains/updates/update-check.js', import.meta.url)
);
let cli = fileURLToPath(new URL('../../../src/cli.js', import.meta.url));

async function fixture(t) {
  let cwd = await mkdtemp(path.join(tmpdir(), 'vizzly-update-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  let home = path.join(cwd, 'home');
  await mkdir(home);
  let env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    VIZZLY_HOME: home,
    VIZZLY_DISABLE_KEYCHAIN: 'true',
    DOTENV_CONFIG_PATH: '/dev/null',
  };
  return { cwd, home, env };
}

test('version notices compare numeric release versions and never suggest prereleases or downgrades', () => {
  for (let [candidate, current, expected] of [
    ['0.40.0', '0.39.0', true],
    ['0.100.0', '0.99.0', true],
    ['1.0.0', '0.99.99', true],
    ['1.0.1', '1.0.0', true],
    ['1.0.0', '1.0.0-beta.1', true],
    ['0.39.0', '0.39.0', false],
    ['0.39.0', '0.40.0', false],
    ['1.0.0-beta.1', '0.39.0', false],
    ['not a version', '0.39.0', false],
    [undefined, '0.39.0', false],
  ])
    assert.equal(
      isNewerStableVersion(candidate, current),
      expected,
      `${candidate} vs ${current}`
    );
});

test('background worker caches the public registry version and preserves preferences', async t => {
  let { cwd, home, env } = await fixture(t);
  let filename = path.join(home, 'updates.json');
  await writeFile(
    filename,
    JSON.stringify({ lastCheckedAt: 123, preference: 'keep' })
  );
  let preload = path.join(cwd, 'registry.js');
  await writeFile(
    preload,
    `import { writeFile } from 'node:fs/promises';
globalThis.fetch = async (url, options) => {
  await writeFile(${JSON.stringify(path.join(cwd, 'request.json'))}, JSON.stringify({ url, hasDeadline: Boolean(options.signal), headers: options.headers }));
  return new Response(JSON.stringify({ version: '999.0.0' }));
};\n`
  );
  let result = await exec(process.execPath, ['--import', preload, worker], {
    cwd,
    env,
  });
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), {
    lastCheckedAt: 123,
    preference: 'keep',
    latestVersion: '999.0.0',
  });
  let request = JSON.parse(
    await readFile(path.join(cwd, 'request.json'), 'utf8')
  );
  assert.equal(
    request.url,
    'https://registry.npmjs.org/%40vizzly-testing%2Fcli/latest'
  );
  assert.equal(request.hasDeadline, true);
  assert.equal(request.headers, undefined);
});

test('registry failures and invalid versions leave cached results untouched and exit successfully', async t => {
  for (let response of [
    "throw new Error('offline');",
    "return new Response('unavailable', { status: 503 });",
    "return new Response('invalid json');",
    "return new Response(JSON.stringify({ version: 'next' }));",
    "return new Response(JSON.stringify({ version: '1.0.0-beta.1' }));",
  ]) {
    let { cwd, home, env } = await fixture(t);
    let filename = path.join(home, 'updates.json');
    let before = JSON.stringify({ latestVersion: '0.39.0' });
    await writeFile(filename, before);
    let preload = path.join(cwd, 'registry.js');
    await writeFile(
      preload,
      `globalThis.fetch = async () => { ${response} };\n`
    );
    let result = await exec(process.execPath, ['--import', preload, worker], {
      cwd,
      env,
    });
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.equal(await readFile(filename, 'utf8'), before);
  }
});

test('piped command output and errors retain their exit codes without consuming update notices', async t => {
  let { cwd, home, env } = await fixture(t);
  let filename = path.join(home, 'updates.json');
  let before = JSON.stringify({ latestVersion: '999.0.0', lastCheckedAt: 0 });
  await writeFile(filename, before);
  let result = await exec(process.execPath, [cli, 'config'], { cwd, env });
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /is available|Checking for Vizzly updates/
  );
  assert.equal(await readFile(filename, 'utf8'), before);
  await assert.rejects(
    exec(process.execPath, [cli, 'config', 'missing-key'], { cwd, env }),
    error => {
      assert.equal(error.code, 1);
      assert.doesNotMatch(
        error.stdout + error.stderr,
        /is available|Checking for Vizzly updates/
      );
      return true;
    }
  );
  assert.equal(await readFile(filename, 'utf8'), before);
});
