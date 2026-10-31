import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

let repository = fileURLToPath(new URL('../..', import.meta.url));

test('the published package supports imports, setup, capture and static reporting without source files', async t => {
  let directory = mkdtempSync(join(tmpdir(), 'vizzly-package-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let env = {
    ...process.env,
    DOTENV_CONFIG_PATH: '/dev/null',
    VIZZLY_HOME: join(directory, 'home'),
    VIZZLY_LOG_LEVEL: 'error',
    VIZZLY_NO_UPDATE_NOTIFIER: '1',
  };
  delete env.VIZZLY_TOKEN;
  delete env.VIZZLY_API_KEY;
  delete env.VIZZLY_SERVER_URL;
  let packed = JSON.parse(
    execFileSync(
      'npm',
      [
        'pack',
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        directory,
        '--cache',
        join(directory, 'cache'),
      ],
      { cwd: repository, env, encoding: 'utf8' }
    )
  )[0];
  assert(!packed.files.some(file => /(^src\/|\.test\.js$)/.test(file.path)));
  execFileSync('tar', [
    '-xzf',
    join(directory, packed.filename),
    '-C',
    directory,
  ]);
  let packageRoot = join(directory, 'package');
  symlinkSync(
    join(repository, 'node_modules'),
    join(packageRoot, 'node_modules'),
    'dir'
  );
  let manifest = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8')
  );
  for (let contract of Object.values(manifest.exports)) {
    assert(existsSync(join(packageRoot, contract.types)));
  }
  // Self-references resolve the packed package, while its dependencies use the
  // checkout's installed modules. No install or network registry is needed.
  let consumer = join(packageRoot, 'consumer.js');
  writeFileSync(
    consumer,
    `
    import assert from 'node:assert/strict';
    for (let [specifier, names] of [
      ['@vizzly-testing/cli', ['createVizzly', 'VizzlySDK', 'createTDDService', 'createServices', 'createPluginServices', 'createUploader', 'vizzlyScreenshot', 'loadConfig', 'defineConfig', 'AuthError', 'BuildError', 'ConfigError', 'NetworkError', 'ScreenshotError', 'TimeoutError', 'UploadError', 'ValidationError', 'VizzlyError']],
      ['@vizzly-testing/cli/client', ['vizzlyScreenshot', 'configure', 'setEnabled']],
      ['@vizzly-testing/cli/sdk', ['createVizzly', 'VizzlySDK', 'createUploader', 'createTDDService']],
      ['@vizzly-testing/cli/config', ['defineConfig']],
    ]) {
      let api = await import(specifier);
      for (let name of names) assert.equal(typeof api[name], 'function', name);
      if (specifier === '@vizzly-testing/cli' || specifier === '@vizzly-testing/cli/sdk') {
        assert.equal(typeof api.output.data, 'function');
        assert.equal(typeof api.output.error, 'function');
      }
      if (specifier === '@vizzly-testing/cli') {
        assert(new api.AuthError('unauthorized') instanceof api.VizzlyError);
        assert.equal(new api.ValidationError('invalid').code, 'VALIDATION_ERROR');
      }
    }
  `
  );
  execFileSync(process.execPath, [consumer], { cwd: directory, env });

  let workspace = join(directory, 'workspace with spaces');
  mkdirSync(workspace);
  let executable = join(packageRoot, 'bin/vizzly.js');
  let cli = args => {
    let result = spawnSync(process.execPath, [executable, ...args], {
      cwd: workspace,
      env,
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      `${args.join(' ')}\n${result.stdout}\n${result.stderr}`
    );
    return result;
  };
  assert.match(
    cli(['--version']).stdout,
    new RegExp(manifest.version.replaceAll('.', '\\.'))
  );
  cli(['init', '--quick', '--agent-skill']);
  assert(existsSync(join(workspace, '.agents/skills/vizzly/SKILL.md')));

  let portServer = createServer();
  let listening = once(portServer, 'listening');
  portServer.listen(0, '127.0.0.1');
  await listening;
  let port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));
  try {
    cli(['tdd', 'start', '--port', String(port)]);
    let status = JSON.parse(cli(['--json', 'tdd', 'status']).stdout);
    assert.equal(status.data.running, true);
    assert.equal(status.data.port, port);
    let image = readFileSync(
      join(
        repository,
        'tests/reporter/fixtures/images/screenshots/pricing-page.png'
      ),
      'base64'
    );
    let response = await fetch(`http://localhost:${port}/screenshot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'packed-capture', image, type: 'base64' }),
    });
    assert.equal(response.status, 200, await response.text());
    let report = JSON.parse(
      readFileSync(join(workspace, '.vizzly/report-data.json'), 'utf8')
    );
    assert.equal(report.comparisons[0].name, 'packed-capture');
    for (let [filename, type] of [
      ['reporter-bundle.js', 'application/javascript'],
      ['reporter-bundle.css', 'text/css'],
    ]) {
      let asset = await fetch(`http://localhost:${port}/${filename}`);
      assert.equal(asset.status, 200);
      assert(asset.headers.get('content-type').startsWith(type));
      assert((await asset.text()).length > 0);
    }
  } finally {
    cli(['tdd', 'stop']);
  }
  let { generateStaticReport } = await import(
    pathToFileURL(join(packageRoot, 'dist/domains/reports/report.service.js'))
  );
  let report = await generateStaticReport(workspace);
  assert.equal(report.success, true, JSON.stringify(report));
  assert(
    readFileSync(report.reportPath, 'utf8').includes(
      'Vizzly Visual Test Report'
    )
  );
});
