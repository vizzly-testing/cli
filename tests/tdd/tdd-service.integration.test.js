import assert from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { createStateStore } from '../../src/tdd/state-store.js';
import { TddService } from '../../src/tdd/tdd-service.js';

let testDirs = [];

function createTestDir() {
  let dir = mkdtempSync(join(tmpdir(), 'vizzly-tdd-service-integration-'));
  testDirs.push(dir);
  return dir;
}

function createOutputStub() {
  return {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
    blank: () => {},
    print: () => {},
    isVerbose: () => false,
    diffBar: () => '░░░░░░░░░░',
  };
}

function createService(workingDir, deps = {}) {
  return new TddService({}, workingDir, false, null, {
    output: createOutputStub(),
    ...deps,
  });
}

afterEach(() => {
  for (let dir of testDirs) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  testDirs = [];
});

describe('tdd/tdd-service integration', () => {
  it('creates a new baseline and persists metadata in sqlite state', async () => {
    let workingDir = createTestDir();
    let service = createService(workingDir);

    let result = await service.compareScreenshot(
      'home-page',
      Buffer.from('image-a'),
      {
        browser: 'chrome',
        viewport: { width: 1280, height: 720 },
      }
    );

    assert.strictEqual(result.status, 'new');
    assert.strictEqual(existsSync(result.baseline), true);
    assert.strictEqual(existsSync(result.current), true);

    let store = createStateStore({ workingDir });
    try {
      let metadata = store.getBaselineMetadata();
      assert.ok(metadata);
      assert.strictEqual(Array.isArray(metadata.screenshots), true);
      assert.strictEqual(metadata.screenshots.length, 1);
      assert.strictEqual(metadata.screenshots[0].name, 'home-page');
      assert.strictEqual(metadata.screenshots[0].signature, result.signature);
    } finally {
      store.close();
    }
  });

  it('loads baseline metadata from sqlite in a new service instance', async () => {
    let workingDir = createTestDir();
    let serviceA = createService(workingDir);

    await serviceA.compareScreenshot('settings-page', Buffer.from('image-a'), {
      browser: 'chrome',
      viewport: { width: 1440, height: 900 },
    });

    let serviceB = createService(workingDir);
    let baseline = await serviceB.loadBaseline();

    assert.ok(baseline);
    assert.strictEqual(baseline.screenshots.length, 1);
    assert.strictEqual(baseline.screenshots[0].name, 'settings-page');
  });

  it('returns passed on second run when external comparer reports no diff', async () => {
    let workingDir = createTestDir();
    let service = createService(workingDir, {
      comparison: {
        compareImages: async () => ({
          isDifferent: false,
          totalPixels: 100,
          aaPixelsIgnored: 0,
          aaPercentage: 0,
        }),
      },
    });

    await service.compareScreenshot('profile', Buffer.from('image-a'), {
      browser: 'chrome',
      viewport: { width: 1280, height: 720 },
    });

    let result = await service.compareScreenshot(
      'profile',
      Buffer.from('image-b'),
      {
        browser: 'chrome',
        viewport: { width: 1280, height: 720 },
      }
    );

    assert.strictEqual(result.status, 'passed');
    assert.strictEqual(result.diff, null);

    let summary = service.getResults();
    assert.strictEqual(summary.total, 1);
    assert.strictEqual(summary.passed, 1);
    assert.strictEqual(summary.failed, 0);
  });

  it('returns failed and updates summary when comparer reports a diff', async () => {
    let workingDir = createTestDir();
    let service = createService(workingDir, {
      comparison: {
        compareImages: async () => ({
          isDifferent: true,
          diffPercentage: 12.5,
          diffPixels: 42,
          totalPixels: 400,
          aaPixelsIgnored: 3,
          aaPercentage: 0.75,
          boundingBox: { x: 0, y: 0, width: 20, height: 20 },
          heightDiff: 0,
          intensityStats: { mean: 0.3, max: 0.8 },
          diffClusters: [{ x: 1, y: 1, width: 5, height: 5, pixelCount: 10 }],
        }),
      },
    });

    await service.compareScreenshot('dashboard', Buffer.from('image-a'), {
      browser: 'chrome',
      viewport: { width: 1280, height: 720 },
    });

    let result = await service.compareScreenshot(
      'dashboard',
      Buffer.from('image-b'),
      {
        browser: 'chrome',
        viewport: { width: 1280, height: 720 },
      }
    );

    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(result.diffPercentage, 12.5);
    assert.strictEqual(result.diffCount, 42);
    assert.strictEqual(Array.isArray(result.diffClusters), true);
    assert.strictEqual(result.diffClusters.length, 1);

    let summary = service.getResults();
    assert.strictEqual(summary.total, 1);
    assert.strictEqual(summary.failed, 1);
    assert.strictEqual(summary.passed, 0);
  });

  it('accepts a changed screenshot and rewrites baseline + metadata', async () => {
    let workingDir = createTestDir();
    let service = createService(workingDir, {
      comparison: {
        compareImages: async () => ({
          isDifferent: true,
          diffPercentage: 3.2,
          diffPixels: 8,
          totalPixels: 100,
          aaPixelsIgnored: 0,
          aaPercentage: 0,
          diffClusters: [{ x: 1, y: 1, width: 2, height: 2, pixelCount: 4 }],
        }),
      },
    });

    await service.compareScreenshot('avatar', Buffer.from('image-a'), {
      browser: 'chrome',
      viewport: { width: 1280, height: 720 },
    });

    let changed = await service.compareScreenshot(
      'avatar',
      Buffer.from('image-b'),
      {
        browser: 'chrome',
        viewport: { width: 1280, height: 720 },
      }
    );

    let acceptance = await service.acceptBaseline(changed.id);
    assert.strictEqual(acceptance.status, 'accepted');

    let baselineBytes = readFileSync(changed.baseline);
    assert.strictEqual(String(baselineBytes), 'image-b');

    let store = createStateStore({ workingDir });
    try {
      let metadata = store.getBaselineMetadata();
      assert.ok(metadata);
      assert.strictEqual(metadata.screenshots.length, 1);
      assert.strictEqual(metadata.screenshots[0].signature, changed.signature);
    } finally {
      store.close();
    }
  });

  it('processes downloaded baselines and persists build/hotspot/region metadata', async () => {
    let workingDir = createTestDir();
    let service = createService(workingDir, {
      api: {
        fetchWithTimeout: async url => ({
          ok: true,
          statusText: 'OK',
          arrayBuffer: async () => {
            if (!url.includes('example.com')) {
              throw new Error('Unexpected download URL');
            }
            return Uint8Array.from([1, 2, 3]).buffer;
          },
        }),
      },
    });

    let baseline = await service.processDownloadedBaselines(
      {
        build: {
          id: 'build-123',
          name: 'Build 123',
          status: 'completed',
          commit_sha: 'abc123',
          commit_message: 'feat: update',
          approval_status: 'approved',
          completed_at: '2026-01-01T00:00:00.000Z',
        },
        screenshots: [
          {
            id: 'ss-1',
            name: 'checkout',
            filename: 'checkout.png',
            original_url: 'https://example.com/checkout.png',
          },
        ],
        hotspots: {
          checkout: {
            confidence: 'high',
            confidence_score: 90,
            regions: [],
          },
        },
        regions: {
          checkout: {
            confirmed: [{ id: 'r-1', x: 0, y: 0, width: 100, height: 30 }],
            candidates: [],
          },
        },
        summary: { total: 1 },
      },
      'build-123'
    );

    assert.ok(baseline);
    assert.strictEqual(baseline.buildId, 'build-123');
    assert.strictEqual(
      existsSync(join(workingDir, '.vizzly', 'baselines', 'checkout.png')),
      true
    );

    let store = createStateStore({ workingDir });
    try {
      let buildMetadata = store.getBaselineBuildMetadata();
      assert.ok(buildMetadata);
      assert.strictEqual(buildMetadata.buildId, 'build-123');

      let hotspotBundle = store.getHotspotBundle();
      assert.ok(hotspotBundle);
      assert.ok(hotspotBundle.hotspots.checkout);

      let regionBundle = store.getRegionBundle();
      assert.ok(regionBundle);
      assert.ok(regionBundle.regions.checkout);
    } finally {
      store.close();
    }
  });
});
