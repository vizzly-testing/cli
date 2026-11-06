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
        validateCommentOptions('build-1', 'Looks good', {}),
        []
      );
      assert.deepStrictEqual(validateCommentOptions('', '', {}), [
        'Build ID is required',
        'Comment message is required',
      ]);
    });

    it('validates screenshot layers, regions, and points', () => {
      let screenshot = 'shot-1';
      for (let layer of ['current', 'baseline', 'diff']) {
        assert.deepStrictEqual(
          validateCommentOptions('build-1', 'Note', {
            screenshot,
            layer,
            region: '40,200,320,120',
          }),
          []
        );
      }
      assert.deepStrictEqual(
        validateCommentOptions('build-1', 'Note', {
          screenshot,
          point: '0,100',
        }),
        []
      );
      assert.deepStrictEqual(
        validateCommentOptions('build-1', 'Note', { layer: 'before' }),
        [
          '--layer must be one of: current, baseline, diff',
          '--layer requires --screenshot',
        ]
      );
      assert.deepStrictEqual(
        validateCommentOptions('build-1', 'Note', {
          screenshot,
          replyTo: 'comment-1',
          layer: 'baseline',
          point: '10,10',
        }),
        [
          "Replies inherit their thread's layer; omit --layer",
          "Replies inherit their thread's point; omit --point",
        ]
      );
      assert.deepStrictEqual(
        validateCommentOptions('build-1', 'Note', {
          screenshot,
          region: '1,2,3,4',
          point: '10,10',
        }),
        ['Use either --region or --point, not both']
      );
      for (let point of ['101,5', '5', '1.5,2', ',2', '-1,2']) {
        assert.deepStrictEqual(
          validateCommentOptions('build-1', 'Note', { screenshot, point }),
          ['--point requires x,y as integer percentages from 0 to 100'],
          point
        );
      }
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
      });
      assert.deepStrictEqual(
        createCommentBody('Old footer spacing', {
          screenshot: 'shot-1',
          layer: 'baseline',
          region: '40,200,320,120',
        }),
        {
          content: 'Old footer spacing',
          layer: 'baseline',
          region: { x: 40, y: 200, width: 320, height: 120 },
        }
      );
      assert.deepStrictEqual(
        createCommentBody('Button shifted', {
          screenshot: 'shot-1',
          layer: 'diff',
          point: '50,12',
        }),
        {
          content: 'Button shifted',
          layer: 'diff',
          positionX: 50,
          positionY: 12,
        }
      );
      assert.deepStrictEqual(
        createCommentBody('Agreed', { replyTo: 'comment-1' }),
        { content: 'Agreed', parentCommentId: 'comment-1' }
      );
    });
  });
});
