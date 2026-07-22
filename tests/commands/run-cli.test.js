import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { runCLI } from '../helpers/cli-runner.js';

function createWorkspace() {
  return mkdtempSync(join(tmpdir(), 'vizzly-cli-run-'));
}

function parseSingleJson(stdout) {
  let parsed = JSON.parse(stdout);
  assert.strictEqual(typeof parsed, 'object');
  return parsed;
}

async function getFreePort() {
  let server = createServer();
  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });
  let port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function withApiServer(callback, options = {}) {
  let {
    buildCreationStatus = 200,
    waitStatusCode = 200,
    waitBuildState = 'completed',
  } = options;
  let buildId = 'build-123';
  let buildUrl = 'http://app.test/org/project/builds/build-123';
  let requests = [];
  let buildReadCount = 0;
  let server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url });
    res.setHeader('content-type', 'application/json');

    if (req.method === 'POST' && req.url === '/api/sdk/builds') {
      if (buildCreationStatus !== 200) {
        res.statusCode = buildCreationStatus;
        res.setHeader('content-type', 'text/html');
        res.end('<html><title>Cloudflare Tunnel error</title></html>');
        return;
      }

      res.end(JSON.stringify({ id: buildId, url: buildUrl }));
      return;
    }

    if (req.method === 'GET' && req.url === `/api/sdk/builds/${buildId}`) {
      buildReadCount++;
      if (buildReadCount > 1 && waitStatusCode !== 200) {
        res.statusCode = waitStatusCode;
        res.end(JSON.stringify({ error: 'build status unavailable' }));
        return;
      }

      res.end(
        JSON.stringify({
          build: {
            id: buildId,
            status: buildReadCount > 1 ? waitBuildState : 'completed',
            error:
              buildReadCount > 1 && waitBuildState === 'failed'
                ? 'comparison processing failed'
                : undefined,
            url: buildUrl,
            total_comparisons: 0,
            new_comparisons: 0,
            failed_comparisons: 0,
            identical_comparisons: 0,
            approval_status: 'pending',
          },
        })
      );
      return;
    }

    if (
      req.method === 'PUT' &&
      req.url === `/api/sdk/builds/${buildId}/status`
    ) {
      res.end(JSON.stringify({ id: buildId, status: 'completed' }));
      return;
    }

    if (req.method === 'GET' && req.url === '/api/sdk/token/context') {
      res.end(
        JSON.stringify({
          organization: { slug: 'org' },
          project: { slug: 'project' },
        })
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    let address = server.address();
    return await callback({
      apiUrl: `http://127.0.0.1:${address.port}`,
      requests,
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

describe('commands/run CLI', () => {
  it('keeps --json stdout parseable when the child command prints output', async () => {
    let cwd = createWorkspace();
    let command = [
      "console.log('child stdout noise');",
      "console.error('child stderr noise');",
    ].join(' ');

    let result = await runCLI(
      [
        '--no-color',
        '--json',
        'run',
        `node -e ${JSON.stringify(command)}`,
        '--allow-no-token',
      ],
      { cwd }
    );

    assert.strictEqual(result.code, 0);
    assert.match(result.stderr, /child stdout noise/);
    assert.match(result.stderr, /child stderr noise/);

    let payload = parseSingleJson(result.stdout);
    assert.strictEqual(payload.status, 'data');
    assert.strictEqual(payload.data.status, 'completed');
  });

  it('keeps --json --wait stdout parseable after a real API build completes', async () => {
    await withApiServer(async ({ apiUrl, requests }) => {
      let cwd = createWorkspace();
      let port = await getFreePort();
      let command = [
        "console.log('child stdout noise');",
        "console.error('child stderr noise');",
      ].join(' ');

      let result = await runCLI(
        [
          '--no-color',
          '--json',
          'run',
          `node -e ${JSON.stringify(command)}`,
          '--wait',
          '--port',
          String(port),
        ],
        {
          cwd,
          env: {
            VIZZLY_API_URL: apiUrl,
            VIZZLY_TOKEN: 'vzt_test_token',
          },
        }
      );

      assert.strictEqual(result.code, 0, `${result.stderr}\n${result.stdout}`);
      assert.match(result.stderr, /child stdout noise/);
      assert.match(result.stderr, /child stderr noise/);
      assert.doesNotMatch(result.stdout, /Screenshots/);
      assert.doesNotMatch(result.stdout, /Results/);
      assert.doesNotMatch(result.stdout, /Context/);

      let payload = parseSingleJson(result.stdout);
      assert.strictEqual(payload.status, 'data');
      assert.strictEqual(payload.data.status, 'completed');
      assert.strictEqual(payload.data.buildId, 'build-123');
      assert.strictEqual(payload.data.comparisons.total, 0);
      assert.strictEqual(
        payload.data.contextCommand,
        'vizzly context build build-123 --agent --json --source cloud'
      );
      assert.deepStrictEqual(
        requests.map(request => `${request.method} ${request.url}`),
        [
          'POST /api/sdk/builds',
          'GET /api/sdk/builds/build-123',
          'PUT /api/sdk/builds/build-123/status',
          'GET /api/sdk/builds/build-123',
          'GET /api/sdk/token/context',
        ]
      );
    });
  });

  it('does not claim the API build completed when its status is unavailable', async () => {
    await withApiServer(
      async ({ apiUrl }) => {
        let cwd = createWorkspace();
        let port = await getFreePort();

        let result = await runCLI(
          [
            '--no-color',
            '--json',
            'run',
            `node -e ${JSON.stringify('process.exit(0)')}`,
            '--wait',
            '--port',
            String(port),
          ],
          {
            cwd,
            env: {
              VIZZLY_API_URL: apiUrl,
              VIZZLY_TOKEN: 'vzt_test_token',
            },
          }
        );

        assert.strictEqual(
          result.code,
          0,
          `${result.stderr}\n${result.stdout}`
        );
        let payload = parseSingleJson(result.stdout);
        assert.strictEqual(payload.data.status, null);
        assert.strictEqual(payload.data.testsPassed, true);
        assert.strictEqual(payload.data.error.code, 'BUILD_STATUS_FAILED');
        assert.match(payload.data.error.message, /503/);
        assert.strictEqual(
          payload.data.contextCommand,
          'vizzly context build build-123 --agent --json --source cloud'
        );
      },
      { waitStatusCode: 503 }
    );
  });

  it('preserves an API-reported failed build after the child tests pass', async () => {
    await withApiServer(
      async ({ apiUrl }) => {
        let cwd = createWorkspace();
        let port = await getFreePort();

        let result = await runCLI(
          [
            '--no-color',
            '--json',
            'run',
            `node -e ${JSON.stringify('process.exit(0)')}`,
            '--wait',
            '--port',
            String(port),
          ],
          {
            cwd,
            env: {
              VIZZLY_API_URL: apiUrl,
              VIZZLY_TOKEN: 'vzt_test_token',
            },
          }
        );

        assert.strictEqual(result.code, 1);
        let payload = parseSingleJson(result.stdout);
        assert.strictEqual(payload.data.status, 'failed');
        assert.strictEqual(payload.data.testsPassed, true);
        assert.strictEqual(payload.data.error.code, 'BUILD_FAILED');
        assert.match(
          payload.data.error.message,
          /comparison processing failed/
        );
      },
      { waitBuildState: 'failed' }
    );
  });

  it('runs the user test suite with Vizzly disabled when the API rejects the request', async () => {
    await withApiServer(
      async ({ apiUrl }) => {
        let cwd = createWorkspace();
        let command = [
          "console.error('user tests ran');",
          "process.exit(process.env.VIZZLY_ENABLED === 'false' ? 0 : 9);",
        ].join(' ');

        let result = await runCLI(
          ['--no-color', 'run', `node -e ${JSON.stringify(command)}`],
          {
            cwd,
            env: {
              VIZZLY_API_URL: apiUrl,
              VIZZLY_TOKEN: 'vzt_test_token',
            },
          }
        );

        assert.strictEqual(result.code, 0);
        assert.match(result.stderr, /Running tests without visual testing/);
        assert.match(result.stderr, /user tests ran/);
        assert.doesNotMatch(result.stderr, /Cloudflare Tunnel error/);
      },
      { buildCreationStatus: 401 }
    );
  });

  it('keeps JSON output parseable when Vizzly is unavailable', async () => {
    await withApiServer(
      async ({ apiUrl }) => {
        let cwd = createWorkspace();
        let command = [
          "console.error('user tests ran');",
          "process.exit(process.env.VIZZLY_ENABLED === 'false' ? 0 : 9);",
        ].join(' ');

        let result = await runCLI(
          ['--no-color', '--json', 'run', `node -e ${JSON.stringify(command)}`],
          {
            cwd,
            env: {
              VIZZLY_API_URL: apiUrl,
              VIZZLY_TOKEN: 'vzt_test_token',
            },
          }
        );

        assert.strictEqual(result.code, 0);
        assert.match(result.stderr, /Running tests without visual testing/);
        assert.match(result.stderr, /user tests ran/);

        let payload = parseSingleJson(result.stdout);
        assert.strictEqual(payload.data.status, 'completed');
        assert.strictEqual(payload.data.exitCode, 0);
      },
      { buildCreationStatus: 503 }
    );
  });

  it('keeps --json failures parseable when the child command prints output', async () => {
    let cwd = createWorkspace();
    let command = [
      "console.log('child stdout noise');",
      "console.error('child stderr noise');",
      'process.exit(7);',
    ].join(' ');

    let result = await runCLI(
      [
        '--no-color',
        '--json',
        'run',
        `node -e ${JSON.stringify(command)}`,
        '--allow-no-token',
      ],
      { cwd }
    );

    assert.strictEqual(result.code, 7);
    assert.match(result.stderr, /child stdout noise/);
    assert.match(result.stderr, /child stderr noise/);

    let payload = parseSingleJson(result.stdout);
    assert.strictEqual(payload.status, 'data');
    assert.strictEqual(payload.data.status, 'failed');
    assert.strictEqual(payload.data.exitCode, 7);
  });

  it('keeps failure details visible in normal terminal output', async () => {
    let cwd = createWorkspace();
    let command = [
      "console.error('child failure details');",
      'process.exit(7);',
    ].join(' ');

    let result = await runCLI(
      [
        '--no-color',
        'run',
        `node -e ${JSON.stringify(command)}`,
        '--allow-no-token',
      ],
      { cwd }
    );

    assert.strictEqual(result.code, 7);
    assert.match(result.stderr, /child failure details/);
    assert.match(result.stderr, /Test command exited with code 7/);
    assert.match(result.stderr, /Test run failed/);
  });
});
