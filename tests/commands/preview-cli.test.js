import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseJSONOutput, runCLI } from '../helpers/cli-runner.js';

function createWorkspace() {
  return mkdtempSync(join(tmpdir(), 'vizzly-cli-preview-'));
}

describe('commands/preview CLI', () => {
  it('keeps --json missing-path output machine-readable', async () => {
    let result = await runCLI(['--no-color', '--json', 'preview']);

    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.stdout, '');

    let messages = parseJSONOutput(result.stderr);
    assert.deepStrictEqual(messages, [
      {
        status: 'error',
        message: 'Path to static files is required',
      },
    ]);
    assert.doesNotMatch(result.stderr, /vizzly preview \.\/dist/);
  });

  it('reports a missing preview directory before auth errors', async () => {
    let result = await runCLI([
      '--no-color',
      'preview',
      './missing-preview-dir',
      '--build',
      'build-123',
    ]);

    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /does not exist/);
    assert.doesNotMatch(result.stderr, /API token required/);
  });

  it('shows the files selected for a dry run without requiring an API token', async () => {
    let workspace = createWorkspace();
    let previewDir = join(workspace, 'dist');
    mkdirSync(join(previewDir, 'assets'), { recursive: true });
    writeFileSync(join(previewDir, 'index.html'), '<html />');
    writeFileSync(join(previewDir, 'assets', 'app.js'), 'console.log(1)');
    writeFileSync(join(previewDir, 'package.json'), '{}');

    let result = await runCLI(
      [
        '--no-color',
        '--json',
        'preview',
        previewDir,
        '--build',
        'build-123',
        '--dry-run',
      ],
      { cwd: workspace }
    );

    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stderr, '');

    let payload = JSON.parse(result.stdout);
    assert.strictEqual(payload.status, 'data');
    assert.strictEqual(payload.data.dryRun, true);
    assert.strictEqual(payload.data.fileCount, 2);
    assert.deepStrictEqual(payload.data.files.map(file => file.path).sort(), [
      'assets/app.js',
      'index.html',
    ]);
  });

  it('uploads a preview through the CLI and returns the server URL', async () => {
    let workspace = createWorkspace();
    let previewDir = join(workspace, 'dist');
    mkdirSync(join(previewDir, 'assets'), { recursive: true });
    writeFileSync(join(previewDir, 'index.html'), '<html />');
    writeFileSync(join(previewDir, 'assets', 'app.js'), 'console.log(1)');
    writeFileSync(join(previewDir, 'package.json'), '{}');

    await withPreviewApiServer(async ({ apiUrl, requests }) => {
      let result = await runCLI(
        ['--no-color', '--json', 'preview', previewDir, '--build', 'build-123'],
        {
          cwd: workspace,
          env: {
            VIZZLY_API_URL: apiUrl,
            VIZZLY_TOKEN: 'vzt_test_token',
          },
        }
      );

      assert.strictEqual(result.code, 0);
      assert.strictEqual(result.stderr, '');

      let payload = JSON.parse(result.stdout);
      assert.strictEqual(payload.status, 'data');
      assert.strictEqual(payload.data.success, true);
      assert.strictEqual(payload.data.buildId, 'build-123');
      assert.strictEqual(
        payload.data.previewUrl,
        'https://preview.test/build-123'
      );
      assert.strictEqual(payload.data.files, 2);
      assert.ok(requests[1].body.includes('index.html'));
      assert.ok(requests[1].body.includes('assets/app.js'));
      assert.strictEqual(requests[1].body.includes('package.json'), false);
      assert.deepStrictEqual(
        requests.map(request => `${request.method} ${request.url}`),
        [
          'GET /api/sdk/builds/build-123',
          'POST /api/sdk/builds/build-123/preview/upload-zip',
        ]
      );
      assert.match(requests[1].contentType, /multipart\/form-data/);
    });
  });
});

async function withPreviewApiServer(callback) {
  let requests = [];
  let server = createServer(async (req, res) => {
    let body = await readRequestBody(req);
    requests.push({
      method: req.method,
      url: req.url,
      body,
      contentType: req.headers['content-type'] || '',
    });
    res.setHeader('content-type', 'application/json');

    if (req.method === 'GET' && req.url === '/api/sdk/builds/build-123') {
      return respond(res, { project: { isPublic: true } });
    }

    if (
      req.method === 'POST' &&
      req.url === '/api/sdk/builds/build-123/preview/upload-zip'
    ) {
      return respond(res, {
        previewUrl: 'https://preview.test/build-123',
        uploaded: 2,
        totalBytes: body.length,
        newBytes: body.length,
        reusedBlobs: 0,
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

function respond(res, payload) {
  res.end(JSON.stringify(payload));
}
