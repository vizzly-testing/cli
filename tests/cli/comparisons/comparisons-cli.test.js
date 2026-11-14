import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { findJSONMessage, runCLI } from '../../helpers/cli-runner.js';
import { createCloudServer } from '../../helpers/cloud-server.js';

let buildId = '73364d47-c49d-41fd-886b-373c59cc6804';

async function fixture(t, handler) {
  let cwd = await mkdtemp(join(tmpdir(), 'vizzly-cli-comparisons-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  let { client, requests } = await createCloudServer(t, handler);
  return {
    requests,
    run: (args, env = {}) =>
      runCLI(['--no-color', ...args], {
        cwd,
        env: {
          VIZZLY_API_URL: client.getBaseUrl(),
          VIZZLY_TOKEN: 'vzt_test_token',
          ...env,
        },
      }),
  };
}

for (let json of [false, true]) {
  for (let invalid of [
    'null',
    'undefined',
    '',
    '   ',
    'build-123',
    buildId.replaceAll('-', ''),
    buildId.replace('73364', 'zzzzz'),
    `${buildId}/status`,
    `${buildId}?include=screenshots`,
    `${buildId}\n`,
  ]) {
    test(`comparisons rejects ${JSON.stringify(invalid)} before HTTP (${json ? 'JSON' : 'text'})`, async t => {
      let f = await fixture(t, () =>
        assert.fail('Invalid build IDs must not call the API')
      );
      let result = await f.run([
        'comparisons',
        '--build',
        invalid,
        ...(json ? ['--json'] : []),
      ]);

      assert.equal(result.code, 1);
      if (json) {
        let failure = findJSONMessage(result.stderr, 'error');
        assert.match(failure.message, /Validation errors/);
        assert.match(failure.errors.join('\n'), /--build.*must be a UUID/);
        assert.match(failure.errors.join('\n'), /vizzly builds --json/);
      } else {
        assert.match(result.stderr, /--build.*must be a UUID/);
        assert.match(result.stderr, /vizzly builds --json/);
      }
      assert.deepEqual(f.requests, []);
    });
  }
}

test('invalid comparison build IDs report input guidance without credentials', async t => {
  let f = await fixture(t, () => assert.fail('Must not call the API'));
  let result = await f.run(['comparisons', '--build', 'null'], {
    VIZZLY_TOKEN: undefined,
  });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /--build.*must be a UUID/);
  assert.deepEqual(f.requests, []);
});

for (let id of [buildId, buildId.toUpperCase()]) {
  test(`comparisons preserves valid build ID ${id} and filters results`, async t => {
    let f = await fixture(t, request => {
      assert.equal(request.method, 'GET');
      assert.equal(request.url, `/api/sdk/builds/${id}?include=comparisons`);
      return {
        body: {
          build: {
            id,
            name: 'Checkout',
            comparisons: [
              {
                id: 'changed-1',
                screenshot: { name: 'checkout' },
                result: 'changed',
              },
              {
                id: 'passed-1',
                screenshot: { name: 'button' },
                result: 'identical',
              },
            ],
          },
        },
      };
    });
    let result = await f.run([
      'comparisons',
      '--build',
      id,
      '--status',
      'changed',
      '--json',
    ]);
    assert.equal(result.code, 0, result.stderr);
    let data = findJSONMessage(result.stdout, 'data').data;
    assert.equal(data.buildId, id);
    assert.equal(data.buildName, 'Checkout');
    assert.deepEqual(
      data.comparisons.map(item => item.name),
      ['checkout']
    );
    assert.deepEqual(data.summary, { total: 1, passed: 0, failed: 1, new: 0 });
    assert.equal(f.requests.length, 1);
  });
}

test('an empty latest-build result cannot send a serialized null to comparisons', async t => {
  let f = await fixture(t, request => {
    assert.equal(request.url, '/api/sdk/builds?limit=1&offset=0');
    return {
      body: {
        builds: [],
        meta: { total: 0, limit: 1, offset: 0, hasMore: false },
      },
    };
  });
  let latest = await f.run(['builds', '--limit', '1', '--json']);
  assert.equal(latest.code, 0, latest.stderr);
  let data = findJSONMessage(latest.stdout, 'data').data;
  assert.deepEqual(data.builds, []);
  // An unchecked jq -r '.data.builds[0].id' prints this same literal null.
  let selected = JSON.stringify(data.builds[0]?.id ?? null);
  let result = await f.run(['comparisons', '--build', selected, '--json']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /must be a UUID/);
  assert.equal(f.requests.length, 1, 'Only the build-list request is sent');
});

test('comparisons still gives query guidance when no query is supplied', async t => {
  let f = await fixture(t, () => assert.fail('Must not call the API'));
  let result = await f.run(['comparisons', '--json']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Specify --build/);
  assert.deepEqual(f.requests, []);
});
