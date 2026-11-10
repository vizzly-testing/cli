import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  access,
  chmod,
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveFixtureAuth } from '../../helpers/auth-session.js';
import {
  terminalFixture as fixture,
  terminalTest as ptyTest,
  runTerminal as wizard,
} from '../../helpers/terminal-runner.js';

let repository = fileURLToPath(new URL('../../..', import.meta.url));
let cli = path.join(repository, 'bin', 'vizzly.js');
let noAgents = ['Add the Vizzly skill', 'n\n'];
let noCloud = ['Connect this repository', 'n\n'];
let apply = ['Apply this setup?', 'y\n'];

ptyTest(
  'accepting a CLI update uses its owning package manager and refreshes the newly installed guidance',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    let packageRoot = path.join(cwd, 'node_modules', '@vizzly-testing', 'cli');
    await mkdir(packageRoot, { recursive: true });
    await cp(path.join(repository, 'src'), path.join(packageRoot, 'dist'), {
      recursive: true,
    });
    await cp(path.join(repository, 'bin'), path.join(packageRoot, 'bin'), {
      recursive: true,
    });
    await cp(
      path.join(repository, 'skills'),
      path.join(packageRoot, 'skills'),
      { recursive: true }
    );
    await cp(
      path.join(repository, 'package.json'),
      path.join(packageRoot, 'package.json')
    );
    await symlink(
      path.join(repository, 'node_modules'),
      path.join(packageRoot, 'node_modules'),
      'dir'
    );
    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        type: 'module',
        packageManager: 'npm@11.0.0',
        devDependencies: { '@vizzly-testing/cli': '0.39.0' },
      })
    );
    let entry = path.join(packageRoot, 'dist', 'adapters', 'cli', 'cli.js');
    let initial = await wizard(
      t,
      cwd,
      [],
      {},
      ['init', '--agent-guidance', '--json'],
      entry
    );
    assert.equal(initial.code, 0, initial.output);
    let config = await readFile(path.join(cwd, 'vizzly.config.js'), 'utf8');
    await updateCache(cwd, { latestVersion: '999.0.0' });
    let bin = path.join(cwd, 'bin');
    await mkdir(bin);
    let installer = path.join(bin, 'npm.js');
    let recordRun = `import { appendFileSync as recordUpdateRun } from 'node:fs';\nrecordUpdateRun(${JSON.stringify(path.join(cwd, 'updated-runs.jsonl'))}, JSON.stringify(process.argv.slice(2)) + '\\n');\n`;
    await writeFile(
      installer,
      `#!/usr/bin/env node
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
let root = ${JSON.stringify(packageRoot)};
await writeFile(${JSON.stringify(path.join(cwd, 'installer-call.json'))}, JSON.stringify(process.argv.slice(2)));
if (process.env.UPDATE_INSTALL_FAILURE === '1') process.exit(1);
let manifest = path.join(root, 'package.json');
let pkg = JSON.parse(await readFile(manifest, 'utf8'));
pkg.version = '999.0.0';
await writeFile(manifest, JSON.stringify(pkg));
await appendFile(path.join(root, 'skills', 'vizzly', 'SKILL.md'), '\\nNew bundled guidance.\\n');
let entry = path.join(root, 'dist', 'adapters', 'cli', 'cli.js');
await writeFile(entry, (await readFile(entry, 'utf8')).replace('\\n', '\\n' + ${JSON.stringify(recordRun)}));
`
    );
    await chmod(installer, 0o755);
    await symlink(installer, path.join(bin, 'npm'));
    let failedInstall = await wizard(
      t,
      cwd,
      [['Apply available Vizzly updates now?', 'y\n']],
      {
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        UPDATE_INSTALL_FAILURE: '1',
      },
      ['config'],
      entry
    );
    assert.equal(failedInstall.code, 0, failedInstall.output);
    assert.match(failedInstall.output, /Could not apply the Vizzly update/);
    assert.match(failedInstall.output, /Server/);
    let afterFailure = await wizard(t, cwd, [], {}, ['config'], entry);
    assert.equal(afterFailure.code, 0, afterFailure.output);
    assert.doesNotMatch(
      afterFailure.output,
      /is available|Apply available Vizzly updates/
    );
    await updateCache(cwd, { latestVersion: '999.0.0' });
    let result = await wizard(
      t,
      cwd,
      [['Apply available Vizzly updates now?', 'y\n']],
      { PATH: `${bin}${path.delimiter}${process.env.PATH}` },
      ['config', 'missing-key'],
      entry
    );
    assert.equal(result.code, 1, result.output);
    assert.match(
      result.output,
      /Apply: npm install --save-dev --save-exact @vizzly-testing\/cli@999\.0\.0/
    );
    assert.match(result.output, /Vizzly update applied/);
    assert.match(result.output, /missing-key/);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(cwd, 'installer-call.json'), 'utf8')),
      ['install', '--save-dev', '--save-exact', '@vizzly-testing/cli@999.0.0']
    );
    assert.match(
      await readFile(
        path.join(cwd, '.agents', 'skills', 'vizzly', 'SKILL.md'),
        'utf8'
      ),
      /New bundled guidance/
    );
    assert.equal(
      JSON.parse(
        await readFile(path.join(cwd, '.vizzly', 'agent-guidance.json'), 'utf8')
      ).cliVersion,
      '999.0.0'
    );
    assert.equal(
      await readFile(path.join(cwd, 'vizzly.config.js'), 'utf8'),
      config
    );
    let runs = (await readFile(path.join(cwd, 'updated-runs.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    assert.deepEqual(
      runs.find(args => args.includes('config')),
      ['--no-update-notifier', 'config', 'missing-key', '--no-color']
    );
    let again = await wizard(t, cwd, [], {}, ['config'], entry);
    assert.equal(again.code, 0, again.output);
    assert.match(again.output, /Server/);
    assert.doesNotMatch(
      again.output,
      /is available|Apply available Vizzly updates/
    );
  }
);

ptyTest(
  'accepting a skill refresh applies this update and keeps config intact',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    await wizard(t, cwd, [], {}, ['init', '--agent-guidance', '--json']);
    await updateCache(cwd);
    let skill = path.join(cwd, '.agents', 'skills', 'vizzly', 'SKILL.md');
    let original = await readFile(skill, 'utf8');
    let config = await readFile(path.join(cwd, 'vizzly.config.js'), 'utf8');
    await writeFile(skill, 'Old skill');
    await writeFile(
      path.join(cwd, '.vizzly', 'agent-guidance.json'),
      JSON.stringify({ version: 'old', cliVersion: '0.1.0' })
    );
    let result = await wizard(
      t,
      cwd,
      [['Apply available Vizzly updates now?', 'y\n']],
      {},
      ['config']
    );
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Vizzly update applied/);
    assert.equal(await readFile(skill, 'utf8'), original);
    assert.equal(
      await readFile(path.join(cwd, 'vizzly.config.js'), 'utf8'),
      config
    );
    let again = await wizard(t, cwd, [], {}, ['config']);
    assert.doesNotMatch(
      again.output,
      /guidance has an update|Apply available Vizzly updates/
    );
  }
);

ptyTest(
  'EOF and Ctrl-C skip the update prompt and continue the requested command',
  { timeout: 30000 },
  async t => {
    for (let answer of ['\x04', '\x03']) {
      let cwd = await fixture(t);
      await wizard(t, cwd, [], {}, ['init', '--agent-skill', '--json']);
      await updateCache(cwd);
      let skill = path.join(cwd, '.agents', 'skills', 'vizzly', 'SKILL.md');
      await writeFile(skill, 'Old skill');
      await rm(path.join(cwd, '.vizzly', 'agent-guidance.json'));
      let result = await wizard(
        t,
        cwd,
        [['Apply available Vizzly updates now?', answer]],
        {},
        ['config']
      );
      assert.equal(result.code, 0, result.output);
      assert.match(result.output, /Server/);
      assert.equal(await readFile(skill, 'utf8'), 'Old skill');
      let again = await wizard(t, cwd, [], {}, ['config']);
      assert.doesNotMatch(again.output, /Apply available Vizzly updates/);
    }
  }
);

async function updateCache(cwd, state = {}) {
  let directory = path.join(cwd, 'user-state');
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'updates.json'),
    JSON.stringify({ lastCheckedAt: Date.now(), ...state })
  );
}

ptyTest(
  'commands run during silent update checks, show new versions before exit, and check only once a day',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    await updateCache(cwd, { lastCheckedAt: 0 });
    let pendingResponse;
    let receiveRequest;
    let requestReceived = new Promise(resolve => {
      receiveRequest = resolve;
    });
    let calls = 0;
    let server = http.createServer((_request, response) => {
      calls++;
      pendingResponse = response;
      receiveRequest();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    let preload = path.join(cwd, 'registry.js');
    await writeFile(
      preload,
      `let registryFetch = globalThis.fetch;
globalThis.fetch = (_url, options) => registryFetch('http://127.0.0.1:${server.address().port}/latest', options);\n`
    );
    let commandFinished;
    let commandOutput = new Promise(resolve => {
      commandFinished = resolve;
    });
    let firstCommand = wizard(
      t,
      cwd,
      [],
      { NODE_OPTIONS: `--import=${preload}` },
      ['config'],
      cli,
      output => {
        if (output.includes('Use --verbose')) commandFinished(output);
      }
    );
    let [, output] = await Promise.all([requestReceived, commandOutput]);
    assert.doesNotMatch(output, /Checking for Vizzly updates|is available/);
    pendingResponse.end(JSON.stringify({ version: '999.0.0' }));
    let first = await firstCommand;
    assert.equal(first.code, 0, first.output);
    assert.match(first.output, /Vizzly 999\.0\.0 is available/);
    assert.ok(
      first.output.indexOf('Use --verbose') <
        first.output.indexOf('Vizzly 999.0.0 is available'),
      first.output
    );
    assert.doesNotMatch(first.output, /Checking for Vizzly updates/);
    let environment = { NODE_OPTIONS: `--import=${preload}` };
    let result = await wizard(t, cwd, [], environment, ['config']);
    assert.equal(result.code, 0, result.output);
    assert.doesNotMatch(
      result.output,
      /is available|Checking for Vizzly updates/
    );
    assert.equal(calls, 1);

    let filename = path.join(cwd, 'user-state', 'updates.json');
    let state = JSON.parse(await readFile(filename, 'utf8'));
    state.lastCheckedAt = Date.now() - 24 * 60 * 60 * 1000;
    await writeFile(filename, JSON.stringify(state));
    let nextRequest = new Promise(resolve => {
      receiveRequest = resolve;
    });
    let nextCommand = wizard(t, cwd, [], environment, ['config']);
    await nextRequest;
    pendingResponse.end(JSON.stringify({ version: '999.0.0' }));
    let next = await nextCommand;
    assert.equal(next.code, 0, next.output);
    assert.doesNotMatch(
      next.output,
      /is available|Checking for Vizzly updates/
    );
    assert.equal(calls, 2);
  }
);

ptyTest(
  'failed commands wait for pending checks to cache results without changing their exit status',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    let pendingResponse;
    let receiveRequest;
    let requestReceived = new Promise(resolve => {
      receiveRequest = resolve;
    });
    let server = http.createServer((_request, response) => {
      pendingResponse = response;
      receiveRequest();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    let preload = path.join(cwd, 'registry.js');
    await writeFile(
      preload,
      `let registryFetch = globalThis.fetch;
globalThis.fetch = (_url, options) => registryFetch('http://127.0.0.1:${server.address().port}/latest', options);\n`
    );
    for (let args of [
      ['config', 'missing-key'],
      ['upload', path.join(cwd, 'missing-directory')],
    ]) {
      await updateCache(cwd, { lastCheckedAt: 0 });
      requestReceived = new Promise(resolve => {
        receiveRequest = resolve;
      });
      let commandFailed;
      let commandOutput = new Promise(resolve => {
        commandFailed = resolve;
      });
      let command = wizard(
        t,
        cwd,
        [],
        { NODE_OPTIONS: `--import=${preload}` },
        args,
        cli,
        output => {
          if (output.includes('missing-')) commandFailed(output);
        }
      );
      await Promise.all([requestReceived, commandOutput]);
      pendingResponse.end(JSON.stringify({ version: '999.0.0' }));
      let result = await command;
      assert.equal(result.code, 1, result.output);
      assert.doesNotMatch(
        result.output,
        /is available|Checking for Vizzly updates|Apply available Vizzly updates/
      );
      let state = JSON.parse(
        await readFile(path.join(cwd, 'user-state', 'updates.json'), 'utf8')
      );
      assert.equal(state.latestVersion, '999.0.0');
      assert.equal(state.notifiedCliVersion, undefined);
    }
  }
);

ptyTest(
  'up-to-date versions and failed update checks stay silent and preserve command output',
  { timeout: 30000 },
  async t => {
    let { version } = JSON.parse(
      await readFile(path.join(repository, 'package.json'), 'utf8')
    );
    for (let response of [
      `return new Response(JSON.stringify({ version: '${version}' }));`,
      "return new Response('unavailable', { status: 503 });",
      "throw new Error('offline');",
    ]) {
      let cwd = await fixture(t);
      let preload = path.join(cwd, 'registry.js');
      await writeFile(
        preload,
        `globalThis.fetch = async () => { ${response} };\n`
      );
      let result = await wizard(
        t,
        cwd,
        [],
        { NODE_OPTIONS: `--import=${preload}` },
        ['config']
      );
      assert.equal(result.code, 0, result.output);
      assert.match(result.output, /Use --verbose/);
      assert.doesNotMatch(
        result.output,
        /is available|Checking for Vizzly updates|offline|unavailable/
      );
    }
  }
);

ptyTest(
  'update notices are on by default, use the correct refresh command, and do not repeat',
  { timeout: 30000 },
  async t => {
    for (let flag of ['--agent-skill', '--agent-guidance']) {
      let cwd = await fixture(t);
      let installed = await wizard(t, cwd, [], {}, ['init', flag, '--json']);
      assert.equal(installed.code, 0, installed.output);
      await updateCache(cwd, { latestVersion: '999.0.0' });
      let filename = path.join(cwd, '.vizzly', 'agent-guidance.json');
      await writeFile(
        filename,
        JSON.stringify({ version: 'old', cliVersion: '0.1.0' })
      );
      let first = await wizard(
        t,
        cwd,
        [['Apply available Vizzly updates now?', 'n\n']],
        {},
        ['config']
      );
      assert.equal(first.code, 0, first.output);
      assert.match(first.output, /Vizzly 999\.0\.0 is available/);
      assert.ok(first.output.includes(`vizzly init ${flag}`), first.output);
      assert.match(first.output, /Server/);
      let again = await wizard(t, cwd, [], {}, ['config']);
      assert.equal(again.code, 0, again.output);
      assert.doesNotMatch(again.output, /is available|guidance has an update/);
      let refresh = await wizard(t, cwd, [], {}, ['init', flag, '--json']);
      assert.equal(refresh.code, 0, refresh.output);
      let afterRefresh = await wizard(t, cwd, [], {}, ['config']);
      assert.doesNotMatch(afterRefresh.output, /guidance has an update/);
      let metadata = JSON.parse(await readFile(filename, 'utf8'));
      assert.equal(metadata.notifiedVersion, undefined);
    }
  }
);

ptyTest(
  'update notices do not require or install agent guidance',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    await updateCache(cwd, { latestVersion: '999.0.0' });
    let result = await wizard(t, cwd, [], {}, ['config']);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Vizzly 999\.0\.0 is available/);
    assert.doesNotMatch(result.output, /guidance has an update/);
    await assert.rejects(access(path.join(cwd, '.agents')), { code: 'ENOENT' });
    await assert.rejects(access(path.join(cwd, '.vizzly')), { code: 'ENOENT' });
  }
);

ptyTest(
  'JSON, CI, opt-outs, and quiet log levels skip notifications without consuming them',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    await updateCache(cwd, { latestVersion: '999.0.0' });
    let filename = path.join(cwd, 'user-state', 'updates.json');
    let before = await readFile(filename, 'utf8');
    for (let { args, env } of [
      { args: ['config', '--json'] },
      { args: ['--json', 'config'] },
      { args: ['config'], env: { CI: 'true' } },
      { args: ['config'], env: { NO_UPDATE_NOTIFIER: '1' } },
      { args: ['config'], env: { VIZZLY_NO_UPDATE_NOTIFIER: '1' } },
      { args: ['config', '--no-update-notifier'] },
      { args: ['config', '--log-level', 'warn'] },
    ]) {
      let result = await wizard(t, cwd, [], env, args);
      assert.equal(result.code, 0, result.output);
      assert.doesNotMatch(
        result.output,
        /is available|Checking for Vizzly updates/
      );
      assert.equal(await readFile(filename, 'utf8'), before);
    }
  }
);

ptyTest(
  'missing guidance metadata detects old skills without warning on current unmarked copies',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    await wizard(t, cwd, [], {}, ['init', '--agent-skill', '--json']);
    await updateCache(cwd);
    let metadata = path.join(cwd, '.vizzly', 'agent-guidance.json');
    await rm(metadata);
    let current = await wizard(t, cwd, [], {}, ['config']);
    assert.doesNotMatch(current.output, /guidance has an update/);
    await writeFile(
      path.join(cwd, '.agents', 'skills', 'vizzly', 'SKILL.md'),
      'Old skill'
    );
    let stale = await wizard(
      t,
      cwd,
      [['Apply available Vizzly updates now?', 'n\n']],
      {},
      ['config']
    );
    assert.match(stale.output, /vizzly init --agent-skill/);
    assert.equal(stale.code, 0, stale.output);
  }
);

ptyTest(
  'notice metadata failures leave command output and exit status intact',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    await updateCache(cwd, { latestVersion: '999.0.0' });
    let filename = path.join(cwd, 'user-state', 'updates.json');
    await chmod(filename, 0o444);
    t.after(() => chmod(filename, 0o644).catch(() => {}));
    let result = await wizard(t, cwd, [], {}, ['config']);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Server/);
    assert.doesNotMatch(result.output, /is available|EACCES/);
  }
);

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
      '.vizzly',
      'AGENTS.md',
      'package.json',
      'vizzly.config.js',
    ]);
  }
);

ptyTest(
  'cloud linking after local setup saves a destination without issuing credentials',
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
      if (request.url.startsWith('/api/sdk/projects')) {
        response.end(
          JSON.stringify({
            projects: [
              {
                id: 'db429384-7714-47b3-a6c2-2003b9340449',
                name: 'Fixture app',
                slug: 'fixture-app',
                organizationSlug: 'fixture-org',
              },
            ],
            meta: { total: 1, limit: 10, offset: 0, hasMore: false },
          })
        );
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ error: 'Unexpected fixture request' }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => server.close(resolve)));
    await mkdir(path.join(cwd, 'user-state'));
    let apiUrl = `http://127.0.0.1:${server.address().port}`;
    await saveFixtureAuth(path.join(cwd, 'user-state'), apiUrl, {
      accessToken: 'fixture-user-login',
    });
    let result = await wizard(
      t,
      cwd,
      [
        noAgents,
        ['Connect this repository', 'y\n'],
        apply,
        ['Choose project number or action', '1\n'],
      ],
      { VIZZLY_API_URL: apiUrl }
    );
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(calls, ['/api/sdk/projects?limit=10&offset=0']);
    let source = await readFile(path.join(cwd, 'vizzly.config.js'), 'utf8');
    assert.doesNotMatch(source, /fixture-private-token/);
    let { default: config } = await import(path.join(cwd, 'vizzly.config.js'));
    assert.equal(config.project, undefined);
    let linked = JSON.parse(
      await readFile(path.join(cwd, 'vizzly.project.json'), 'utf8')
    );
    assert.deepEqual(linked, {
      version: 1,
      apiOrigin: apiUrl,
      projectId: 'db429384-7714-47b3-a6c2-2003b9340449',
    });
    assert.match(result.output, /Linked db429384-7714-47b3-a6c2-2003b9340449/);
  }
);
