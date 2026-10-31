import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createHttpServer } from '../../server/http-server.js';
import { createTddHandler } from '../tdd/screenshot-handler.js';

let baseline = readFileSync(
  new URL(
    '../../../tests/reporter/fixtures/images/baselines/homepage-mobile.png',
    import.meta.url
  )
);
let current = readFileSync(
  new URL(
    '../../../tests/reporter/fixtures/images/screenshots/homepage-mobile.png',
    import.meta.url
  )
);

async function startWorkspace(t) {
  let workingDir = mkdtempSync(join(tmpdir(), 'vizzly-report-store-'));
  let handler = createTddHandler(
    { comparison: { threshold: 0, minClusterSize: 1 } },
    workingDir
  );
  await handler.initialize();
  let server = createHttpServer(0, handler, { workingDir });
  await server.start();
  let origin = `http://127.0.0.1:${server.getServer().address().port}`;
  let streams = [];
  t.after(async () => {
    for (let stream of streams) stream.close();
    await server.stop();
    rmSync(workingDir, { recursive: true, force: true });
  });
  async function json(pathname, body) {
    let response = await fetch(
      `${origin}${pathname}`,
      body
        ? {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
        : undefined
    );
    return { status: response.status, data: await response.json() };
  }
  async function capture(image, browser = 'firefox') {
    let response = await json('/screenshot', {
      name: 'Pricing',
      image: image.toString('base64'),
      type: 'base64',
      properties: { browser },
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    return response.data;
  }
  let workspace = {
    workingDir,
    origin,
    json,
    capture,
    read: filename =>
      JSON.parse(readFileSync(join(workingDir, '.vizzly', filename), 'utf8')),
    async events() {
      let stream = await subscribe(origin);
      streams.push(stream);
      return stream;
    },
  };
  return workspace;
}

async function subscribe(origin) {
  let request = get(`${origin}/api/events`);
  let [response] = await once(request, 'response');
  let queued = [];
  let waiting = [];
  let buffer = '';
  response.setEncoding('utf8');
  response.on('data', chunk => {
    buffer += chunk;
    let end = buffer.indexOf('\n\n');
    while (end !== -1) {
      let block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let type = block.match(/^event: (.+)$/m)?.[1];
      let data = block.match(/^data: (.+)$/m)?.[1];
      if (type && data) {
        let event = { type, data: JSON.parse(data) };
        let index = waiting.findIndex(
          item => item.type === type && item.matches(event.data)
        );
        if (index === -1) queued.push(event);
        else waiting.splice(index, 1)[0].resolve(event.data);
      }
      end = buffer.indexOf('\n\n');
    }
  });
  return {
    next(type, matches = () => true) {
      let index = queued.findIndex(
        event => event.type === type && matches(event.data)
      );
      if (index !== -1) return Promise.resolve(queued.splice(index, 1)[0].data);
      return new Promise(resolve => waiting.push({ type, matches, resolve }));
    },
    close() {
      response.destroy();
      request.destroy();
    },
  };
}

test('capture, review, SSE, and dashboard use the same persisted lightweight and heavy report', async t => {
  let workspace = await startWorkspace(t);
  await workspace.capture(baseline);
  let initial = (await workspace.json('/api/report-data')).data;
  let first = initial.comparisons[0];
  assert.equal(initial.summary.passed, 1);
  assert.equal(first.initialStatus, 'new');
  let events = await workspace.events();
  assert.equal((await events.next('reportData')).comparisons[0].id, first.id);

  assert.equal((await workspace.capture(current)).status, 'diff');
  let update = await events.next(
    'comparisonUpdate',
    comparison => comparison.id === first.id && comparison.status === 'failed'
  );
  assert.equal(update.initialStatus, 'new');
  assert(!('diffClusters' in update));
  assert(!('intensityStats' in update));
  let lightweight = workspace.read('report-data.json');
  assert.equal(lightweight.comparisons[0].status, 'failed');
  assert.equal(lightweight.summary.failed, 1);
  let details = workspace.read('comparison-details.json');
  assert(details[first.id].diffClusters.length > 0);
  let detail = (
    await workspace.json(`/api/comparison/${encodeURIComponent(first.id)}`)
  ).data;
  assert.deepEqual(detail.diffClusters, details[first.id].diffClusters);

  await workspace.capture(baseline, 'chrome');
  let variants = (await workspace.json('/api/report-data')).data;
  assert.equal(variants.comparisons.length, 2);
  assert.equal(variants.baseline.screenshots.length, 2);
  assert.equal(
    (await workspace.json('/api/baseline/reject', { id: first.id })).status,
    200
  );
  assert.equal(
    (
      await events.next(
        'comparisonUpdate',
        comparison =>
          comparison.id === first.id && comparison.status === 'rejected'
      )
    ).status,
    'rejected'
  );
  assert.equal(workspace.read('report-data.json').summary.rejected, 1);
  assert.equal(
    (await workspace.json('/api/baseline/accept', { id: first.id })).status,
    200
  );
  let approved = workspace
    .read('report-data.json')
    .comparisons.find(comparison => comparison.id === first.id);
  assert.equal(approved.status, 'passed');
  assert.equal(approved.initialStatus, 'new');
  assert.equal(approved.diff, null);

  // Untrusted detail fields may enrich analysis, never override lightweight state.
  details[first.id] = {
    ...details[first.id],
    status: 'forged',
    name: 'forged',
  };
  writeFileSync(
    join(workspace.workingDir, '.vizzly', 'comparison-details.json'),
    JSON.stringify(details)
  );
  detail = (
    await workspace.json(`/api/comparison/${encodeURIComponent(first.id)}`)
  ).data;
  assert.equal(detail.status, 'passed');
  assert.equal(detail.name, 'Pricing');
  assert.equal(
    (await workspace.json('/api/baseline/accept-all', {})).status,
    200
  );
  assert.equal(workspace.read('report-data.json').summary.passed, 2);

  assert.equal(
    (await workspace.json('/api/baseline/delete', { id: first.id })).status,
    200
  );
  await events.next(
    'comparisonRemoved',
    comparison => comparison.id === first.id
  );
  assert(!workspace.read('comparison-details.json')[first.id]);
  assert.equal(workspace.read('report-data.json').summary.total, 1);
  assert(
    !existsSync(
      join(
        workspace.workingDir,
        '.vizzly',
        approved.current.replace('/images/', '')
      )
    )
  );
  assert.equal(workspace.read('baselines/metadata.json').screenshots.length, 1);

  assert.equal((await workspace.json('/api/baseline/reset', {})).status, 200);
  let reset = await events.next(
    'summaryUpdate',
    report => report.summary.total === 0
  );
  assert.deepEqual(reset.summary, {
    total: 0,
    passed: 0,
    failed: 0,
    rejected: 0,
    errors: 0,
  });
  assert.deepEqual(workspace.read('comparison-details.json'), {});
  assert.equal((await workspace.json('/api/report-data')).data.baseline, null);
});

test('missing and malformed report artifacts retain their HTTP read policies', async t => {
  let workspace = await startWorkspace(t);
  assert.equal((await workspace.json('/api/report-data')).data, null);
  assert.equal((await workspace.json('/api/comparison/missing')).status, 404);
  writeFileSync(
    join(workspace.workingDir, '.vizzly', 'report-data.json'),
    '{bad json'
  );
  assert.equal((await workspace.json('/api/report-data')).status, 500);
  assert.equal((await fetch(`${workspace.origin}/`)).status, 200);

  // A subsequent real capture repairs a corrupt report rather than losing capture data.
  await workspace.capture(baseline);
  let report = (await workspace.json('/api/report-data')).data;
  writeFileSync(
    join(workspace.workingDir, '.vizzly', 'comparison-details.json'),
    '{bad json'
  );
  let detail = await workspace.json(
    `/api/comparison/${encodeURIComponent(report.comparisons[0].id)}`
  );
  assert.equal(detail.status, 200);
  assert.equal(detail.data.id, report.comparisons[0].id);
  writeFileSync(
    join(workspace.workingDir, '.vizzly', 'baselines', 'metadata.json'),
    '{bad json'
  );
  assert.equal((await workspace.json('/api/report-data')).data.baseline, null);

  let reportPath = join(workspace.workingDir, '.vizzly', 'report-data.json');
  rmSync(reportPath);
  mkdirSync(reportPath);
  let unavailable = await workspace.json('/screenshot', {
    name: 'Pricing',
    image: baseline.toString('base64'),
    type: 'base64',
    properties: { browser: 'firefox' },
  });
  assert.equal(unavailable.status, 500);
  assert.match(unavailable.data.error, /EISDIR|directory/i);
});
