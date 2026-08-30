import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  approveCommand,
  commentCommand,
  createApprovalBody,
  createCommentBody,
  createRejectionBody,
  rejectCommand,
  validateApproveOptions,
  validateCommentOptions,
  validateRejectOptions,
} from '../../src/commands/review.js';

function createMockOutput() {
  let calls = [];
  return {
    calls,
    configure: opts => calls.push({ method: 'configure', args: [opts] }),
    data: obj => calls.push({ method: 'data', args: [obj] }),
    labelValue: (label, value) =>
      calls.push({ method: 'labelValue', args: [label, value] }),
    hint: message => calls.push({ method: 'hint', args: [message] }),
    complete: message => calls.push({ method: 'complete', args: [message] }),
    error: (message, error) =>
      calls.push({ method: 'error', args: [message, error] }),
    startSpinner: message =>
      calls.push({ method: 'startSpinner', args: [message] }),
    stopSpinner: () => calls.push({ method: 'stopSpinner', args: [] }),
    cleanup: () => calls.push({ method: 'cleanup', args: [] }),
  };
}

function createReviewHarness(response = {}) {
  let output = createMockOutput();
  let clientCalls = [];
  let clientConfig = null;
  let exitCode = null;

  return {
    output,
    get clientCalls() {
      return clientCalls;
    },
    get clientConfig() {
      return clientConfig;
    },
    get exitCode() {
      return exitCode;
    },
    deps: {
      loadConfig: async () => ({
        userToken: 'token-123',
        apiUrl: 'https://api.example.test',
      }),
      getAccessToken: async () => null,
      randomUUID: () => 'command-1',
      createApiClient: config => {
        clientConfig = config;
        return {
          request: async (endpoint, options) => {
            clientCalls.push({ endpoint, options });
            if (endpoint === '/api/sdk/comparisons/comparison-1') {
              return {
                comparison: { id: 'comparison-1' },
                review_locator: {
                  comparison_id: 'comparison-1',
                  build_id: 'build-1',
                  organization_slug: 'acme',
                  project_slug: 'website',
                },
              };
            }
            return response;
          },
        };
      },
      output,
      exit: code => {
        exitCode = code;
      },
    },
  };
}

describe('commands/review', () => {
  describe('validation', () => {
    it('validates approve inputs', () => {
      assert.deepStrictEqual(validateApproveOptions('comparison-1'), []);
      assert.deepStrictEqual(validateApproveOptions('  '), [
        'Comparison ID is required',
      ]);
    });

    it('validates reject inputs', () => {
      assert.deepStrictEqual(
        validateRejectOptions('comparison-1', { reason: 'Regression' }),
        []
      );
      assert.deepStrictEqual(validateRejectOptions('', {}), [
        'Comparison ID is required',
        '--reason is required when rejecting',
      ]);
    });

    it('validates comment inputs', () => {
      assert.deepStrictEqual(
        validateCommentOptions('build-1', 'Looks good', { type: 'approval' }),
        []
      );
      assert.deepStrictEqual(
        validateCommentOptions('', '', { type: 'unknown' }),
        [
          'Build ID is required',
          'Comment message is required',
          '--type must be one of: general, approval, rejection',
        ]
      );
    });
  });

  describe('payload helpers', () => {
    it('creates review payloads from command options', () => {
      assert.deepStrictEqual(createApprovalBody({}), {});
      assert.deepStrictEqual(createApprovalBody({ comment: 'LGTM' }), {
        annotation: 'LGTM',
      });
      assert.deepStrictEqual(createRejectionBody({ reason: 'Regression' }), {
        annotation: 'Regression',
      });
      assert.deepStrictEqual(createCommentBody('Needs follow-up', {}), {
        content: 'Needs follow-up',
        type: 'general',
      });
      assert.deepStrictEqual(
        createCommentBody('Approved', { type: 'approval' }),
        {
          content: 'Approved',
          type: 'approval',
        }
      );
    });
  });

  describe('approveCommand', () => {
    it('finds the review context and approves the comparison', async () => {
      let harness = createReviewHarness({
        eventId: 'event-1',
        idempotent: false,
        review: { build: { state: 'approved' } },
      });

      await approveCommand('comparison-1', {}, { json: true }, harness.deps);

      assert.deepStrictEqual(harness.clientConfig, {
        baseUrl: 'https://api.example.test',
        token: 'token-123',
        command: 'approve',
      });
      assert.deepStrictEqual(harness.clientCalls, [
        {
          endpoint: '/api/sdk/comparisons/comparison-1',
          options: undefined,
        },
        {
          endpoint:
            '/api/visual-review/builds/build-1/comparisons/comparison-1/decision',
          options: {
            method: 'POST',
            body: JSON.stringify({
              commandId: 'command-1',
              decision: 'approved',
            }),
            headers: {
              'Content-Type': 'application/json',
              'X-Organization': 'acme',
            },
          },
        },
      ]);

      let dataCall = harness.output.calls.find(call => call.method === 'data');
      assert.deepStrictEqual(dataCall.args[0], {
        eventId: 'event-1',
        idempotent: false,
        review: { build: { state: 'approved' } },
      });
    });

    it('sends an approval comment when provided', async () => {
      let harness = createReviewHarness({
        eventId: 'event-1',
        idempotent: false,
        review: { build: { state: 'approved' } },
      });

      await approveCommand(
        'comparison-1',
        { comment: 'LGTM' },
        {},
        harness.deps
      );

      assert.deepStrictEqual(harness.clientCalls[1].options, {
        method: 'POST',
        body: JSON.stringify({
          commandId: 'command-1',
          decision: 'approved',
          annotation: 'LGTM',
        }),
        headers: {
          'Content-Type': 'application/json',
          'X-Organization': 'acme',
        },
      });
      assert.ok(
        harness.output.calls.some(
          call =>
            call.method === 'complete' && call.args[0].includes('approved')
        )
      );
      assert.ok(
        harness.output.calls.some(
          call => call.method === 'hint' && call.args[0] === 'Comment: "LGTM"'
        )
      );
    });
  });

  describe('rejectCommand', () => {
    it('rejects a comparison with a required reason', async () => {
      let harness = createReviewHarness({
        eventId: 'event-2',
        idempotent: false,
        review: { build: { state: 'rejected' } },
      });

      await rejectCommand(
        'comparison-1',
        { reason: 'Visual regression' },
        { json: true },
        harness.deps
      );

      assert.deepStrictEqual(harness.clientCalls, [
        {
          endpoint: '/api/sdk/comparisons/comparison-1',
          options: undefined,
        },
        {
          endpoint:
            '/api/visual-review/builds/build-1/comparisons/comparison-1/decision',
          options: {
            method: 'POST',
            body: JSON.stringify({
              commandId: 'command-1',
              decision: 'rejected',
              annotation: 'Visual regression',
            }),
            headers: {
              'Content-Type': 'application/json',
              'X-Organization': 'acme',
            },
          },
        },
      ]);

      let dataCall = harness.output.calls.find(call => call.method === 'data');
      assert.deepStrictEqual(dataCall.args[0], {
        eventId: 'event-2',
        idempotent: false,
        review: { build: { state: 'rejected' } },
      });
    });

    it('exits before API work when reason is missing', async () => {
      let harness = createReviewHarness();

      await rejectCommand('comparison-1', {}, {}, harness.deps);

      assert.strictEqual(harness.exitCode, 1);
      assert.deepStrictEqual(harness.clientCalls, []);
      assert.ok(harness.output.calls.some(call => call.method === 'cleanup'));
    });
  });

  describe('commentCommand', () => {
    it('creates a build comment and prints human-readable output', async () => {
      let harness = createReviewHarness({
        comment: { id: 'comment-1', content: 'Looks good' },
      });

      await commentCommand(
        'build-1',
        'Looks good',
        { type: 'approval' },
        {},
        harness.deps
      );

      assert.deepStrictEqual(harness.clientConfig, {
        baseUrl: 'https://api.example.test',
        token: 'token-123',
        command: 'comment',
      });
      assert.deepStrictEqual(harness.clientCalls, [
        {
          endpoint: '/api/sdk/builds/build-1/comments',
          options: {
            method: 'POST',
            body: JSON.stringify({
              content: 'Looks good',
              type: 'approval',
            }),
            headers: { 'Content-Type': 'application/json' },
          },
        },
      ]);
      assert.ok(
        harness.output.calls.some(
          call => call.method === 'complete' && call.args[0] === 'Comment added'
        )
      );
      assert.ok(
        harness.output.calls.some(
          call =>
            call.method === 'labelValue' &&
            call.args[0] === 'Message' &&
            call.args[1] === 'Looks good'
        )
      );
    });

    it('exits before API work when the message is blank', async () => {
      let harness = createReviewHarness();

      await commentCommand('build-1', '   ', {}, {}, harness.deps);

      assert.strictEqual(harness.exitCode, 1);
      assert.deepStrictEqual(harness.clientCalls, []);
      assert.ok(harness.output.calls.some(call => call.method === 'cleanup'));
    });
  });

  describe('error handling', () => {
    it('cleans up and exits when no API token is configured', async () => {
      let output = createMockOutput();
      let exitCode = null;

      await approveCommand(
        'comparison-1',
        {},
        {},
        {
          loadConfig: async () => ({ apiUrl: 'https://api.example.test' }),
          getAccessToken: async () => null,
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      assert.ok(output.calls.some(call => call.method === 'error'));
      assert.ok(output.calls.some(call => call.method === 'hint'));
      assert.ok(output.calls.some(call => call.method === 'cleanup'));
    });

    it('returns JSON failure details when an API request fails', async () => {
      let output = createMockOutput();
      let exitCode = null;
      let error = new Error('API failed');
      error.code = 'server_error';

      await commentCommand(
        'build-1',
        'Looks good',
        {},
        { json: true },
        {
          loadConfig: async () => ({
            userToken: 'token-123',
            apiUrl: 'https://api.example.test',
          }),
          getAccessToken: async () => null,
          createApiClient: () => ({
            request: async () => {
              throw error;
            },
          }),
          output,
          exit: code => {
            exitCode = code;
          },
        }
      );

      assert.strictEqual(exitCode, 1);
      let dataCall = output.calls.find(call => call.method === 'data');
      assert.deepStrictEqual(dataCall.args[0], {
        created: false,
        buildId: 'build-1',
        error: { message: 'API failed', code: 'server_error' },
      });
      assert.ok(output.calls.some(call => call.method === 'cleanup'));
    });
  });
});
