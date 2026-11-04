import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createApprovalBody,
  createCommentBody,
  createRejectionBody,
  validateApproveOptions,
  validateCommentOptions,
  validateRejectOptions,
} from './review.commands.js';

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
          '--type must be one of: general, approval, rejection, question',
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
});
