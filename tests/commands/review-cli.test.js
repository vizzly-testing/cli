import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { runCLI } from '../helpers/cli-runner.js';

function createWorkspace() {
  let cwd = mkdtempSync(join(tmpdir(), 'vizzly-cli-review-'));
  let vizzlyHome = join(cwd, '.vizzly-home');
  mkdirSync(vizzlyHome, { recursive: true });
  writeFileSync(
    join(vizzlyHome, 'config.json'),
    JSON.stringify({
      auth: {
        accessToken: 'user-access-token',
        refreshToken: 'user-refresh-token',
        expiresAt: '2099-01-01T00:00:00.000Z',
        user: { id: 'user-1' },
      },
    })
  );
  return { cwd, vizzlyHome };
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let chunks = [];
  for await (let chunk of req) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function reviewResponse(state) {
  return {
    review: {
      build: {
        id: state.buildId,
        state: state.decision,
      },
      comparisons: [
        {
          id: state.comparisonId,
          reviewState: state.decision,
          annotation: state.annotation,
        },
      ],
    },
  };
}

function createReviewState() {
  return {
    annotation: null,
    buildId: 'build-1',
    comparisonId: 'comparison-1',
    decision: 'pending',
    decisionRequests: [],
    eventsByCommandId: new Map(),
    failAfterNextDecision: false,
    history: [],
    organizationSlug: 'acme',
    refreshRequests: 0,
  };
}

function sameCommand(left, right) {
  return (
    left.commandId === right.commandId &&
    left.decision === right.decision &&
    left.annotation === right.annotation
  );
}

async function handleDecision(req, res, state) {
  let body = await readJson(req);
  state.decisionRequests.push({
    authorization: req.headers.authorization,
    body,
    organization: req.headers['x-organization'],
  });

  let existing = state.eventsByCommandId.get(body.commandId);
  if (existing) {
    if (!sameCommand(existing.command, body)) {
      sendJson(res, 409, {
        code: 'COMMAND_CONFLICT',
        error: 'Command ID was already used for a different decision',
      });
      return;
    }

    sendJson(res, 200, { ...existing.response, idempotent: true });
    return;
  }

  state.decision = body.decision;
  state.annotation = body.annotation ?? null;
  state.history.push({
    annotation: state.annotation,
    decision: state.decision,
  });

  let response = {
    eventId: `event-${state.history.length}`,
    idempotent: false,
    ...reviewResponse(state),
  };
  state.eventsByCommandId.set(body.commandId, { command: body, response });

  if (state.failAfterNextDecision) {
    state.failAfterNextDecision = false;
    sendJson(res, 401, { error: 'Access token expired' });
    return;
  }

  sendJson(res, 200, response);
}

async function withReviewApiServer(callback) {
  let state = createReviewState();
  let decisionPath = `/api/visual-review/builds/${state.buildId}/comparisons/${state.comparisonId}/decision`;
  let server = createServer(async (req, res) => {
    try {
      if (
        req.method === 'GET' &&
        req.url === `/api/sdk/comparisons/${state.comparisonId}`
      ) {
        sendJson(res, 200, {
          id: state.comparisonId,
          review_locator: {
            build_id: state.buildId,
            comparison_id: state.comparisonId,
            organization_slug: state.organizationSlug,
          },
        });
        return;
      }

      if (req.method === 'POST' && req.url === decisionPath) {
        await handleDecision(req, res, state);
        return;
      }

      if (req.method === 'POST' && req.url === '/api/auth/cli/refresh') {
        let body = await readJson(req);
        state.refreshRequests += 1;
        assert.strictEqual(body.refreshToken, 'user-refresh-token');
        sendJson(res, 200, {
          accessToken: 'refreshed-user-access-token',
          refreshToken: 'refreshed-user-refresh-token',
          expiresAt: '2099-01-01T00:00:00.000Z',
        });
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  });

  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    let address = server.address();
    await callback({
      apiUrl: `http://127.0.0.1:${address.port}`,
      state,
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function parseResult(result) {
  assert.notStrictEqual(result.stdout, '');
  return JSON.parse(result.stdout).data;
}

describe('commands/review CLI', () => {
  it('does not overstate review identifier formats in help', async () => {
    let approve = await runCLI(['--no-color', 'approve', '--help']);
    let reject = await runCLI(['--no-color', 'reject', '--help']);
    let comment = await runCLI(['--no-color', 'comment', '--help']);

    assert.strictEqual(approve.code, 0);
    assert.strictEqual(reject.code, 0);
    assert.strictEqual(comment.code, 0);

    assert.doesNotMatch(approve.stdout, /UUID format/);
    assert.doesNotMatch(reject.stdout, /UUID format/);
    assert.doesNotMatch(comment.stdout, /UUID format/);
  });

  it('changes review decisions and safely retries the same command', async () => {
    await withReviewApiServer(async ({ apiUrl, state }) => {
      let { cwd, vizzlyHome } = createWorkspace();
      let env = { VIZZLY_API_URL: apiUrl, VIZZLY_HOME: vizzlyHome };

      state.failAfterNextDecision = true;
      let approve = await runCLI(
        [
          '--no-color',
          '--json',
          'approve',
          state.comparisonId,
          '--comment',
          'Ready to ship',
        ],
        { cwd, env }
      );

      assert.strictEqual(approve.code, 0, approve.stderr);
      let approveData = parseResult(approve);
      assert.strictEqual(approveData.eventId, 'event-1');
      assert.strictEqual(approveData.idempotent, true);
      assert.strictEqual(approveData.review.build.state, 'approved');
      assert.strictEqual(state.refreshRequests, 1);
      assert.deepStrictEqual(state.history, [
        {
          annotation: 'Ready to ship',
          decision: 'approved',
        },
      ]);
      assert.strictEqual(state.decisionRequests.length, 2);
      assert.deepStrictEqual(
        state.decisionRequests[1].body,
        state.decisionRequests[0].body
      );
      assert.strictEqual(state.decisionRequests[0].organization, 'acme');
      assert.strictEqual(
        state.decisionRequests[0].authorization,
        'Bearer user-access-token'
      );
      assert.strictEqual(
        state.decisionRequests[1].authorization,
        'Bearer refreshed-user-access-token'
      );

      let reject = await runCLI(
        [
          '--no-color',
          '--json',
          'reject',
          state.comparisonId,
          '--reason',
          'Header moved',
        ],
        { cwd, env }
      );

      assert.strictEqual(reject.code, 0, reject.stderr);
      let rejectData = parseResult(reject);
      assert.strictEqual(rejectData.eventId, 'event-2');
      assert.strictEqual(rejectData.idempotent, false);
      assert.strictEqual(rejectData.review.build.state, 'rejected');
      assert.deepStrictEqual(state.history[1], {
        annotation: 'Header moved',
        decision: 'rejected',
      });

      let approveAgain = await runCLI(
        [
          '--no-color',
          '--json',
          'approve',
          state.comparisonId,
          '--comment',
          'Updated review is ready',
        ],
        { cwd, env }
      );

      assert.strictEqual(approveAgain.code, 0, approveAgain.stderr);
      let approveAgainData = parseResult(approveAgain);
      assert.strictEqual(approveAgainData.eventId, 'event-3');
      assert.strictEqual(approveAgainData.review.build.state, 'approved');
      assert.strictEqual(state.decision, 'approved');
      assert.strictEqual(state.annotation, 'Updated review is ready');
      assert.strictEqual(state.history.length, 3);
    });
  });
});
