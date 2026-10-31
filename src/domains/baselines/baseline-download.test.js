import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { TddService } from '../tdd/tdd.service.js';

let image = readFileSync(
  new URL(
    '../../../tests/reporter/fixtures/images/screenshots/pricing-page.png',
    import.meta.url
  )
);

describe('cloud baseline installation', () => {
  let server;
  let origin;
  let workingDir;
  let response;
  let requests;
  let pendingImages;
  let remainingImages;
  let maxPendingImages;

  function screenshot(overrides = {}) {
    return {
      id: 'screenshot-one',
      name: 'Home page',
      filename: 'home.png',
      sha256: 'new-sha',
      original_url: `${origin}/images/home.png`,
      width: 800,
      height: 600,
      ...overrides,
    };
  }

  function service() {
    return new TddService(
      { apiUrl: origin, apiKey: 'vzt_test', comparison: { threshold: 0 } },
      workingDir
    );
  }

  function seedBaseline(instance, screenshots) {
    writeFileSync(
      join(instance.baselinePath, 'metadata.json'),
      JSON.stringify({
        buildId: 'old-build',
        buildName: 'Existing baseline',
        threshold: 0,
        signatureProperties: ['browser'],
        screenshots,
      })
    );
    for (let entry of screenshots) {
      writeFileSync(join(instance.baselinePath, entry.filename), image);
    }
  }

  function readJson(...parts) {
    return JSON.parse(readFileSync(join(...parts), 'utf8'));
  }

  before(async () => {
    server = createServer((req, res) => {
      requests.push(req.url);
      if (req.url.startsWith('/images/')) {
        if (req.url.endsWith('/failed.png')) {
          res.writeHead(503);
          res.end('Image unavailable');
          return;
        }
        if (remainingImages > 0) {
          pendingImages.push(res);
          maxPendingImages = Math.max(maxPendingImages, pendingImages.length);
          if (pendingImages.length === Math.min(5, remainingImages)) {
            let batch = pendingImages.splice(0);
            remainingImages -= batch.length;
            for (let pending of batch) {
              pending.writeHead(200, { 'Content-Type': 'image/png' });
              pending.end(image);
            }
          }
          return;
        }
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(image);
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      if (req.url.startsWith('/api/sdk/comparisons/')) {
        res.end(
          JSON.stringify({
            comparison: {
              baseline_name: 'Home page',
              current_browser: 'Firefox',
              current_viewport_width: 800,
              current_viewport_height: 600,
              baseline_screenshot: {
                id: 'comparison-image',
                build_id: 'comparison-build',
                original_url: `${origin}/images/comparison.png`,
              },
            },
          })
        );
        return;
      }
      if (new URL(req.url, origin).pathname === '/api/sdk/builds') {
        res.end(JSON.stringify({ data: [{ id: 'latest-build' }] }));
        return;
      }
      res.end(JSON.stringify(response));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(() => {
    workingDir = mkdtempSync(join(tmpdir(), 'vizzly-baseline-download-'));
    requests = [];
    pendingImages = [];
    remainingImages = 0;
    maxPendingImages = 0;
    response = {
      build: {
        id: 'selected-build',
        name: 'Selected baseline',
        status: 'completed',
        commit_sha: 'commit-one',
        visual_review: { state: 'approved' },
      },
      signatureProperties: ['device'],
      screenshots: [screenshot()],
    };
  });

  afterEach(() => rmSync(workingDir, { recursive: true, force: true }));
  after(async () => {
    server.close();
    await once(server, 'close');
  });

  it('selects an explicit build, clears old artifacts, and persists image and metadata', async () => {
    let instance = service();
    seedBaseline(instance, [{ filename: 'stale.png', sha256: 'old-sha' }]);
    writeFileSync(join(instance.currentPath, 'stale.png'), image);
    writeFileSync(join(instance.diffPath, 'stale.png'), image);

    let result = await instance.downloadBaselines(
      'staging',
      'feature',
      'selected-build'
    );

    assert.equal(requests[0], '/api/sdk/builds/selected-build/tdd-baselines');
    assert.deepEqual(
      readFileSync(join(instance.baselinePath, 'home.png')),
      image
    );
    for (let dir of [
      instance.baselinePath,
      instance.currentPath,
      instance.diffPath,
    ]) {
      assert.equal(existsSync(join(dir, 'stale.png')), false);
    }
    assert.equal(result.environment, 'staging');
    assert.equal(result.branch, 'feature');
    assert.equal(result.threshold, 0);
    assert.deepEqual(result.signatureProperties, ['device']);
    assert.equal(
      readFileSync(join(instance.baselinePath, 'metadata.json'), 'utf8'),
      JSON.stringify(result, null, 2)
    );
    let record = readJson(workingDir, '.vizzly', 'baseline-metadata.json');
    assert.equal(record.buildId, 'selected-build');
    assert.equal(record.branch, 'feature');
    assert.equal(record.environment, 'staging');
    assert.equal(record.commitSha, 'commit-one');
    assert.equal(record.visual_review.state, 'approved');
    assert.ok(record.downloadedAt);
  });

  it('selects the latest build and reuses matching SHA files without clearing current artifacts', async () => {
    let instance = service();
    seedBaseline(instance, [
      { filename: 'cached.png', sha256: 'unchanged' },
      { filename: 'changed.png', sha256: 'old-sha' },
    ]);
    writeFileSync(join(instance.currentPath, 'retained.png'), image);
    response.screenshots = [
      screenshot({
        filename: 'cached.png',
        sha256: 'unchanged',
        original_url: `${origin}/images/cached.png`,
      }),
      screenshot({
        filename: 'changed.png',
        original_url: `${origin}/images/changed.png`,
      }),
    ];

    let result = await instance.downloadBaselines('production', 'main');

    let selection = new URL(requests[0], origin);
    assert.equal(selection.pathname, '/api/sdk/builds');
    assert.equal(selection.searchParams.get('environment'), 'production');
    assert.equal(selection.searchParams.get('branch'), 'main');
    assert.equal(selection.searchParams.get('status'), 'passed');
    assert.equal(selection.searchParams.get('limit'), '1');
    assert.ok(requests.includes('/api/sdk/builds/latest-build/tdd-baselines'));
    assert.deepEqual(
      requests.filter(path => path.startsWith('/images/')),
      ['/images/changed.png']
    );
    assert.equal(existsSync(join(instance.currentPath, 'retained.png')), true);
    assert.equal(result.screenshots[1].sha256, 'new-sha');
    assert.deepEqual(result.signatureProperties, ['browser']);
    assert.equal(result.environment, 'production');
  });

  it('selects a comparison baseline and writes its generated filename', async () => {
    let instance = service();

    let result = await instance.downloadBaselines(
      'test',
      'main',
      null,
      'comparison-one'
    );

    assert.equal(requests[0], '/api/sdk/comparisons/comparison-one');
    assert.equal(result.buildId, 'comparison-build');
    assert.equal(result.screenshots.length, 1);
    assert.equal(result.screenshots[0].name, 'Home page');
    assert.deepEqual(readFileSync(result.screenshots[0].path), image);
  });

  it('installs prefetched images through the same path using its default environment and branch', async () => {
    let instance = service();
    seedBaseline(instance, [{ filename: 'stale.png', sha256: 'old-sha' }]);
    remainingImages = 7;
    response.screenshots = Array.from({ length: 7 }, (_, index) =>
      screenshot({
        id: `image-${index}`,
        filename: `image-${index}.png`,
        original_url: undefined,
        url: `${origin}/images/image-${index}.png`,
      })
    );

    let result = await instance.processDownloadedBaselines(
      response,
      'selected-build'
    );

    assert.equal(result.environment, 'test');
    assert.equal(result.branch, null);
    assert.deepEqual(result.signatureProperties, ['device']);
    assert.equal(existsSync(join(instance.baselinePath, 'stale.png')), false);
    assert.equal(requests.length, 7);
    assert.equal(maxPendingImages, 5);
    assert.equal(result.screenshots.length, 7);
    for (let entry of result.screenshots) {
      assert.deepEqual(readFileSync(entry.path), image);
    }
    assert.equal(
      readFileSync(join(instance.baselinePath, 'metadata.json'), 'utf8'),
      JSON.stringify(result, null, 2)
    );
    assert.equal(
      readJson(workingDir, '.vizzly', 'baseline-metadata.json').branch,
      null
    );
  });

  it('returns no baseline when all images are malformed, lack a URL, or fail to download', async () => {
    let cases = [
      screenshot({ name: '../unsafe' }),
      screenshot({ filename: undefined }),
      screenshot({ original_url: undefined }),
      screenshot({ original_url: `${origin}/images/failed.png` }),
    ];
    let instance = service();
    for (let entry of cases) {
      response.screenshots = [entry];
      let result = await instance.processDownloadedBaselines(
        response,
        'selected-build'
      );
      assert.equal(result, null);
      assert.equal(
        existsSync(join(instance.baselinePath, 'metadata.json')),
        false
      );
    }
  });

  it('preserves partial-download metadata without writing failed images', async () => {
    let instance = service();
    response.screenshots = [
      screenshot(),
      screenshot({ filename: 'missing-url.png', original_url: undefined }),
      screenshot({
        filename: 'failed.png',
        original_url: `${origin}/images/failed.png`,
      }),
    ];

    let result = await instance.processDownloadedBaselines(
      response,
      'selected-build'
    );

    assert.deepEqual(
      readFileSync(join(instance.baselinePath, 'home.png')),
      image
    );
    assert.equal(
      existsSync(join(instance.baselinePath, 'missing-url.png')),
      false
    );
    assert.equal(existsSync(join(instance.baselinePath, 'failed.png')), false);
    assert.equal(result.screenshots.length, 3);
    assert.equal(
      readFileSync(join(instance.baselinePath, 'metadata.json'), 'utf8'),
      JSON.stringify(result, null, 2)
    );
  });

  it('preserves failed-build fallback and rejects a missing explicit build', async () => {
    let instance = service();
    seedBaseline(instance, [{ filename: 'old.png', sha256: 'old-sha' }]);
    response.build.status = 'failed';

    assert.equal(
      await instance.downloadBaselines('test', 'main', 'selected-build'),
      null
    );
    assert.equal(existsSync(join(instance.baselinePath, 'old.png')), false);
    assert.equal(
      requests.some(path => path.startsWith('/images/')),
      false
    );

    response = null;
    await assert.rejects(
      instance.downloadBaselines('test', 'main', 'missing-build'),
      /Build missing-build not found or API returned null/
    );
  });
});
