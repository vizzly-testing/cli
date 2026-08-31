import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { createPluginServices } from '../../../src/plugin-api.js';
import {
  buildCloudRunOptions,
  buildPreviewUploadRecords,
  findLocalTddServer,
  uploadCapturedPreviews,
} from '../src/upload.js';

let temporaryPaths = [];
let servers = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(server => server[Symbol.asyncDispose]())
  );
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map(path => rm(path, { recursive: true, force: true }))
  );
});

function previewManifest(outputPath) {
  return {
    protocolVersion: 1,
    xcodeVersion: '26.6',
    scheme: 'Example',
    simulator: {
      name: 'iPhone 17 Pro',
      runtime: 'iOS 26.4',
      udid: 'SIMULATOR-UDID',
    },
    outputPath,
    previews: [
      {
        id: 'first-id',
        name: 'Card',
        viewType: 'Example.Card',
        file: '001-card.png',
        width: 1206,
        height: 2622,
      },
      {
        id: 'second-id',
        name: 'Card',
        viewType: 'Example.CompactCard',
        file: '002-card.png',
        width: 900,
        height: 700,
      },
    ],
  };
}

function pluginServices() {
  return createPluginServices({
    testRunner: {
      once() {},
      on() {},
      off() {},
      createBuild() {},
      finalizeBuild() {},
    },
    serverManager: {
      start() {},
      stop() {},
    },
  });
}

async function startServer(handler) {
  let server = createServer(handler);
  await new Promise(resolvePromise => server.listen(0, resolvePromise));
  servers.push(server);
  let address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

describe('Swift preview uploads', () => {
  it('builds stable names and native preview metadata', () => {
    let records = buildPreviewUploadRecords(previewManifest('/tmp/previews'));

    assert.deepEqual(
      records.map(record => record.name),
      ['Example - Card - Example.Card', 'Example - Card - Example.CompactCard']
    );
    assert.deepEqual(records[0].properties, {
      browser: 'SwiftUI Preview',
      device: 'iPhone 17 Pro',
      osName: 'iOS',
      osVersion: '26.4',
      platform: 'iOS',
      previewId: 'first-id',
      scheme: 'Example',
      viewType: 'Example.Card',
      viewport: { width: 1206, height: 2622 },
      xcodeVersion: '26.6',
    });
  });

  it('normalizes Xcode preview names for the Vizzly screenshot contract', () => {
    let manifest = previewManifest('/tmp/previews');
    manifest.previews[0].name = 'Card / Dark';

    let [record] = buildPreviewUploadRecords(manifest);

    assert.equal(record.name, 'Example - Card - Dark');
  });

  it('keeps names unique when different Xcode names normalize alike', () => {
    let manifest = previewManifest('/tmp/previews');
    manifest.previews[0].name = 'Card / Dark';
    manifest.previews[1].name = 'Card \\ Dark';

    let records = buildPreviewUploadRecords(manifest);

    assert.deepEqual(
      records.map(record => record.name),
      ['Example - Card - Dark - first-id', 'Example - Card - Dark - second-id']
    );
  });

  it('builds cloud lifecycle options from Vizzly and git configuration', () => {
    let options = buildCloudRunOptions(
      {
        build: { environment: 'test', name: 'Native previews' },
        comparison: { minClusterSize: 4, threshold: 1.5 },
        parallelId: 'ios-shard',
        server: { port: 48000, timeout: 60_000 },
      },
      {
        branch: 'preview-sdk',
        commit: 'abc123',
        message: 'Render stock previews',
        prNumber: 42,
      }
    );

    assert.deepEqual(options, {
      allowNoToken: false,
      branch: 'preview-sdk',
      buildName: 'Native previews',
      commit: 'abc123',
      eager: false,
      environment: 'test',
      message: 'Render stock previews',
      minClusterSize: 4,
      parallelId: 'ios-shard',
      port: 48000,
      pullRequestNumber: 42,
      threshold: 1.5,
      timeout: 60_000,
      uploadAll: false,
      wait: false,
    });
  });

  it('discovers only a live TDD server', async () => {
    let root = await mkdtemp(join(tmpdir(), 'vizzly-swift-upload-'));
    temporaryPaths.push(root);
    let nested = join(root, 'ios', 'Example');
    await mkdir(join(root, '.vizzly'), { recursive: true });
    await mkdir(nested, { recursive: true });
    let serverUrl = await startServer((request, response) => {
      response.writeHead(request.url === '/health' ? 200 : 404);
      response.end();
    });
    let port = Number(new URL(serverUrl).port);
    await writeFile(
      join(root, '.vizzly', 'server.json'),
      JSON.stringify({ port: String(port) })
    );

    assert.equal(
      await findLocalTddServer([nested]),
      `http://localhost:${port}`
    );

    await servers.pop()[Symbol.asyncDispose]();
    assert.equal(await findLocalTddServer([nested]), null);
  });

  it('uploads every rendered PNG and flushes through the plugin service', async () => {
    let requests = [];
    let serverUrl = await startServer((request, response) => {
      let chunks = [];
      request.on('data', chunk => chunks.push(chunk));
      request.on('end', () => {
        requests.push({
          body: JSON.parse(Buffer.concat(chunks).toString() || '{}'),
          url: request.url,
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify(
            request.url === '/flush'
              ? { success: true, summary: { total: 2 } }
              : { success: true, status: 'new' }
          )
        );
      });
    });
    let manifest = previewManifest('/tmp/previews');

    let result = await uploadCapturedPreviews({
      buildId: 'build-123',
      comparison: { minClusterSize: 3, threshold: 2.5 },
      manifest,
      screenshots: pluginServices().screenshots,
      serverUrl,
    });

    assert.equal(result.uploaded, 2);
    assert.equal(result.flush.summary.total, 2);
    assert.deepEqual(
      requests.map(request => request.url),
      ['/screenshot', '/screenshot', '/flush']
    );
    assert.equal(requests[0].body.buildId, 'build-123');
    assert.equal(requests[0].body.name, 'Example - Card - Example.Card');
    assert.equal(requests[0].body.type, 'file-path');
    assert.equal(requests[0].body.properties.threshold, 2.5);
    assert.equal(requests[0].body.properties.minClusterSize, 3);
  });

  it('honors both supported fail-on-diff environment values', async () => {
    let receivedValues = [];
    let screenshots = {
      createClient(options) {
        receivedValues.push(options.failOnDiff);
        return {
          async flush() {
            return { success: true };
          },
          async screenshot() {
            return { success: true };
          },
        };
      },
    };
    let originalValue = process.env.VIZZLY_FAIL_ON_DIFF;

    try {
      for (let value of ['true', '1']) {
        process.env.VIZZLY_FAIL_ON_DIFF = value;
        await uploadCapturedPreviews({
          manifest: previewManifest('/tmp/previews'),
          screenshots,
          serverUrl: 'http://localhost:47392',
        });
      }
    } finally {
      if (originalValue === undefined) {
        delete process.env.VIZZLY_FAIL_ON_DIFF;
      } else {
        process.env.VIZZLY_FAIL_ON_DIFF = originalValue;
      }
    }

    assert.deepEqual(receivedValues, [true, true]);
  });
});
