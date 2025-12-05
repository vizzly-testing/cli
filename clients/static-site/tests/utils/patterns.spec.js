/**
 * Tests for pattern matching utilities
 */

import { describe, expect, it } from 'vitest';
import { filterByPattern, findMatchingHook } from '../../src/utils/patterns.js';

describe('patterns', () => {
  describe('filterByPattern', () => {
    it('should return all pages when no filters', () => {
      let pages = [{ path: '/' }, { path: '/about' }, { path: '/blog/post-1' }];

      let filtered = filterByPattern(pages, null, null);

      expect(filtered).toHaveLength(3);
    });

    it('should filter by include pattern', () => {
      let pages = [
        { path: '/' },
        { path: '/about' },
        { path: '/blog/post-1' },
        { path: '/blog/post-2' },
      ];

      let filtered = filterByPattern(pages, '/blog/*', null);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(p => p.path.startsWith('/blog/'))).toBe(true);
    });

    it('should filter by exclude pattern', () => {
      let pages = [
        { path: '/' },
        { path: '/about' },
        { path: '/blog/draft' },
        { path: '/blog/post-1' },
      ];

      let filtered = filterByPattern(pages, null, '/blog/draft');

      expect(filtered).toHaveLength(3);
      expect(filtered.find(p => p.path === '/blog/draft')).toBeUndefined();
    });

    it('should apply both include and exclude', () => {
      let pages = [
        { path: '/' },
        { path: '/blog/draft' },
        { path: '/blog/post-1' },
        { path: '/docs/guide' },
      ];

      let filtered = filterByPattern(pages, '/blog/*', '/blog/draft');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].path).toBe('/blog/post-1');
    });

    it('should handle wildcard patterns', () => {
      let pages = [
        { path: '/' },
        { path: '/docs/intro' },
        { path: '/docs/advanced/setup' },
      ];

      let filtered = filterByPattern(pages, '/docs/**', null);

      expect(filtered).toHaveLength(2);
    });
  });

  describe('findMatchingHook', () => {
    it('should return null when no hooks', () => {
      let page = { path: '/about' };
      let hooks = {};

      let hook = findMatchingHook(page, hooks);

      expect(hook).toBeNull();
    });

    it('should match exact path', () => {
      let mockHook = () => {};
      let page = { path: '/' };
      let hooks = { '/': mockHook };

      let hook = findMatchingHook(page, hooks);

      expect(hook).toBe(mockHook);
    });

    it('should match pattern', () => {
      let mockHook = () => {};
      let page = { path: '/blog/post-1' };
      let hooks = { '/blog/*': mockHook };

      let hook = findMatchingHook(page, hooks);

      expect(hook).toBe(mockHook);
    });

    it('should match wildcard', () => {
      let mockHook = () => {};
      let page = { path: '/docs/guide/intro' };
      let hooks = { '/docs/**': mockHook };

      let hook = findMatchingHook(page, hooks);

      expect(hook).toBe(mockHook);
    });

    it('should return first matching hook', () => {
      let hook1 = () => {};
      let hook2 = () => {};
      let page = { path: '/blog/post' };
      let hooks = {
        '/blog/*': hook1,
        '**': hook2,
      };

      let hook = findMatchingHook(page, hooks);

      expect(hook).toBe(hook1);
    });
  });
});
