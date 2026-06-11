import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { runCLI } from '../helpers/cli-runner.js';

async function withServer(callback) {
  let server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('not-vizzly');
  });

  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    let address = server.address();
    return await callback({ server, port: address.port });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function withHealthServer(callback) {
  let server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ port: server.address().port, uptime: 1000 }));
      return;
    }

    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('not-vizzly');
  });

  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    let address = server.address();
    return await callback({ server, port: address.port });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function getFreePort() {
  return await withServer(({ port }) => port);
}

async function getTwoFreePorts() {
  let first = await getFreePort();
  let second = await getFreePort();

  while (second === first) {
    second = await getFreePort();
  }

  return [first, second];
}

function createWorkspace() {
  return mkdtempSync(join(tmpdir(), 'vizzly-cli-tdd-'));
}

function parseSingleJson(stdout) {
  let parsed = JSON.parse(stdout);
  assert.strictEqual(typeof parsed, 'object');
  return parsed;
}

function screenshotCommand(name) {
  let imagePath = join(
    process.cwd(),
    'tests/reporter/fixtures/images/screenshots/homepage-desktop.png'
  );
  let code = [
    "let fs = await import('node:fs');",
    `let image = fs.readFileSync(${JSON.stringify(imagePath)}, 'base64');`,
    `let payload = { name: ${JSON.stringify(name)}, image, type: 'base64', properties: { viewport_width: 1280, viewport_height: 720, browser: 'chromium' } };`,
    "let response = await fetch(process.env.VIZZLY_SERVER_URL + '/screenshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });",
    'console.log(response.status, await response.text());',
  ].join(' ');

  return `node --input-type=module -e ${JSON.stringify(code)}`;
}

describe('cli/tdd lifecycle', () => {
  it('keeps JSON TDD run output parseable on stdout', async () => {
    let cwd = createWorkspace();
    let port = await getFreePort();
    let result = await runCLI(
      [
        '--no-color',
        '--json',
        'tdd',
        'run',
        'node -p process.env.VIZZLY_SERVER_URL',
        '--port',
        String(port),
        '--no-open',
      ],
      { cwd }
    );

    assert.strictEqual(
      result.code,
      0,
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.match(result.stderr, new RegExp(`http://localhost:${port}`));

    let payload = JSON.parse(result.stdout);
    assert.strictEqual(payload.status, 'data');
    assert.strictEqual(payload.data.status, 'completed');
    assert.strictEqual(payload.data.summary.total, 0);
  });

  it('keeps JSON TDD run failures parseable while forwarding child output to stderr', async () => {
    let cwd = createWorkspace();
    let port = await getFreePort();
    let command = [
      "console.log('child stdout noise');",
      "console.error('child stderr noise');",
      'process.exit(7);',
    ].join(' ');
    let result = await runCLI(
      [
        '--no-color',
        '--json',
        'tdd',
        'run',
        `node -e ${JSON.stringify(command)}`,
        '--port',
        String(port),
        '--no-open',
      ],
      { cwd }
    );

    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /child stdout noise/);
    assert.match(result.stderr, /child stderr noise/);

    let payload = JSON.parse(result.stdout);
    assert.strictEqual(payload.status, 'data');
    assert.strictEqual(payload.data.status, 'failed');
    assert.strictEqual(payload.data.exitCode, 1);
  });

  it('runs the screenshot workflow and leaves users with reviewable results', async () => {
    let cwd = createWorkspace();
    let port = await getFreePort();
    let result = await runCLI(
      [
        '--no-color',
        'tdd',
        'run',
        screenshotCommand('cli-lifecycle-homepage'),
        '--port',
        String(port),
        '--no-open',
      ],
      { cwd }
    );

    assert.strictEqual(
      result.code,
      0,
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    assert.match(result.stdout, /"status":"new"/);
    assert.match(result.stdout, /1 screenshot compared/);
    assert.match(result.stdout, /Review changes: vizzly tdd start --open/);
    assert.doesNotMatch(result.stdout, /Review changes: http:\/\/localhost/);

    let reportDataPath = join(cwd, '.vizzly', 'report-data.json');
    assert.ok(existsSync(reportDataPath));

    let reportData = JSON.parse(readFileSync(reportDataPath, 'utf8'));
    assert.strictEqual(reportData.summary.total, 1);
    assert.strictEqual(
      reportData.comparisons[0].name,
      'cli-lifecycle-homepage'
    );
    assert.strictEqual(reportData.comparisons[0].status, 'new');
  });

  it('starts, reports, lists, and stops a daemon on an explicit port', async () => {
    let cwd = createWorkspace();
    let port = await getFreePort();

    try {
      let start = await runCLI(
        ['--no-color', 'tdd', 'start', '--port', String(port)],
        { cwd, timeout: 30000 }
      );
      assert.strictEqual(start.code, 0);
      let startOutput = `${start.stdout}\n${start.stderr}`;
      assert.match(startOutput, new RegExp(`http://localhost:${port}`));
      assert.match(
        startOutput,
        new RegExp(`Stop with: vizzly tdd stop --port ${port}`)
      );

      let status = await runCLI(['--no-color', 'tdd', 'status'], {
        cwd,
        timeout: 30000,
      });
      assert.strictEqual(status.code, 0);
      let statusOutput = `${status.stdout}\n${status.stderr}`;
      assert.match(statusOutput, /Running/);
      assert.match(statusOutput, new RegExp(`http://localhost:${port}`));

      let list = await runCLI(['--no-color', 'tdd', 'list'], {
        cwd,
        timeout: 30000,
      });
      assert.strictEqual(list.code, 0);
      assert.match(list.stdout, new RegExp(`:${port}`));
    } finally {
      let stop = await runCLI(
        ['--no-color', 'tdd', 'stop', '--port', String(port)],
        { cwd, timeout: 30000 }
      );
      assert.strictEqual(stop.code, 0);
    }
  });

  it('returns a numeric port from tdd start --json', async () => {
    let cwd = createWorkspace();
    let port = await getFreePort();

    try {
      let start = await runCLI(
        ['--no-color', '--json', 'tdd', 'start', '--port', String(port)],
        { cwd, timeout: 30000 }
      );

      assert.strictEqual(start.code, 0);
      assert.strictEqual(start.stderr, '');

      let payload = parseSingleJson(start.stdout);
      assert.strictEqual(payload.status, 'data');
      assert.strictEqual(payload.data.status, 'started');
      assert.strictEqual(payload.data.port, port);
    } finally {
      let stop = await runCLI(
        ['--no-color', 'tdd', 'stop', '--port', String(port)],
        { cwd, timeout: 30000 }
      );
      assert.strictEqual(stop.code, 0);
    }
  });

  it('does not stop an unrelated process that happens to use the requested port', async () => {
    await withServer(async ({ port }) => {
      let cwd = createWorkspace();
      let result = await runCLI(
        ['--no-color', 'tdd', 'stop', '--port', String(port)],
        { cwd }
      );

      assert.strictEqual(result.code, 0);
      assert.match(result.stderr, /No TDD server running/);

      let response = await fetch(`http://127.0.0.1:${port}`);
      assert.strictEqual(await response.text(), 'not-vizzly');
    });
  });

  it('does not report an unrelated healthy service as a TDD daemon', async () => {
    await withHealthServer(async ({ port }) => {
      let cwd = createWorkspace();
      let vizzlyDir = join(cwd, '.vizzly');
      mkdirSync(vizzlyDir, { recursive: true });
      writeFileSync(join(vizzlyDir, 'server.json'), JSON.stringify({ port }));

      let result = await runCLI(
        ['--no-color', 'tdd', 'status', '--port', String(port)],
        { cwd }
      );

      assert.strictEqual(result.code, 0);
      assert.doesNotMatch(result.stdout, /Running/);
      assert.match(result.stderr, /TDD server not running/);

      let response = await fetch(`http://127.0.0.1:${port}/health`);
      assert.strictEqual(response.status, 200);
    });
  });

  it('does not stop the workspace daemon when a different port is requested', async () => {
    let cwd = createWorkspace();
    let [daemonPort, otherPort] = await getTwoFreePorts();

    try {
      let start = await runCLI(
        ['--no-color', 'tdd', 'start', '--port', String(daemonPort)],
        { cwd, timeout: 30000 }
      );
      assert.strictEqual(start.code, 0);

      let wrongStop = await runCLI(
        ['--no-color', 'tdd', 'stop', '--port', String(otherPort)],
        { cwd, timeout: 30000 }
      );
      assert.strictEqual(wrongStop.code, 0);
      assert.match(wrongStop.stderr, /No TDD server running/);
      assert.strictEqual(existsSync(join(cwd, '.vizzly/server.pid')), true);
      assert.strictEqual(existsSync(join(cwd, '.vizzly/server.json')), true);

      let registry = JSON.parse(
        readFileSync(join(cwd, '.vizzly-home/servers.json'), 'utf8')
      );
      let workspacePath = realpathSync(cwd);
      assert.strictEqual(
        registry.servers.some(
          server =>
            server.port === daemonPort && server.directory === workspacePath
        ),
        true
      );

      let status = await runCLI(['--no-color', 'tdd', 'status'], {
        cwd,
        timeout: 30000,
      });
      assert.strictEqual(status.code, 0);
      let statusOutput = `${status.stdout}\n${status.stderr}`;
      assert.match(statusOutput, new RegExp(`http://localhost:${daemonPort}`));
    } finally {
      let stop = await runCLI(
        ['--no-color', 'tdd', 'stop', '--port', String(daemonPort)],
        { cwd, timeout: 30000 }
      );
      assert.strictEqual(stop.code, 0);
    }
  });

  it('does not clean legacy daemon files from HOME when VIZZLY_HOME is isolated', async () => {
    let cwd = createWorkspace();
    let home = mkdtempSync(join(tmpdir(), 'vizzly-cli-home-'));
    let vizzlyHome = join(cwd, '.isolated-vizzly-home');
    let legacyDir = join(home, '.vizzly');
    let legacyFile = join(legacyDir, 'server.json');
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(legacyFile, JSON.stringify({ pid: 1234, port: 47392 }));

    let result = await runCLI(
      ['--no-color', 'tdd', 'stop', '--port', '47393'],
      {
        cwd,
        env: {
          HOME: home,
          VIZZLY_HOME: vizzlyHome,
        },
      }
    );

    assert.strictEqual(result.code, 0);
    assert.strictEqual(existsSync(legacyFile), true);
    assert.deepStrictEqual(JSON.parse(readFileSync(legacyFile, 'utf8')), {
      pid: 1234,
      port: 47392,
    });
  });

  it('keeps stale-file status and stop responses machine-readable in JSON mode', async () => {
    let cwd = createWorkspace();
    let vizzlyDir = join(cwd, '.vizzly');
    mkdirSync(vizzlyDir, { recursive: true });
    writeFileSync(join(vizzlyDir, 'server.pid'), '999999');
    writeFileSync(
      join(vizzlyDir, 'server.json'),
      JSON.stringify({ pid: 999999, port: 47392 })
    );

    let status = await runCLI(['--no-color', '--json', 'tdd', 'status'], {
      cwd,
    });

    assert.strictEqual(status.code, 0);
    assert.strictEqual(status.stderr, '');
    assert.deepStrictEqual(parseSingleJson(status.stdout), {
      status: 'data',
      data: {
        status: 'stale',
        running: false,
        message: 'TDD server process not found; cleaned up stale files',
      },
    });

    mkdirSync(vizzlyDir, { recursive: true });
    writeFileSync(join(vizzlyDir, 'server.pid'), '999999');
    writeFileSync(
      join(vizzlyDir, 'server.json'),
      JSON.stringify({ pid: 999999, port: 47392 })
    );

    let stop = await runCLI(['--no-color', '--json', 'tdd', 'stop'], {
      cwd,
    });

    assert.strictEqual(stop.code, 0);
    assert.strictEqual(stop.stderr, '');
    assert.deepStrictEqual(parseSingleJson(stop.stdout), {
      status: 'data',
      data: {
        status: 'stale',
        stopped: false,
        message: 'TDD server was not running; cleaned up stale files',
      },
    });
  });
});
