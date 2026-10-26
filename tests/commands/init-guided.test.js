import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
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
  symlink,
  writeFile,
} from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { compareSync } from '@vizzly-testing/honeydiff';

let repository = fileURLToPath(new URL('../../', import.meta.url));
let exec = promisify(execFile);
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
  'wizard validates answers and config-only completes in a real narrow terminal',
  { timeout: 30000 },
  async t => {
    let cwd = await fixture(t);
    let result = await wizard(t, cwd, [
      ['Choose [2]', 'invalid\n'],
      ['Choose one of the listed numbers.', '2\n'],
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
      [['Choose [2]', '2\n'], noAgents, noCloud, ['Apply this setup?', 'n\n']],
      [['Choose [2]', '\x04']],
      [['Choose [2]', '\x03']],
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
    assert.doesNotMatch(result.output, /How will you capture screenshots/);
    assert.equal(
      await readFile(path.join(cwd, 'vizzly.config.js'), 'utf8'),
      source
    );
    assert.deepEqual(await readdir(cwd), ['vizzly.config.js']);
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
      ['Choose [2]', '1\n'],
      ['Playwright test directory', 'visual\n'],
      ['App page URL', `${url}\n`],
      noAgents,
      ['Ignore generated', 'n\n'],
      ['Run the selected command', 'y\n'],
      ['Open the generated report', 'n\n'],
      noCloud,
      apply,
    ]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Captured 1 screenshot/);
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
      ['Choose [2]', '1\n'],
      ['Playwright test directory', '../outside\n'],
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
        ['Choose [2]', '2\n'],
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

ptyTest(
  'dependency installation saves Playwright as a dev dependency and installs it',
  { timeout: 60000 },
  async t => {
    let cwd = await fixture(t);
    let registry = await fixture(t);
    let packageDirectory = path.join(registry, 'package');
    await mkdir(packageDirectory);
    await writeFile(
      path.join(packageDirectory, 'package.json'),
      JSON.stringify({ name: '@playwright/test', version: '99.0.0' })
    );
    let env = {
      ...process.env,
      npm_config_cache: path.join(registry, 'cache'),
      npm_config_userconfig: path.join(registry, 'npmrc'),
    };
    delete env.NODE_V8_COVERAGE;
    await writeFile(env.npm_config_userconfig, '');
    let packed = await exec(
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', registry],
      { cwd: packageDirectory, env }
    );
    let tarball = await readFile(
      path.join(registry, JSON.parse(packed.stdout)[0].filename)
    );
    let url;
    let server = http.createServer((request, response) => {
      if (request.url.endsWith('.tgz')) {
        response.setHeader('Content-Type', 'application/octet-stream');
        response.end(tarball);
      } else {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify({
            name: '@playwright/test',
            'dist-tags': { latest: '99.0.0' },
            versions: {
              '99.0.0': {
                name: '@playwright/test',
                version: '99.0.0',
                dependencies: {},
                dist: { tarball: `${url}/playwright-test.tgz` },
              },
            },
          })
        );
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => server.close(resolve)));
    url = `http://127.0.0.1:${server.address().port}`;
    await writeFile(
      path.join(cwd, '.npmrc'),
      `registry=${url}\n@playwright:registry=${url}\nstore-dir=${path.join(registry, 'store')}\n`
    );
    let version = (await exec('pnpm', ['--version'], { env })).stdout.trim();
    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        name: 'install-fixture',
        private: true,
        packageManager: `pnpm@${version}`,
        devDependencies: { '@vizzly-testing/cli': `link:${repository}` },
      })
    );
    let result = await wizard(
      t,
      cwd,
      [
        ['Choose [2]', '1\n'],
        ['Playwright test directory', 'visual\n'],
        ['App page URL', 'http://127.0.0.1:3000/\n'],
        noAgents,
        ['Ignore generated', 'n\n'],
        ['Install @playwright/test using pnpm?', 'y\n'],
        ['Run the selected command', 'n\n'],
        noCloud,
        apply,
      ],
      {
        npm_config_registry: url,
        NPM_CONFIG_REGISTRY: url,
        npm_config_store_dir: path.join(registry, 'store'),
        npm_config_userconfig: env.npm_config_userconfig,
      }
    );
    assert.equal(result.code, 0, result.output);
    let pkg = JSON.parse(
      await readFile(path.join(cwd, 'package.json'), 'utf8')
    );
    assert.ok(pkg.devDependencies['@playwright/test']);
    assert.equal(pkg.dependencies?.['@playwright/test'], undefined);
    let installed = JSON.parse(
      await readFile(
        path.join(cwd, 'node_modules', '@playwright', 'test', 'package.json'),
        'utf8'
      )
    );
    assert.equal(installed.name, '@playwright/test');
    assert.equal(installed.version, '99.0.0');
  }
);
