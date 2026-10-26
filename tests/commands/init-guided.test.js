import assert from 'node:assert/strict';
import { once } from 'node:events';
import { constants } from 'node:fs';
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

let repository = fileURLToPath(new URL('../../', import.meta.url));
let cli = path.join(repository, 'src', 'cli.js');
// Use tui-driver's optional PTY backend directly so tests wait on output events
// instead of the visual driver's screen-stability polling.
let pty;
let ptyFixture;
try {
  let resolve = createRequire(import.meta.resolve('tui-driver'));
  let entry = resolve.resolve('node-pty');
  if (process.platform === 'darwin') {
    let directory = path.dirname(path.dirname(entry));
    let helper = path.join(
      'prebuilds',
      `darwin-${process.arch}`,
      'spawn-helper'
    );
    try {
      await access(path.join(directory, helper), constants.X_OK);
    } catch (error) {
      if (error.code === 'EACCES') {
        // Some package caches lose this helper's executable bit. Repair an
        // isolated dependency copy; tests must not modify installed modules.
        ptyFixture = await mkdtemp(path.join(tmpdir(), 'vizzly-pty-backend-'));
        let copy = path.join(ptyFixture, 'node_modules', 'node-pty');
        await cp(directory, copy, { recursive: true });
        await chmod(path.join(copy, helper), 0o755);
        entry = path.join(copy, 'lib', 'index.js');
      } else if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  pty = (await import(entry)).default;
} catch {
  /* The optional native test dependency is unavailable. */
}
after(async () => {
  if (ptyFixture) await rm(ptyFixture, { recursive: true, force: true });
});
let ptyTest = pty ? test : test.skip;

async function fixture(t) {
  let cwd = await realpath(
    await mkdtemp(path.join(tmpdir(), 'vizzly-guided-'))
  );
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}

function wizard(t, cwd, responses, environment = {}) {
  let env = { ...process.env, TERM: 'dumb', COLUMNS: '40', NO_COLOR: '1' };
  for (let name of Object.keys(env)) {
    if (
      name.startsWith('VIZZLY_') ||
      ['CI', 'NODE_V8_COVERAGE', 'FORCE_COLOR'].includes(name)
    )
      delete env[name];
  }
  env.VIZZLY_HOME = path.join(cwd, 'user-state');
  env.VIZZLY_DISABLE_KEYCHAIN = 'true';
  Object.assign(env, environment);
  let child = pty.spawn(process.execPath, [cli, 'init', '--no-color'], {
    cwd,
    env,
    name: 'dumb',
    cols: 40,
    rows: 24,
  });
  let exited = false;
  t.after(() => {
    if (!exited) child.kill();
  });
  return new Promise((resolve, reject) => {
    let output = '';
    let pending = '';
    let index = 0;
    let receive = chunk => {
      let value = chunk.toString();
      output += value;
      pending += value;
      while (index < responses.length) {
        let [marker, answer] = responses[index];
        let position = pending.indexOf(marker);
        if (position < 0) break;
        pending = pending.slice(position + marker.length);
        index++;
        child.write(answer);
      }
    };
    child.onData(receive);
    child.onExit(({ exitCode: code }) => {
      exited = true;
      if (index !== responses.length)
        reject(new Error(`Wizard ended before prompt ${index}: ${output}`));
      else resolve({ code, output });
    });
  });
}

let noAgents = ['Add the Vizzly skill', 'n\n'];
let noCloud = ['Connect this repository', 'n\n'];
let apply = ['Apply this setup?', 'y\n'];

ptyTest(
  'wizard validates answers and creates config in a real narrow terminal',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    let result = await wizard(t, cwd, [
      ['Add the Vizzly skill', 'maybe\n'],
      ['Enter yes or no.', 'n\n'],
      noCloud,
      apply,
    ]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Config created/);
    assert.equal(result.output.includes('\x1b['), false);
    assert.deepEqual(await readdir(cwd), ['vizzly.config.js']);
  }
);

ptyTest(
  'declining preview, terminal EOF and Ctrl-C cancel before writes',
  { timeout: 30000 },
  async t => {
    for (let responses of [
      [noAgents, noCloud, ['Apply this setup?', 'n\n']],
      [['Add the Vizzly skill', '\x04']],
      [['Add the Vizzly skill', '\x03']],
    ]) {
      let cwd = await fixture(t);
      let result = await wizard(t, cwd, responses);
      assert.match(result.output, /Setup cancelled/);
      assert.deepEqual(await readdir(cwd), []);
    }
  }
);

ptyTest(
  'an initialized project stops without prompting, evaluating config, or changing files',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    let source =
      "throw new Error('init must not evaluate config');\nexport default {};\n";
    await writeFile(path.join(cwd, 'vizzly.config.js'), source);
    let result = await wizard(t, cwd, []);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Existing config preserved/);
    assert.doesNotMatch(
      result.output,
      /Add the Vizzly skill|Connect this repository/
    );
    assert.equal(
      await readFile(path.join(cwd, 'vizzly.config.js'), 'utf8'),
      source
    );
    assert.deepEqual(await readdir(cwd), ['vizzly.config.js']);
  }
);

ptyTest(
  'guided agent setup leaves app dependencies and test commands unchanged',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    let source = JSON.stringify({
      name: 'client-project',
      scripts: { test: 'existing-test-command' },
      devDependencies: {
        '@vizzly-testing/storybook': '*',
        '@vizzly-testing/vitest': '*',
      },
    });
    await writeFile(path.join(cwd, 'package.json'), source);
    let result = await wizard(t, cwd, [
      ['Add the Vizzly skill', 'y\n'],
      noCloud,
      apply,
    ]);
    assert.equal(result.code, 0, result.output);
    assert.equal(
      await readFile(path.join(cwd, 'package.json'), 'utf8'),
      source
    );
    assert.match(
      await readFile(
        path.join(cwd, '.agents', 'skills', 'vizzly', 'SKILL.md'),
        'utf8'
      ),
      /name: vizzly/
    );
    assert.match(
      await readFile(path.join(cwd, 'AGENTS.md'), 'utf8'),
      /Visual testing with Vizzly/
    );
    assert.deepEqual((await readdir(cwd)).sort(), [
      '.agents',
      'AGENTS.md',
      'package.json',
      'vizzly.config.js',
    ]);
  }
);

ptyTest(
  'cloud linking after local setup saves repository identity and keeps credentials in user storage',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    let calls = [];
    let server = http.createServer(async (request, response) => {
      for await (let _chunk of request) {
        /* consume the external request body */
      }
      calls.push(request.url);
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({
          organization: { slug: 'fixture-org' },
          project: { slug: 'fixture-app' },
          token: {
            id: 'fixture-id',
            token: 'fixture-private-token',
            token_prefix: 'fixture-prefix',
          },
        })
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await mkdir(path.join(cwd, 'user-state'));
    await writeFile(
      path.join(cwd, 'user-state', 'config.json'),
      JSON.stringify({ auth: { accessToken: 'fixture-user-login' } })
    );
    let apiUrl = `http://127.0.0.1:${server.address().port}`;
    let result = await wizard(
      t,
      cwd,
      [
        noAgents,
        ['Connect this repository', 'y\n'],
        ['Project (organization/project)', 'fixture-org/fixture-app\n'],
        apply,
      ],
      { VIZZLY_API_URL: apiUrl }
    );
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(calls, ['/api/cli/fixture-app/link-token']);
    let source = await readFile(path.join(cwd, 'vizzly.config.js'), 'utf8');
    assert.doesNotMatch(source, /fixture-private-token/);
    let { default: config } = await import(path.join(cwd, 'vizzly.config.js'));
    assert.equal(config.apiUrl, apiUrl);
    assert.deepEqual(config.project, {
      organizationSlug: 'fixture-org',
      projectSlug: 'fixture-app',
    });
    assert.match(result.output, /Linked fixture-org\/fixture-app/);
  }
);
