/**
 * Tests for interaction hook system
 */

import assert from 'node:assert';
import { describe, it, mock } from 'node:test';
import { applyHook, getBeforeScreenshotHook } from '../src/hooks.js';

describe('hooks', () => {
  describe('getBeforeScreenshotHook', () => {
    it('returns null when no hooks match', () => {
      let page = { path: '/about' };
      let config = { interactions: {} };

      let hook = getBeforeScreenshotHook(page, config);

      assert.strictEqual(hook, null);
    });

    it('returns pattern-matched hook', () => {
      let mockHook = mock.fn();
      let page = { path: '/blog/post-1' };
      let config = {
        interactions: {
          '/blog/*': mockHook,
        },
      };

      let hook = getBeforeScreenshotHook(page, config);

      assert.strictEqual(hook, mockHook);
    });

    it('returns exact path match', () => {
      let mockHook = mock.fn();
      let page = { path: '/' };
      let config = {
        interactions: {
          '/': mockHook,
        },
      };

      let hook = getBeforeScreenshotHook(page, config);

      assert.strictEqual(hook, mockHook);
    });

    it('returns named interaction from page config', () => {
      let namedHook = mock.fn();
      let patternHook = mock.fn();
      let page = { path: '/product/item-1' };
      let config = {
        interactions: {
          'show-details': namedHook,
          '/product/*': patternHook,
        },
        pages: {
          '/product/*': {
            interaction: 'show-details',
          },
        },
      };

      let hook = getBeforeScreenshotHook(page, config);

      assert.strictEqual(hook, namedHook);
    });

    it('prioritizes page config over pattern', () => {
      let namedHook = mock.fn();
      let patternHook = mock.fn();
      let page = { path: '/pricing' };
      let config = {
        interactions: {
          'scroll-down': namedHook,
          '**': patternHook,
        },
        pages: {
          '/pricing': {
            interaction: 'scroll-down',
          },
        },
      };

      let hook = getBeforeScreenshotHook(page, config);

      assert.strictEqual(hook, namedHook);
    });
  });

  describe('applyHook', () => {
    it('calls hook function with page', async () => {
      let mockPage = { evaluate: mock.fn() };
      let mockHook = mock.fn();

      await applyHook(mockPage, mockHook);

      assert.strictEqual(mockHook.mock.callCount(), 1);
      assert.deepStrictEqual(mockHook.mock.calls[0].arguments, [mockPage, {}]);
    });

    it('passes context to hook', async () => {
      let mockPage = {};
      let mockHook = mock.fn();
      let context = { viewport: { name: 'mobile' } };

      await applyHook(mockPage, mockHook, context);

      assert.deepStrictEqual(mockHook.mock.calls[0].arguments, [mockPage, context]);
    });

    it('handles null hook gracefully', async () => {
      let mockPage = {};

      let result = await applyHook(mockPage, null);

      assert.strictEqual(result, undefined);
    });

    it('handles non-function hook gracefully', async () => {
      let mockPage = {};

      let result = await applyHook(mockPage, 'not-a-function');

      assert.strictEqual(result, undefined);
    });

    it('throws on hook execution error', async () => {
      let mockPage = {};
      let mockHook = mock.fn(async () => {
        throw new Error('Hook failed');
      });

      await assert.rejects(
        applyHook(mockPage, mockHook),
        /Hook execution failed: Hook failed/
      );
    });
  });
});
