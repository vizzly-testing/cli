import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { VizzlySDK } from './index.js';

let image = await readFile(
  new URL(
    '../../tests/reporter/fixtures/images/screenshots/pricing-page.png',
    import.meta.url
  )
);

test('SDK starts one real capture server, delivers capture events, and closes its HTTP listener', async t => {
  let reservation = createServer();
  let listening = once(reservation, 'listening');
  reservation.listen(0, '127.0.0.1');
  await listening;
  let port = reservation.address().port;
  await promisify(reservation.close.bind(reservation))();
  let sdk = new VizzlySDK({ server: { port } });
  t.after(() => sdk.stop());
  await assert.rejects(sdk.screenshot('homepage', image), {
    code: 'SERVER_NOT_RUNNING',
  });
  let starts = [];
  let captures = [];
  let stops = [];
  sdk.on('server:started', event => starts.push(event));
  sdk.on('screenshot:captured', event => captures.push(event));
  sdk.on('server:stopped', event => stops.push(event));
  let server = await sdk.start();
  assert.deepEqual(await sdk.start(), server);
  await sdk.screenshot('homepage', image, {
    buildId: 'sdk-build',
    threshold: 0,
    properties: { browser: 'firefox' },
  });
  assert.deepEqual(starts, [{ port, url: `http://localhost:${port}` }]);
  assert.equal(captures.length, 1);
  assert.equal(captures[0].name, 'homepage');
  assert.equal(captures[0].buildId, 'sdk-build');
  assert.equal(captures[0].options.threshold, 0);
  await sdk.stop();
  await sdk.stop();
  assert.equal(stops.length, 1);
  await assert.rejects(fetch(`${server.url}/screenshot`));
  await assert.rejects(sdk.screenshot('homepage', image), {
    code: 'SERVER_NOT_RUNNING',
  });
});

test('SDK starts TDD in its requested workspace and compares real screenshots against persisted baselines', async t => {
  let directory = await mkdtemp(join(tmpdir(), 'vizzly-sdk-tdd-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let sdk = new VizzlySDK({ comparison: { threshold: 0, minClusterSize: 1 } });
  let baselineService = await sdk.startTDD({
    workingDir: directory,
    setBaseline: true,
  });
  assert.equal(baselineService.workingDir, directory);
  let baseline = await sdk.compare('homepage', image);
  assert.equal(baseline.status, 'new');
  assert.deepEqual(await readFile(baseline.baseline), image);

  let comparisons = [];
  sdk.on('comparison:completed', event => comparisons.push(event));
  await sdk.startTDD({ workingDir: directory });
  assert.equal((await sdk.compare('homepage', image)).status, 'passed');
  let changed = await readFile(
    new URL(
      '../../tests/reporter/fixtures/images/screenshots/homepage-mobile.png',
      import.meta.url
    )
  );
  assert.equal((await sdk.compare('homepage', changed)).status, 'failed');
  assert.deepEqual(
    comparisons.map(result => result.status),
    ['passed', 'failed']
  );
  let metadata = JSON.parse(
    await readFile(join(directory, '.vizzly/baselines/metadata.json'), 'utf8')
  );
  assert.equal(metadata.threshold, 0);
  assert.equal(metadata.screenshots.length, 1);
  assert.deepEqual(await readFile(metadata.screenshots[0].path), image);
});
