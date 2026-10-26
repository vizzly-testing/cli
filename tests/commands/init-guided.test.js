import assert from 'node:assert/strict';
import { once } from 'node:events';
import { constants } from 'node:fs';
import {
  access,
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { compareSync } from '@vizzly-testing/honeydiff';
import { quoteArgument } from '../../src/init/core.js';

let repository = fileURLToPath(new URL('../../', import.meta.url));
let cli = path.join(repository, 'src', 'cli.js');
let capture = path.join(repository, 'tests', 'fixtures', 'local-capture.js');
let png = path.join(
  repository,
  'tests/reporter/fixtures/images/screenshots/pricing-page.png'
);
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
  'wizard validates answers and config-only completes in a real narrow terminal',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    let result = await wizard(t, cwd, [
      ['Choose [4]', 'invalid\n'],
      ['Choose one of the listed numbers.', '4\n'],
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
      [['Choose [4]', '4\n'], noAgents, noCloud, ['Apply this setup?', 'n\n']],
      [['Choose [4]', '\x04']],
      [['Choose [4]', '\x03']],
    ]) {
      let cwd = await fixture(t);
      let result = await wizard(t, cwd, responses);
      assert.match(result.output, /Setup cancelled/);
      assert.deepEqual(await readdir(cwd), []);
    }
  }
);

ptyTest(
  'folder workflow captures real images and persists supported directory config',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    let folder = "screenshots with 'quotes' and $(literal)";
    await mkdir(path.join(cwd, folder));
    await copyFile(png, path.join(cwd, folder, 'page.png'));
    let result = await wizard(t, cwd, [
      ['Choose [4]', '2\n'],
      ['Screenshots folder', `${folder}\n`],
      noAgents,
      ['Ignore generated', 'n\n'],
      ['Run the selected command', 'y\n'],
      ['Open the generated report', 'n\n'],
      noCloud,
      apply,
    ]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Captured 1 usable screenshot/);
    let { default: config } = await import(path.join(cwd, 'vizzly.config.js'));
    assert.equal(config.upload.screenshotsDir, folder);
    await access(path.join(cwd, '.vizzly', 'report', 'index.html'));
    let data = JSON.parse(
      await readFile(path.join(cwd, '.vizzly', 'report-data.json'), 'utf8')
    );
    let current = path.join(
      cwd,
      '.vizzly',
      data.comparisons[0].current.replace('/images/', '')
    );
    assert.ok(compareSync(current, current).images.current.width > 0);
  }
);

ptyTest(
  'an existing test command with zero captures is reported as unverified',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    let command = `${quoteArgument(process.execPath)} -e "process.exitCode=0"`;
    let result = await wizard(t, cwd, [
      ['Choose [4]', '1\n'],
      ['Screenshot-producing test command', `${command}\n`],
      noAgents,
      ['Ignore generated', 'n\n'],
      ['Run the selected command', 'y\n'],
      ['Open the generated report', 'n\n'],
      noCloud,
      apply,
    ]);
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /without capturing screenshots/);
    assert.doesNotMatch(result.output, /Captured \d+ usable/);
  }
);

ptyTest(
  'script collisions fail before config edits and preserve existing commands',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    let pkg = {
      packageManager: 'npm@11.0.0',
      devDependencies: { '@vizzly-testing/cli': '*' },
      scripts: { e2e: 'my-tests', 'test:visual': 'keep-this' },
    };
    let source = JSON.stringify(pkg);
    await writeFile(path.join(cwd, 'package.json'), source);
    let result = await wizard(t, cwd, [
      ['Choose [4]', '1\n'],
      ['Screenshot-producing test command', 'npm run e2e\n'],
      noAgents,
      ['Add a separate visual-test package script', 'y\n'],
      ['Visual script name', 'test:visual\n'],
    ]);
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /already exists/);
    assert.equal(
      await readFile(path.join(cwd, 'package.json'), 'utf8'),
      source
    );
    await assert.rejects(access(path.join(cwd, 'vizzly.config.js')), {
      code: 'ENOENT',
    });
  }
);

ptyTest(
  'existing tests produce real capture evidence without rewriting their source',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    let source =
      '// My executable config\nexport default { comparison: { threshold: 1 } };\n';
    await writeFile(path.join(cwd, 'vizzly.config.js'), source);
    let command = `${quoteArgument(process.execPath)} ${quoteArgument(capture)} valid`;
    let result = await wizard(t, cwd, [
      ['Choose [4]', '1\n'],
      ['Screenshot-producing test command', `${command}\n`],
      noAgents,
      ['Ignore generated', 'n\n'],
      ['Run the selected command', 'y\n'],
      ['Open the generated report', 'n\n'],
      noCloud,
      apply,
    ]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Captured 1 usable screenshot/);
    assert.equal(
      await readFile(path.join(cwd, 'vizzly.config.js'), 'utf8'),
      source
    );
  }
);

ptyTest(
  'generated Playwright example visits the actual app and captures a decodable screenshot',
  { timeout: 60000 },
  async t => {
    let cwd = await fixture(t);
    let server = http.createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        '<!doctype html><html><body><h1>My fixture app</h1></body></html>'
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => server.close(resolve)));
    let url = `http://127.0.0.1:${server.address().port}/settings`;
    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        type: 'module',
        packageManager: 'npm@11.0.0',
        devDependencies: {
          '@playwright/test': '*',
          '@vizzly-testing/cli': '*',
        },
      })
    );
    await mkdir(path.join(cwd, 'node_modules', '@playwright'), {
      recursive: true,
    });
    await mkdir(path.join(cwd, 'node_modules', '@vizzly-testing'), {
      recursive: true,
    });
    await symlink(
      path.join(repository, 'node_modules', '@playwright/test'),
      path.join(cwd, 'node_modules/@playwright/test')
    );
    await symlink(
      repository,
      path.join(cwd, 'node_modules/@vizzly-testing/cli')
    );
    await mkdir(path.join(cwd, 'node_modules', '.bin'));
    await symlink(
      path.join(repository, 'node_modules', '@playwright', 'test', 'cli.js'),
      path.join(cwd, 'node_modules', '.bin', 'playwright')
    );
    await writeFile(
      path.join(cwd, 'playwright.config.js'),
      "export default { testDir: './visual', reporter: 'line', use: { headless: true } };\n"
    );
    let result = await wizard(t, cwd, [
      ['Choose [4]', '3\n'],
      ['Existing Playwright test directory', 'visual\n'],
      ['App page URL', `${url}\n`],
      noAgents,
      ['Ignore generated', 'n\n'],
      ['Run the selected command', 'y\n'],
      ['Open the generated report', 'n\n'],
      noCloud,
      apply,
    ]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Captured 1 usable screenshot/);
    assert.match(
      await readFile(path.join(cwd, 'visual', 'vizzly.spec.js'), 'utf8'),
      /screenshot capture must succeed/
    );
    let report = JSON.parse(
      await readFile(path.join(cwd, '.vizzly', 'report-data.json'), 'utf8')
    );
    assert.equal(report.comparisons[0].name, 'app-page');
    let current = path.join(
      cwd,
      '.vizzly',
      report.comparisons[0].current.replace('/images/', '')
    );
    assert.ok(compareSync(current, current).images.current.width > 0);
  }
);

ptyTest(
  'Playwright examples cannot be written outside the selected project',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    let result = await wizard(t, cwd, [
      ['Choose [4]', '3\n'],
      ['Existing Playwright test directory', '../outside\n'],
      ['App page URL', 'http://127.0.0.1:3000/\n'],
    ]);
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /inside this project/);
    assert.deepEqual(await readdir(cwd), []);
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
        ['Choose [4]', '4\n'],
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
