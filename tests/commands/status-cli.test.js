import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { runCLI } from '../helpers/cli-runner.js';

function createWorkspace() {
  return mkdtempSync(join(tmpdir(), 'vizzly-cli-status-'));
}

async function withApiServer(callback) {
  let requests = [];
  let server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url });
    res.setHeader('content-type', 'application/json');

    if (
      req.method === 'GET' &&
      req.url === '/api/sdk/builds/build-123/status'
    ) {
      res.end(
        JSON.stringify({
          resource: 'build_status',
          schema_version: 1,
          build: {
            id: 'build-123',
            status: 'completed',
            name: 'No Preview Build',
            created_at: '2026-06-11T21:00:00.000Z',
            updated_at: '2026-06-11T21:01:00.000Z',
            completed_at: '2026-06-11T21:02:00.000Z',
            environment: 'local-dogfood',
            branch: 'main',
            commit_sha: 'abcdef1234567890',
            commit_message: 'Dogfood status',
            visual_review: { state: 'pending' },
            execution_time_ms: 100,
            is_baseline: false,
            user_agent: 'vizzly-test',
          },
          conclusion: 'review_required',
          processing: {
            total: 1,
            completed: 1,
            failed: 0,
            active: 0,
            pending: 0,
          },
          comparisons: { total: 1, new: 1, changed: 0, identical: 0 },
          review: { pending: 1, approved: 0, rejected: 0 },
          reviewFlow: 'cricket',
          visualReview: { build: { state: 'pending' } },
          scope: {
            organization: { id: 'org-1', slug: 'acme' },
            project: { id: 'project-1', slug: 'web' },
          },
          links: {
            web: 'https://app.test/acme/web/builds/build-123',
          },
        })
      );
      return;
    }

    if (
      req.method === 'GET' &&
      req.url === '/api/sdk/builds/build-123/preview'
    ) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Preview not found for this build' }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    let address = server.address();
    return await callback({
      apiUrl: `http://127.0.0.1:${address.port}`,
      requests,
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

describe('commands/status CLI', () => {
  it('reports build status when the build has no preview', async () => {
    await withApiServer(async ({ apiUrl, requests }) => {
      let result = await runCLI(
        ['--no-color', '--json', 'status', 'build-123'],
        {
          cwd: createWorkspace(),
          env: {
            VIZZLY_API_URL: apiUrl,
            VIZZLY_TOKEN: 'vzt_test_token',
          },
        }
      );

      assert.strictEqual(result.code, 0);
      assert.strictEqual(result.stderr, '');

      let payload = JSON.parse(result.stdout);
      assert.strictEqual(payload.status, 'data');
      assert.strictEqual(payload.data.resource, 'build_status');
      assert.strictEqual(payload.data.schemaVersion, 1);
      assert.strictEqual(payload.data.buildId, 'build-123');
      assert.strictEqual(payload.data.status, 'completed');
      assert.strictEqual(payload.data.conclusion, 'review_required');
      assert.deepStrictEqual(payload.data.processing, {
        total: 1,
        completed: 1,
        failed: 0,
        active: 0,
        pending: 0,
      });
      assert.strictEqual(payload.data.reviewState, 'pending');
      assert.ok(!Object.hasOwn(payload.data, 'approvalStatus'));
      assert.strictEqual(
        payload.data.links.web,
        'https://app.test/acme/web/builds/build-123'
      );
      assert.strictEqual(payload.data.preview, null);
      assert.deepStrictEqual(
        requests.map(request => `${request.method} ${request.url}`),
        [
          'GET /api/sdk/builds/build-123/status',
          'GET /api/sdk/builds/build-123/preview',
        ]
      );
    });
  });
});
