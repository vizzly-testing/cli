import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { TddService } from '../tdd/tdd.service.js';

let original = readFileSync(
  new URL(
    '../../../tests/reporter/fixtures/images/screenshots/pricing-page.png',
    import.meta.url
  )
);
let changed = readFileSync(
  new URL(
    '../../../tests/reporter/fixtures/images/screenshots/homepage-mobile.png',
    import.meta.url
  )
);

function workspace(t) {
  let directory = mkdtempSync(join(tmpdir(), 'vizzly-baseline-write-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function service(directory, setBaseline = false) {
  return new TddService(
    {
      comparison: { threshold: 0, minClusterSize: 1 },
      signatureProperties: ['device'],
    },
    directory,
    setBaseline
  );
}

function metadata(instance) {
  return JSON.parse(
    readFileSync(join(instance.baselinePath, 'metadata.json'), 'utf8')
  );
}

test('baseline captures persist same-name variants and replace only a matching signature', async t => {
  let instance = service(workspace(t), true);
  let desktop = {
    browser: 'firefox',
    viewport_width: 800,
    device: 'desktop',
    label: '<user metadata>',
  };
  let mobile = { ...desktop, viewport_width: 400, device: 'mobile' };
  let first = await instance.compareScreenshot('Home page', original, desktop);
  let second = await instance.compareScreenshot('Home page', original, mobile);
  let replaced = await instance.compareScreenshot(
    'Home page',
    changed,
    desktop
  );
  assert.equal(first.status, 'new');
  assert.equal(second.status, 'new');
  assert.equal(replaced.id, first.id);
  assert.notEqual(first.id, second.id);
  assert.equal(instance.getResults().total, 2);
  let saved = metadata(instance);
  assert.equal(saved.threshold, 0);
  assert.deepEqual(saved.signatureProperties, ['device']);
  assert.equal(saved.screenshots.length, 2);
  assert.deepEqual(
    saved.screenshots.find(entry => entry.signature === first.signature)
      .properties,
    desktop
  );
  assert.deepEqual(readFileSync(first.baseline), changed);
  assert.deepEqual(readFileSync(second.baseline), original);
});

test('accepting by object or ID saves the exact current variants and works after reload', async t => {
  let directory = workspace(t);
  let instance = service(directory);
  let desktop = { browser: 'firefox', viewport_width: 800, device: 'desktop' };
  let mobile = { ...desktop, viewport_width: 400, device: 'mobile' };
  await instance.compareScreenshot('Home page', original, desktop);
  await instance.compareScreenshot('Home page', original, mobile);
  let first = await instance.compareScreenshot('Home page', changed, desktop);
  let second = await instance.compareScreenshot('Home page', changed, mobile);
  assert.equal(first.status, 'failed');
  assert.equal(second.status, 'failed');
  assert.deepEqual(await instance.acceptBaseline(first), {
    name: 'Home page',
    status: 'accepted',
    message: 'Screenshot accepted as new baseline',
  });
  assert.equal((await instance.acceptBaseline(second.id)).status, 'accepted');
  for (let entry of metadata(instance).screenshots) {
    assert(!entry.path.endsWith('.png.png'));
    assert.deepEqual(readFileSync(entry.path), changed);
  }
  let restarted = service(directory);
  await restarted.loadBaseline();
  assert.equal(
    (await restarted.compareScreenshot('Home page', changed, desktop)).status,
    'passed'
  );
  assert.equal(
    (await restarted.compareScreenshot('Home page', changed, mobile)).status,
    'passed'
  );
});

test('a missing current screenshot or comparison cannot overwrite an approved baseline', async t => {
  let instance = service(workspace(t));
  let baseline = await instance.compareScreenshot('Home page', original);
  let comparison = await instance.compareScreenshot('Home page', changed);
  let before = readFileSync(join(instance.baselinePath, 'metadata.json'));
  rmSync(comparison.current);
  await assert.rejects(
    instance.acceptBaseline(comparison),
    /Current screenshot not found/
  );
  await assert.rejects(
    instance.acceptBaseline('unknown-comparison'),
    /No comparison found with ID/
  );
  assert.deepEqual(readFileSync(baseline.baseline), original);
  assert.deepEqual(
    readFileSync(join(instance.baselinePath, 'metadata.json')),
    before
  );
});

test('bulk updates keep successful writes when other currents are missing or unreadable', async t => {
  let instance = service(workspace(t));
  assert.equal(instance.updateBaselines(), 0);
  let successful;
  for (let name of ['Changed', 'Missing', 'Unreadable']) {
    await instance.compareScreenshot(name, original);
    let comparison = await instance.compareScreenshot(name, changed);
    if (name === 'Changed') successful = comparison;
    else {
      rmSync(comparison.current);
      if (name === 'Unreadable') mkdirSync(comparison.current);
    }
  }
  assert.equal(instance.updateBaselines(), 1);
  let saved = metadata(instance);
  assert.equal(saved.screenshots.length, 3);
  for (let entry of saved.screenshots) {
    assert.deepEqual(
      readFileSync(entry.path),
      entry.name === 'Changed' ? changed : original
    );
  }
  assert.equal(existsSync(successful.baseline), true);

  // Metadata commit errors are reported without changing the image update count.
  // Use a real filesystem failure instead of replacing the persistence function.
  let metadataPath = join(instance.baselinePath, 'metadata.json');
  rmSync(metadataPath);
  mkdirSync(metadataPath);
  assert.equal(instance.updateBaselines(), 1);
  assert(statSync(metadataPath).isDirectory());
  assert.deepEqual(readFileSync(successful.baseline), changed);
});
