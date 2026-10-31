import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCloudServer } from '../../../tests/helpers/cloud-server.js';
import {
  getBuildContext,
  getComparisonContext,
  getReviewQueueContext,
  getScreenshotContext,
  getSimilarFingerprintContext,
  getTokenContext,
} from './context.service.js';

describe('cloud context', () => {
  it('preserves scoped evidence and pagination across all context resources', async t => {
    let evidence = {
      items: [{ name: 'Dashboard/Header' }],
      cursor: 'next/page',
    };
    let { client, requests } = await createCloudServer(t, () => ({
      body: evidence,
    }));
    let scenarios = [
      [
        () => getBuildContext(client, 'build-1'),
        '/api/sdk/context/builds/build-1',
      ],
      [
        () =>
          getBuildContext(client, 'build-1', {
            details: 'summary',
            limit: 10,
            cursor: 'next/page',
          }),
        '/api/sdk/context/builds/build-1?details=summary&limit=10&cursor=next%2Fpage',
      ],
      [
        () =>
          getComparisonContext(client, 'comparison-1', {
            details: 'diffs',
            limit: 10,
            cursor: 'next/page',
          }),
        '/api/sdk/context/comparisons/comparison-1?details=diffs&limit=10&cursor=next%2Fpage',
      ],
      [
        () =>
          getScreenshotContext(client, 'Dashboard/Header', {
            project: 'storybook',
            organization: 'acme',
          }),
        '/api/sdk/context/screenshots/Dashboard%2FHeader?project=storybook&organization=acme',
      ],
      [
        () =>
          getSimilarFingerprintContext(client, 'fp:dashboard', {
            project: 'storybook',
            limit: 7,
          }),
        '/api/sdk/context/fingerprints/fp%3Adashboard/similar?project=storybook&limit=7',
      ],
      [
        () =>
          getReviewQueueContext(client, {
            project: 'storybook',
            organization: 'acme',
            limit: 15,
            offset: 30,
          }),
        '/api/sdk/context/review-queue?project=storybook&organization=acme&limit=15&offset=30',
      ],
      [() => getTokenContext(client), '/api/sdk/token/context'],
    ];
    for (let [read, url] of scenarios) {
      assert.deepEqual(await read(), evidence);
      assert.equal(requests.at(-1).url, url);
      assert.equal(requests.at(-1).method, 'GET');
    }
  });

  it('surfaces a stale context cursor with its structured recovery code', async t => {
    let { client } = await createCloudServer(t, () => ({
      status: 409,
      body: {
        error: 'Context evidence changed; request the first page again',
        details: { code: 'CONTEXT_CURSOR_STALE' },
      },
    }));
    await assert.rejects(
      () => getBuildContext(client, 'build-1', { cursor: 'old-page' }),
      error => {
        assert.equal(error.code, 'CONTEXT_CURSOR_STALE');
        assert.equal(error.context.status, 409);
        assert.match(error.message, /request the first page again/);
        return true;
      }
    );
  });
});
