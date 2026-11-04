import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { getAuthStoragePath } from '../../../src/domains/auth/token-store.js';
import {
  fixtureAuthorization,
  saveFixtureAuth,
} from '../../helpers/auth-session.js';
import { runCLI } from '../../helpers/cli-runner.js';

async function createWorkspace(apiUrl) {
  let cwd = mkdtempSync(join(tmpdir(), 'vizzly-cli-review-'));
  let vizzlyHome = join(cwd, '.vizzly-home');
  await saveFixtureAuth(vizzlyHome, apiUrl, {
    accessToken: 'user-access-token',
    refreshToken: 'user-refresh-token',
    user: { id: 'user-1' },
  });
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
    comments: [],
    commentStatus: 200,
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

      if (
        req.method === 'POST' &&
        (req.url === `/api/sdk/builds/${state.buildId}/comments` ||
          req.url ===
            `/api/sdk/builds/${state.buildId}/screenshots/shot-1/comments`)
      ) {
        let body = await readJson(req);
        state.comments.push(body);
        sendJson(
          res,
          state.commentStatus,
          state.commentStatus === 200
            ? { comment: { id: 'comment-1', ...body } }
            : { error: 'Comment service unavailable' }
        );
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
          authorization: fixtureAuthorization,
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
      let { cwd, vizzlyHome } = await createWorkspace(apiUrl);
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

  it('prints approval annotations and human comments, and reports comment failures without replay', async t => {
    await withReviewApiServer(async ({ apiUrl, state }) => {
      let { cwd, vizzlyHome } = await createWorkspace(apiUrl);
      t.after(() => rmSync(cwd, { recursive: true, force: true }));
      let env = { VIZZLY_API_URL: apiUrl, VIZZLY_HOME: vizzlyHome };
      let approved = await runCLI(
        [
          '--no-color',
          'approve',
          state.comparisonId,
          '--comment',
          'Ready to ship',
        ],
        { cwd, env }
      );
      assert.equal(approved.code, 0, approved.stderr);
      assert.match(approved.stdout + approved.stderr, /approved/);
      assert.match(approved.stdout + approved.stderr, /Ready to ship/);
      let commented = await runCLI(
        [
          '--no-color',
          'comment',
          state.buildId,
          'Looks good',
          '--type',
          'approval',
        ],
        { cwd, env }
      );
      assert.equal(commented.code, 0, commented.stderr);
      assert.match(commented.stdout + commented.stderr, /Comment added/);
      assert.match(commented.stdout + commented.stderr, /Looks good/);
      assert.deepEqual(state.comments, [
        { content: 'Looks good', type: 'approval' },
      ]);
      state.commentStatus = 503;
      let failed = await runCLI(
        ['--json', 'comment', state.buildId, 'Follow up'],
        { cwd, env }
      );
      assert.equal(failed.code, 1);
      assert.equal(parseResult(failed).created, false);
      assert.match(
        parseResult(failed).error.message,
        /Comment service unavailable/
      );
      assert.equal(state.comments.length, 2);
      assert.equal(state.refreshRequests, 0);
    });
  });

  it('rejects missing reasons, blank messages, and missing login before making review changes', async t => {
    await withReviewApiServer(async ({ apiUrl, state }) => {
      let { cwd, vizzlyHome } = await createWorkspace(apiUrl);
      t.after(() => rmSync(cwd, { recursive: true, force: true }));
      let env = { VIZZLY_API_URL: apiUrl, VIZZLY_HOME: vizzlyHome };
      for (let args of [
        ['reject', state.comparisonId],
        ['comment', state.buildId, '   '],
      ]) {
        let result = await runCLI(['--no-color', ...args], { cwd, env });
        assert.equal(result.code, 1);
        assert.match(result.stderr, /reason|message.*required/i);
      }
      rmSync(getAuthStoragePath(apiUrl, vizzlyHome));
      let result = await runCLI(['--no-color', 'approve', state.comparisonId], {
        cwd,
        env,
      });
      assert.equal(result.code, 1);
      assert.match(result.stderr, /[Ll]ogin required/);
      assert.equal(state.decisionRequests.length, 0);
      assert.equal(state.comments.length, 0);
      assert.equal(state.refreshRequests, 0);
    });
  });
});

describe('agent review disclosure through the CLI', () => {
  for (let [slug, name, markers] of [
    [
      'codex',
      'Codex',
      {
        CODEX_THREAD_ID: 'private-thread',
        CODEX_SESSION_ID: 'private-session',
      },
    ],
    ['claude-code', 'Claude Code', { CLAUDECODE: '1' }],
    ['pi', 'Pi', { PI_SESSION_ID: 'private-pi-session' }],
    ['gemini-cli', 'Gemini CLI', { GEMINI_CLI: '1' }],
    ['opencode', 'OpenCode', { OPENCODE: '1' }],
  ]) {
    it(`discloses ${name} on approvals, rejections and region comments without sending marker values`, async () => {
      await withReviewApiServer(async ({ apiUrl, state }) => {
        let { cwd, vizzlyHome } = await createWorkspace(apiUrl);
        try {
          let env = {
            VIZZLY_API_URL: apiUrl,
            VIZZLY_HOME: vizzlyHome,
            ...markers,
          };
          for (let args of [
            ['approve', state.comparisonId],
            ['reject', state.comparisonId, '--reason', 'Header overlaps'],
            [
              'comment',
              state.buildId,
              'Header overlaps',
              '--screenshot',
              'shot-1',
              '--region',
              '0,20,200,80',
            ],
          ]) {
            let result = await runCLI(['--json', '--no-color', ...args], {
              cwd,
              env,
            });
            assert.equal(result.code, 0, result.stderr + result.stdout);
          }
          let bodies = [
            ...state.decisionRequests.map(request => request.body),
            ...state.comments,
          ];
          assert.equal(bodies.length, 3);
          for (let body of bodies) {
            assert.deepEqual(body.via, {
              type: 'agent',
              slug,
              name,
              version: null,
            });
            assert.doesNotMatch(
              JSON.stringify(body),
              /private-thread|private-session|private-pi-session|SESSION_ID|THREAD_ID/
            );
          }
          assert.deepEqual(state.comments[0].region, {
            x: 0,
            y: 20,
            width: 200,
            height: 80,
          });
        } finally {
          rmSync(cwd, { recursive: true, force: true });
        }
      });
    });
  }

  it('handles conflicts, explicit overrides, opt-out and false-positive environments before mutation', async () => {
    await withReviewApiServer(async ({ apiUrl, state }) => {
      let { cwd, vizzlyHome } = await createWorkspace(apiUrl);
      try {
        let base = { VIZZLY_API_URL: apiUrl, VIZZLY_HOME: vizzlyHome };
        let conflict = { ...base, CODEX_THREAD_ID: 'secret', CLAUDECODE: '1' };
        let blocked = await runCLI(
          ['--json', 'comment', state.buildId, 'Conflict'],
          { cwd, env: conflict }
        );
        assert.equal(blocked.code, 1);
        assert.match(blocked.stdout, /AMBIGUOUS_AGENT_ATTRIBUTION/);
        assert.equal(state.comments.length, 0);
        for (let [flags, env, slug] of [
          [
            ['--via-agent', 'pi'],
            { ...conflict, VIZZLY_VIA_AGENT: 'gemini-cli' },
            'pi',
          ],
          [['--no-agent-attribution'], conflict, null],
          [[], { ...conflict, VIZZLY_VIA_AGENT: 'opencode' }, 'opencode'],
          [[], { ...conflict, VIZZLY_VIA_AGENT: 'none' }, null],
          [
            [],
            {
              ...base,
              TERM_PROGRAM: 'vscode',
              VSCODE_PID: '1',
              AGENT: '1',
              CI: 'true',
              GEMINI_CLI: '0',
              CLAUDECODE: '0',
            },
            null,
          ],
          [[], base, null],
        ]) {
          let result = await runCLI(
            ['--json', ...flags, 'comment', state.buildId, 'Review note'],
            { cwd, env }
          );
          assert.equal(result.code, 0, result.stdout + result.stderr);
          assert.equal(state.comments.at(-1).via?.slug ?? null, slug);
        }
        let raw = await runCLI(
          [
            '--json',
            '--via-agent',
            'codex',
            'api',
            `/api/sdk/builds/${state.buildId}/comments`,
            '-X',
            'POST',
            '-d',
            '{"content":"Raw review note"}',
          ],
          { cwd, env: base }
        );
        assert.equal(raw.code, 0, raw.stdout + raw.stderr);
        assert.equal(state.comments.at(-1).via.slug, 'codex');
        let count = state.comments.length;
        for (let flags of [
          ['--via-agent', 'BAD'],
          ['--via-agent', 'codex', '--no-agent-attribution'],
        ]) {
          let result = await runCLI(
            ['--json', ...flags, 'comment', state.buildId, 'Invalid'],
            { cwd, env: base }
          );
          assert.equal(result.code, 1);
          assert.match(result.stdout, /INVALID_AGENT_ATTRIBUTION/);
        }
        assert.equal(state.comments.length, count);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  });

  it('rejects malformed or unscoped regions before sending comments', async () => {
    for (let flags of [
      ['--region', '1,2,3,4'],
      ['--screenshot', 'shot-1', '--region', '-1,2,3,4'],
      ['--screenshot', 'shot-1', '--region', '1,2,0,4'],
      ['--screenshot', 'shot-1', '--region', '1,,3,4'],
    ]) {
      let result = await runCLI([
        '--json',
        'comment',
        'build-1',
        'Note',
        ...flags,
      ]);
      assert.equal(result.code, 1);
      assert.match(result.stdout + result.stderr, /region/);
    }
  });
});

it('review commands honor explicit project tokens and granted user scopes', async () => {
  await withReviewApiServer(async ({ apiUrl, state }) => {
    let { cwd, vizzlyHome } = await createWorkspace(apiUrl);
    try {
      let env = {
        VIZZLY_API_URL: apiUrl,
        VIZZLY_HOME: vizzlyHome,
        VIZZLY_TOKEN: 'vzt_explicit-project',
      };
      let denied = await runCLI(
        ['--json', 'comment', state.buildId, 'Must not impersonate'],
        { cwd, env }
      );
      assert.equal(denied.code, 1);
      assert.match(denied.stdout, /USER_AUTH_REQUIRED/);
      assert.equal(state.comments.length, 0);
      let user = await runCLI(
        ['--json', 'comment', state.buildId, 'Chosen user', '--auth', 'user'],
        { cwd, env }
      );
      assert.equal(user.code, 0, user.stdout + user.stderr);
      assert.equal(state.comments.length, 1);
      await saveFixtureAuth(vizzlyHome, apiUrl, {
        authorization: { ...fixtureAuthorization, scopes: ['read'] },
      });
      delete env.VIZZLY_TOKEN;
      for (let args of [
        ['comment', state.buildId, 'No write scope'],
        ['approve', state.comparisonId],
      ]) {
        let denied = await runCLI(['--json', ...args], { cwd, env });
        assert.equal(denied.code, 1);
        assert.match(denied.stdout, /INSUFFICIENT_SCOPE/);
      }
      assert.equal(state.comments.length, 1);
      assert.equal(state.decisionRequests.length, 0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
