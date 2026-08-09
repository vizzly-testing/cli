import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { findJSONMessage, runCLI } from '../helpers/cli-runner.js';

describe('commands/upload CLI', () => {
  it('reports a missing screenshots path before auth errors', async () => {
    let result = await runCLI([
      '--no-color',
      'upload',
      './missing-screenshots-dir',
    ]);

    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /does not exist/);
    assert.doesNotMatch(result.stderr, /API token required/);
  });

  it('reports a missing API token for an existing screenshot directory', async () => {
    let workspace = mkdtempSync(join(tmpdir(), 'vizzly-cli-upload-'));
    let screenshots = join(workspace, 'screenshots');
    mkdirSync(screenshots);
    writeFileSync(join(screenshots, 'home-chrome.png'), 'png');

    let result = await runCLI(['--no-color', 'upload', screenshots], {
      cwd: workspace,
    });

    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /API token required/);
  });

  it('uploads screenshots and finalizes the build through the CLI', async () => {
    let workspace = mkdtempSync(join(tmpdir(), 'vizzly-cli-upload-'));
    let screenshots = join(workspace, 'screenshots');
    mkdirSync(screenshots);
    writeFileSync(join(screenshots, 'home-chrome.png'), 'png');
    writeFileSync(join(screenshots, 'settings-firefox.png'), 'png');

    await withUploadApiServer(async ({ apiUrl, requests }) => {
      let result = await runCLI(
        [
          '--no-color',
          '--json',
          'upload',
          screenshots,
          '--build-name',
          'CLI upload',
          '--branch',
          'main',
          '--commit',
          'abc123',
          '--message',
          'Upload screenshots',
        ],
        {
          cwd: workspace,
          env: {
            VIZZLY_API_URL: apiUrl,
            VIZZLY_TOKEN: 'vzt_test_token',
          },
        }
      );

      assert.strictEqual(result.code, 0);
      assert.doesNotMatch(result.stderr, /status":"error/);

      let payload = findJSONMessage(result.stdout, 'data');
      assert.deepStrictEqual(payload.data.stats, {
        total: 2,
        uploaded: 2,
        skipped: 0,
        bytes: 0,
      });
      assert.strictEqual(payload.data.buildId, 'build-123');
      assert.strictEqual(
        payload.data.url,
        `${apiUrl}/acme/web/builds/build-123`
      );

      assert.deepStrictEqual(
        requests.map(request => `${request.method} ${request.url}`),
        [
          'POST /api/sdk/builds',
          'POST /api/sdk/check-shas',
          'POST /api/sdk/upload',
          'PUT /api/sdk/builds/build-123/status',
          'GET /api/sdk/token/context',
        ]
      );

      assert.strictEqual(requests[0].json.build.name, 'CLI upload');
      assert.strictEqual(requests[0].json.build.branch, 'main');
      assert.strictEqual(requests[0].json.build.commit_sha, 'abc123');
      assert.strictEqual(
        requests[0].json.build.commit_message,
        'Upload screenshots'
      );
      assert.strictEqual(requests[0].json.build.environment, 'test');
      assert.match(requests[2].contentType, /multipart\/form-data/);
      assert.ok(requests[2].body.includes('home-chrome.png'));
      assert.ok(requests[2].body.includes('settings-firefox.png'));
      assert.strictEqual(requests[3].json.status, 'completed');
    });
  });
});

async function withUploadApiServer(callback) {
  let requests = [];
  let server = createServer(async (req, res) => {
    let body = await readRequestBody(req);
    let request = {
      method: req.method,
      url: req.url,
      contentType: req.headers['content-type'] || '',
      body,
      json: body.length > 0 ? parseJSONBody(body) : null,
    };
    requests.push(request);

    res.setHeader('content-type', 'application/json');

    if (req.method === 'POST' && req.url === '/api/sdk/builds') {
      return respond(res, { id: 'build-123' });
    }

    if (req.method === 'POST' && req.url === '/api/sdk/check-shas') {
      return respond(res, { existing: [], missing: [], screenshots: [] });
    }

    if (req.method === 'POST' && req.url === '/api/sdk/upload') {
      return respond(res, {});
    }

    if (
      req.method === 'PUT' &&
      req.url === '/api/sdk/builds/build-123/status'
    ) {
      return respond(res, { status: 'completed' });
    }

    if (req.method === 'GET' && req.url === '/api/sdk/token/context') {
      return respond(res, {
        organization: { slug: 'acme' },
        project: { slug: 'web' },
      });
    }

    res.statusCode = 404;
    return respond(res, { error: 'not found' });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

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

function readRequestBody(req) {
  return new Promise(resolve => {
    let chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function parseJSONBody(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function respond(res, payload) {
  res.end(JSON.stringify(payload));
}
