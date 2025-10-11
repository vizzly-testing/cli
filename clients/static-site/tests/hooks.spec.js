/**
 * Tests for interaction hook system
 */

import { describe, it, expect, vi } from 'vitest';
import { getBeforeScreenshotHook, applyHook } from '../src/hooks.js';

describe('hooks', () => {
  describe('getBeforeScreenshotHook', () => {
    it('should return null when no hooks match', () => {
      let page = { path: '/about' };
      let config = { interactions: {} };

      let hook = getBeforeScreenshotHook(page, config);

      expect(hook).toBeNull();
    });

    it('should return pattern-matched hook', () => {
      let mockHook = vi.fn();
      let page = { path: '/blog/post-1' };
      let config = {
        interactions: {
          '/blog/*': mockHook,
        },
      };

      let hook = getBeforeScreenshotHook(page, config);

      expect(hook).toBe(mockHook);
    });

    it('should return exact path match', () => {
      let mockHook = vi.fn();
      let page = { path: '/' };
      let config = {
        interactions: {
          '/': mockHook,
        },
      };

      let hook = getBeforeScreenshotHook(page, config);

      expect(hook).toBe(mockHook);
    });

    it('should return named interaction from page config', () => {
      let namedHook = vi.fn();
      let patternHook = vi.fn();
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

      expect(hook).toBe(namedHook);
    });

    it('should prioritize page config over pattern', () => {
      let namedHook = vi.fn();
      let patternHook = vi.fn();
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

      expect(hook).toBe(namedHook);
    });
  });

  describe('applyHook', () => {
    it('should call hook function with page', async () => {
      let mockPage = { evaluate: vi.fn() };
      let mockHook = vi.fn();

      await applyHook(mockPage, mockHook);

      expect(mockHook).toHaveBeenCalledWith(mockPage, {});
    });

    it('should pass context to hook', async () => {
      let mockPage = {};
      let mockHook = vi.fn();
      let context = { viewport: { name: 'mobile' } };

      await applyHook(mockPage, mockHook, context);

      expect(mockHook).toHaveBeenCalledWith(mockPage, context);
    });

    it('should handle null hook gracefully', async () => {
      let mockPage = {};

      await expect(applyHook(mockPage, null)).resolves.toBeUndefined();
    });

    it('should handle non-function hook gracefully', async () => {
      let mockPage = {};

      await expect(applyHook(mockPage, 'not-a-function')).resolves.toBeUndefined();
    });

    it('should throw on hook execution error', async () => {
      let mockPage = {};
      let mockHook = vi.fn().mockRejectedValue(new Error('Hook failed'));

      await expect(applyHook(mockPage, mockHook)).rejects.toThrow(
        'Hook execution failed: Hook failed'
      );
    });
  });
});
