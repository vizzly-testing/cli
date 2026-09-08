import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseJSONOutput, runCLI } from '../helpers/cli-runner.js';

for (let scenario of [
  { json: true, wait: false, status: 400, testExit: 0 },
  { json: true, wait: true, status: 503, testExit: 0 },
  { json: false, wait: false, status: 400, testExit: 0 },
  { json: true, wait: false, status: 400, testExit: 7 },
]) {
  test(`upload failures preserve test exit status: ${JSON.stringify(scenario)}`, async t => {
    let cwd = await mkdtemp(join(tmpdir(), 'vizzly-upload-errors-'));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    let uploaded = [];
    let screenshotRequests = [];
    let finalized = [];
    let api = createServer(async (req, res) => {
      let chunks = [];
      for await (let chunk of req) chunks.push(chunk);
      let body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
      let result = {};
      if (req.url === '/api/sdk/builds' && req.method === 'POST') {
        result = { id: 'build-123' };
      } else if (
        req.url === '/api/sdk/builds/build-123' &&
        req.method === 'GET'
      ) {
        result = {
          build: { id: 'build-123', url: 'https://app.example/build-123' },
        };
      } else if (req.url === '/api/sdk/builds/build-123/screenshots') {
        screenshotRequests.push(body);
        if (!body.image_data) {
          result = { upload_required: body.name !== 'Reused' };
        } else if (body.name === 'Rejected: capture') {
          res.statusCode = scenario.status;
          result = {
            error:
              'Image dimensions 1×60001 exceed the 60,000-pixel limit per dimension',
          };
        } else {
          uploaded.push(body.name);
          result = { id: body.name };
        }
      } else if (req.url === '/api/sdk/builds/build-123/status') {
        finalized.push(body);
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(result));
    });
    api.listen(0, '127.0.0.1');
    await once(api, 'listening');
    t.after(() => {
      api.closeAllConnections();
      api.close();
    });
    let portReservation = createServer();
    portReservation.listen(0, '127.0.0.1');
    await once(portReservation, 'listening');
    let capturePort = portReservation.address().port;
    await new Promise(resolve => portReservation.close(resolve));

    await writeFile(
      join(cwd, 'capture.js'),
      `
      import assert from 'node:assert/strict';
      let url = process.env.VIZZLY_SERVER_URL;
      async function post(path, body = {}) {
        if (path === '/screenshot') {
          body = { ...body, properties: { theme: 'dark', threshold: 'user threshold', properties: { component: 'Cart' } }, threshold: 2, fullPage: true, screenshotFormatVersion: 2 };
        }
        let response = await fetch(url + path, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 200);
        return response.json();
      }
      for (let name of ['First', 'Rejected: capture']) {
        await post('/screenshot', { name, image: 'aGVsbG8=', type: 'base64' });
      }
      let first = await post('/flush');
      assert.equal(first.success, false);
      assert.equal(first.failed, 1);
      for (let name of ['Later', 'Reused']) {
        await post('/screenshot', { name, image: 'aGVsbG8=', type: 'base64' });
      }
      let second = await post('/flush');
      assert.equal(second.failed, 1);
      assert.equal(second.total, 4);
      process.exitCode = ${scenario.testExit};
    `
    );
    let args = [
      '--no-color',
      'run',
      'node capture.js',
      '--port',
      String(capturePort),
    ];
    if (scenario.json) args.push('--json');
    if (scenario.wait) args.push('--wait');
    let result = await runCLI(args, {
      cwd,
      env: {
        VIZZLY_TOKEN: 'test-token',
        VIZZLY_API_URL: `http://127.0.0.1:${api.address().port}`,
      },
    });
    assert.equal(result.code, scenario.testExit, JSON.stringify(result));
    assert.deepEqual(uploaded, ['First', 'Later'], JSON.stringify(result));
    for (let request of screenshotRequests) {
      assert.equal(request.threshold, 2);
      assert.equal(request.fullPage, true);
      assert.deepEqual(request.properties, {
        theme: 'dark',
        threshold: 'user threshold',
        properties: { component: 'Cart' },
      });
    }
    assert.equal(finalized.length, 1);
    assert.equal(finalized[0].status, 'failed');
    assert.match(
      finalized[0].failureReason,
      /1 screenshot\(s\) failed to upload/
    );
    assert.match(result.stderr + result.stdout, /Rejected: capture/);
    assert.match(result.stderr + result.stdout, /60,000-pixel limit/);
    if (scenario.json) {
      let data = parseJSONOutput(result.stdout).find(
        message => message.status === 'data'
      )?.data;
      assert.equal(data.status, scenario.testExit ? 'failed' : 'incomplete');
      assert.equal(data.exitCode, scenario.testExit);
      assert.equal(data.uploads.uploaded, 2);
      assert.equal(data.uploads.reused, 1);
      assert.equal(data.uploads.failed, 1);
      assert.equal(data.uploads.total, 4);
      assert.equal(data.uploads.failures[0].name, 'Rejected: capture');
    } else {
      assert.match(
        result.stdout + result.stderr,
        /4 captured, 2 uploaded, 1 reused, 1 failed/
      );
      assert.match(
        result.stdout + result.stderr,
        /Visual testing is incomplete/
      );
    }
  });
}
