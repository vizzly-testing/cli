/**
 * Tests for pattern matching utilities
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { filterByPattern, findMatchingHook } from '../../src/utils/patterns.js';

describe('patterns', () => {
  describe('filterByPattern', () => {
    it('returns all pages when no filters', () => {
      let pages = [{ path: '/' }, { path: '/about' }, { path: '/blog/post-1' }];

      let filtered = filterByPattern(pages, null, null);

      assert.strictEqual(filtered.length, 3);
    });

    it('filters by include pattern', () => {
      let pages = [
        { path: '/' },
        { path: '/about' },
        { path: '/blog/post-1' },
        { path: '/blog/post-2' },
      ];

      let filtered = filterByPattern(pages, '/blog/*', null);

      assert.strictEqual(filtered.length, 2);
      assert.ok(filtered.every(p => p.path.startsWith('/blog/')));
    });

    it('filters by exclude pattern', () => {
      let pages = [
        { path: '/' },
        { path: '/about' },
        { path: '/blog/draft' },
        { path: '/blog/post-1' },
      ];

      let filtered = filterByPattern(pages, null, '/blog/draft');

      assert.strictEqual(filtered.length, 3);
      assert.ok(!filtered.find(p => p.path === '/blog/draft'));
    });

    it('applies both include and exclude', () => {
      let pages = [
        { path: '/' },
        { path: '/blog/draft' },
        { path: '/blog/post-1' },
        { path: '/docs/guide' },
      ];

      let filtered = filterByPattern(pages, '/blog/*', '/blog/draft');

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].path, '/blog/post-1');
    });

    it('handles wildcard patterns', () => {
      let pages = [
        { path: '/' },
        { path: '/docs/intro' },
        { path: '/docs/advanced/setup' },
      ];

      let filtered = filterByPattern(pages, '/docs/**', null);

      assert.strictEqual(filtered.length, 2);
    });
  });

  describe('findMatchingHook', () => {
    it('returns null when interactions is null or undefined', () => {
      let page = { path: '/about' };

      assert.strictEqual(findMatchingHook(page, null), null);
      assert.strictEqual(findMatchingHook(page, undefined), null);
    });

    it('returns null when no hooks', () => {
      let page = { path: '/about' };
      let hooks = {};

      let hook = findMatchingHook(page, hooks);

      assert.strictEqual(hook, null);
    });

    it('matches exact path', () => {
      let mockHook = () => {};
      let page = { path: '/' };
      let hooks = { '/': mockHook };

      let hook = findMatchingHook(page, hooks);

      assert.strictEqual(hook, mockHook);
    });

    it('matches pattern', () => {
      let mockHook = () => {};
      let page = { path: '/blog/post-1' };
      let hooks = { '/blog/*': mockHook };

      let hook = findMatchingHook(page, hooks);

      assert.strictEqual(hook, mockHook);
    });

    it('matches wildcard', () => {
      let mockHook = () => {};
      let page = { path: '/docs/guide/intro' };
      let hooks = { '/docs/**': mockHook };

      let hook = findMatchingHook(page, hooks);

      assert.strictEqual(hook, mockHook);
    });

    it('returns first matching hook', () => {
      let hook1 = () => {};
      let hook2 = () => {};
      let page = { path: '/blog/post' };
      let hooks = {
        '/blog/*': hook1,
        '**': hook2,
      };

      let hook = findMatchingHook(page, hooks);

      assert.strictEqual(hook, hook1);
    });

    it('uses url property when path is not present', () => {
      let mockHook = () => {};
      let page = { url: '/products/item-1' };
      let hooks = { '/products/*': mockHook };

      let hook = findMatchingHook(page, hooks);

      assert.strictEqual(hook, mockHook);
    });

    it('returns null when no patterns match', () => {
      let mockHook = () => {};
      let page = { path: '/admin/dashboard' };
      let hooks = { '/blog/*': mockHook };

      let hook = findMatchingHook(page, hooks);

      assert.strictEqual(hook, null);
    });
  });

  describe('filterByPattern edge cases', () => {
    it('uses url property when path is not present', () => {
      let pages = [{ url: '/blog/post-1' }, { url: '/about' }];

      let filtered = filterByPattern(pages, '/blog/*', null);

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].url, '/blog/post-1');
    });

    it('handles pages with both path and url (prefers path)', () => {
      let pages = [{ path: '/blog/post', url: '/old-blog/post' }];

      // Pattern matches path, not url
      let filtered = filterByPattern(pages, '/blog/*', null);

      assert.strictEqual(filtered.length, 1);
    });
  });
});
