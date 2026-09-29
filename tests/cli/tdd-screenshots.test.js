import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  generateBaselineFilename,
  generateComparisonId,
  generateScreenshotSignature,
} from '../../src/tdd/core/signature.js';
import { runCLI } from '../helpers/cli-runner.js';

let samplePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p3sAAAAASUVORK5CYII=',
  'base64'
);

function createComparison(name, properties, timestamp, status = 'failed') {
  let signature = generateScreenshotSignature(name, properties);
  let filename = generateBaselineFilename(name, signature);
  return {
    id: generateComparisonId(signature),
    name,
    status,
    signature,
    properties,
    timestamp,
    baseline: `/images/baselines/${filename}`,
    current: `/images/current/${filename}`,
    diff: `/images/diffs/${filename}`,
    diffPercentage: 4.2,
    threshold: 2,
  };
}

function createWorkspace() {
  let root = realpathSync(
    mkdtempSync(join(tmpdir(), 'vizzly-tdd-screenshots-'))
  );
  let vizzlyDir = join(root, '.vizzly');
  let baselineDir = join(vizzlyDir, 'baselines');
  let currentDir = join(vizzlyDir, 'current');
  let diffDir = join(vizzlyDir, 'diffs');
  for (let directory of [baselineDir, currentDir, diffDir]) {
    mkdirSync(directory, { recursive: true });
  }

  let primary = createComparison(
    'button-primary',
    {
      browser: 'chromium',
      viewport_width: 1280,
      viewport_height: 720,
    },
    1000
  );
  let mobileVariant = createComparison(
    'button-primary',
    {
      browser: 'chromium',
      viewport_width: 375,
      viewport_height: 812,
    },
    2000
  );
  let settings = createComparison(
    'settings-page',
    {
      browser: 'firefox',
      viewport_width: 1440,
      viewport_height: 900,
    },
    1500,
    'new'
  );

  for (let comparison of [primary, mobileVariant, settings]) {
    let filename = comparison.current.split('/').at(-1);
    writeFileSync(join(currentDir, filename), samplePng);
    writeFileSync(join(diffDir, filename), samplePng);
  }
  writeFileSync(
    join(baselineDir, primary.baseline.split('/').at(-1)),
    samplePng
  );
  writeFileSync(
    join(baselineDir, mobileVariant.baseline.split('/').at(-1)),
    samplePng
  );
  let otherBaseline = {
    name: 'existing-baseline',
    signature: 'existing-baseline|||',
    path: join(baselineDir, 'existing-baseline.png'),
  };
  writeFileSync(otherBaseline.path, samplePng);
  writeFileSync(
    join(baselineDir, 'metadata.json'),
    JSON.stringify({
      buildId: 'local-baseline',
      buildName: 'Local TDD Baseline',
      threshold: 2,
      signatureProperties: [],
      screenshots: [
        {
          name: primary.name,
          properties: primary.properties,
          path: join(baselineDir, primary.baseline.split('/').at(-1)),
          signature: primary.signature,
        },
        {
          name: mobileVariant.name,
          properties: mobileVariant.properties,
          path: join(baselineDir, mobileVariant.baseline.split('/').at(-1)),
          signature: mobileVariant.signature,
        },
        otherBaseline,
      ],
    })
  );
  writeFileSync(
    join(vizzlyDir, 'report-data.json'),
    JSON.stringify({
      timestamp: 2000,
      comparisons: [primary, mobileVariant, settings],
      summary: { total: 3, passed: 0, failed: 2, errors: 0 },
    })
  );
  writeFileSync(
    join(vizzlyDir, 'comparison-details.json'),
    JSON.stringify({
      [primary.id]: { diffClusters: [{ pixelCount: 12 }] },
      [mobileVariant.id]: { diffClusters: [{ pixelCount: 3 }] },
    })
  );

  return {
    root,
    primary,
    mobileVariant,
    settings,
    otherBaseline,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function readCommandData(stdout) {
  let result = JSON.parse(stdout);
  assert.equal(result.status, 'data');
  return result.data;
}

async function withWorkspace(callback) {
  let workspace = createWorkspace();
  try {
    return await callback(workspace);
  } finally {
    workspace.dispose();
  }
}

describe('cli/tdd screenshots', () => {
  it('pages local captures and prints the latest current image path', async () => {
    await withWorkspace(async workspace => {
      let page = await runCLI(
        [
          '--no-color',
          'tdd',
          'screenshots',
          'list',
          '--page',
          '2',
          '--page-size',
          '1',
          '--json',
        ],
        { cwd: workspace.root }
      );
      assert.equal(page.code, 0, page.stderr);
      let data = readCommandData(page.stdout);
      assert.equal(data.total, 3);
      assert.equal(data.page, 2);
      assert.equal(data.screenshots[0].id, workspace.mobileVariant.id);

      let human = await runCLI(
        [
          '--no-color',
          'tdd',
          'screenshots',
          'list',
          '--page',
          '1',
          '--page-size',
          '1',
        ],
        { cwd: workspace.root }
      );
      assert.equal(human.code, 0, human.stderr);
      assert.match(human.stdout, /button-primary/);
      assert.match(
        human.stdout,
        /Next page: vizzly tdd screenshots list --page 2 --page-size 1/
      );

      let latest = await runCLI(
        ['--no-color', 'tdd', 'screenshots', 'latest'],
        { cwd: workspace.root }
      );
      assert.equal(latest.code, 0, latest.stderr);
      assert.equal(
        latest.stdout,
        join(
          workspace.root,
          '.vizzly',
          'current',
          workspace.mobileVariant.current.split('/').at(-1)
        )
      );
      let latestNamed = await runCLI(
        ['--no-color', 'tdd', 'screenshots', 'latest', 'settings-page'],
        { cwd: workspace.root }
      );
      assert.equal(latestNamed.code, 0, latestNamed.stderr);
      assert.equal(
        latestNamed.stdout,
        join(
          workspace.root,
          '.vizzly',
          'current',
          workspace.settings.current.split('/').at(-1)
        )
      );
    });
  });

  it('shows only the current image by default and a diff on request', async () => {
    await withWorkspace(async workspace => {
      let current = await runCLI(
        [
          '--no-color',
          'tdd',
          'screenshots',
          'show',
          workspace.primary.id,
          '--json',
        ],
        { cwd: workspace.root }
      );
      assert.equal(current.code, 0, current.stderr);
      let currentData = readCommandData(current.stdout);
      assert.deepEqual(Object.keys(currentData.images), ['current']);
      assert.equal(currentData.images.current.exists, true);
      assert.equal(currentData.details.diffClusters[0].pixelCount, 12);

      let diff = await runCLI(
        [
          '--no-color',
          'tdd',
          'screenshots',
          'show',
          workspace.primary.id,
          '--image',
          'diff',
          '--json',
        ],
        { cwd: workspace.root }
      );
      assert.equal(diff.code, 0, diff.stderr);
      let diffData = readCommandData(diff.stdout);
      assert.deepEqual(Object.keys(diffData.images), ['diff']);
      assert.equal(diffData.images.diff.exists, true);

      let all = await runCLI(
        [
          '--no-color',
          'tdd',
          'screenshots',
          'show',
          workspace.primary.id,
          '--image',
          'all',
          '--json',
        ],
        { cwd: workspace.root }
      );
      assert.equal(all.code, 0, all.stderr);
      let allImages = readCommandData(all.stdout).images;
      assert.deepEqual(Object.keys(allImages), ['current', 'baseline', 'diff']);
      assert.equal(
        Object.values(allImages).every(image => image.exists),
        true
      );

      let ambiguous = await runCLI(
        ['--no-color', 'tdd', 'screenshots', 'show', 'button-primary'],
        { cwd: workspace.root }
      );
      assert.equal(ambiguous.code, 1);
      assert.match(ambiguous.stderr, /More than one screenshot is named/);
    });
  });

  it('accepts one capture as baseline and preserves other local baselines', async () => {
    await withWorkspace(async workspace => {
      let accepted = await runCLI(
        [
          '--no-color',
          'tdd',
          'screenshots',
          'accept',
          workspace.primary.id,
          '--json',
        ],
        { cwd: workspace.root }
      );
      assert.equal(accepted.code, 0, accepted.stderr);
      let acceptedData = readCommandData(accepted.stdout);
      assert.equal(acceptedData.status, 'accepted');
      assert.equal(existsSync(acceptedData.baseline), true);
      assert.deepEqual(readFileSync(acceptedData.baseline), samplePng);

      let report = JSON.parse(
        readFileSync(
          join(workspace.root, '.vizzly', 'report-data.json'),
          'utf8'
        )
      );
      let updated = report.comparisons.find(
        item => item.id === workspace.primary.id
      );
      assert.equal(updated.status, 'passed');
      assert.equal(updated.diff, null);
      assert.equal(report.summary.passed, 2);

      let metadata = JSON.parse(
        readFileSync(
          join(workspace.root, '.vizzly', 'baselines', 'metadata.json'),
          'utf8'
        )
      );
      assert.equal(
        metadata.screenshots.some(
          item => item.signature === workspace.otherBaseline.signature
        ),
        true
      );

      let details = JSON.parse(
        readFileSync(
          join(workspace.root, '.vizzly', 'comparison-details.json'),
          'utf8'
        )
      );
      assert.equal(details[workspace.primary.id], undefined);
      assert.equal(
        details[workspace.mobileVariant.id].diffClusters[0].pixelCount,
        3
      );

      let shown = await runCLI(
        [
          '--no-color',
          'tdd',
          'screenshots',
          'show',
          workspace.primary.id,
          '--json',
        ],
        { cwd: workspace.root }
      );
      assert.equal(shown.code, 0, shown.stderr);
      assert.deepEqual(readCommandData(shown.stdout).details, {});
    });
  });

  it('rejects invalid pagination and reports missing local capture data', async () => {
    await withWorkspace(async workspace => {
      let invalidPage = await runCLI(
        ['--no-color', 'tdd', 'screenshots', 'list', '--page', '0'],
        { cwd: workspace.root }
      );
      assert.equal(invalidPage.code, 1);
      assert.match(invalidPage.stderr, /--page must be a positive integer/);

      rmSync(join(workspace.root, '.vizzly', 'report-data.json'));
      let missing = await runCLI(
        ['--no-color', 'tdd', 'screenshots', 'latest'],
        { cwd: workspace.root }
      );
      assert.equal(missing.code, 1);
      assert.match(missing.stderr, /No local TDD screenshots found/);

      writeFileSync(
        join(workspace.root, '.vizzly', 'report-data.json'),
        JSON.stringify({ comparisons: [null] })
      );
      let malformed = await runCLI(
        ['--no-color', 'tdd', 'screenshots', 'latest'],
        { cwd: workspace.root }
      );
      assert.equal(malformed.code, 1);
      assert.match(
        malformed.stderr,
        /Local TDD report has invalid comparisons/
      );
    });
  });
});
