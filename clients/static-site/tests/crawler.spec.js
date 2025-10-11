/**
 * Tests for page discovery and crawling
 */

import { describe, it, expect } from 'vitest';
import {
  filePathToUrlPath,
  filterPages,
  generatePageUrl,
} from '../src/crawler.js';

describe('crawler', () => {
  describe('filePathToUrlPath', () => {
    it('should convert file path to URL path', () => {
      expect(filePathToUrlPath('index.html')).toBe('/');
      expect(filePathToUrlPath('about.html')).toBe('/about');
      expect(filePathToUrlPath('blog/post-1.html')).toBe('/blog/post-1');
    });

    it('should handle index.html in subdirectories', () => {
      expect(filePathToUrlPath('blog/index.html')).toBe('/blog');
      expect(filePathToUrlPath('docs/getting-started/index.html')).toBe(
        '/docs/getting-started'
      );
    });

    it('should normalize separators', () => {
      expect(filePathToUrlPath('blog\\post-1.html')).toBe('/blog/post-1');
    });

    it('should ensure leading slash', () => {
      expect(filePathToUrlPath('about.html')).toBe('/about');
    });
  });

  describe('filterPages', () => {
    it('should return all pages when no filters', () => {
      let pages = [
        { path: '/' },
        { path: '/about' },
        { path: '/blog/post-1' },
      ];
      let config = { include: null, exclude: null };

      let filtered = filterPages(pages, config);

      expect(filtered).toHaveLength(3);
    });

    it('should filter by include pattern', () => {
      let pages = [
        { path: '/' },
        { path: '/about' },
        { path: '/blog/post-1' },
        { path: '/blog/post-2' },
      ];
      let config = { include: '/blog/*', exclude: null };

      let filtered = filterPages(pages, config);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].path).toBe('/blog/post-1');
      expect(filtered[1].path).toBe('/blog/post-2');
    });

    it('should filter by exclude pattern', () => {
      let pages = [
        { path: '/' },
        { path: '/about' },
        { path: '/blog/draft' },
        { path: '/blog/post-1' },
      ];
      let config = { include: null, exclude: '/blog/draft' };

      let filtered = filterPages(pages, config);

      expect(filtered).toHaveLength(3);
      expect(filtered.find((p) => p.path === '/blog/draft')).toBeUndefined();
    });

    it('should apply both include and exclude', () => {
      let pages = [
        { path: '/' },
        { path: '/blog/draft' },
        { path: '/blog/post-1' },
        { path: '/docs/guide' },
      ];
      let config = { include: '/blog/*', exclude: '/blog/draft' };

      let filtered = filterPages(pages, config);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].path).toBe('/blog/post-1');
    });
  });

  describe('generatePageUrl', () => {
    it('should generate URL for root page', () => {
      let baseUrl = 'http://localhost:3000';
      let page = { path: '/' };

      let url = generatePageUrl(baseUrl, page);

      expect(url).toBe('http://localhost:3000/index.html');
    });

    it('should generate URL for regular page', () => {
      let baseUrl = 'http://localhost:3000';
      let page = { path: '/about' };

      let url = generatePageUrl(baseUrl, page);

      expect(url).toBe('http://localhost:3000/about.html');
    });

    it('should handle trailing slash', () => {
      let baseUrl = 'http://localhost:3000';
      let page = { path: '/blog/' };

      let url = generatePageUrl(baseUrl, page);

      expect(url).toBe('http://localhost:3000/blog.html');
    });

    it('should throw on invalid baseUrl', () => {
      let page = { path: '/about' };

      expect(() => generatePageUrl('', page)).toThrow();
      expect(() => generatePageUrl(null, page)).toThrow();
    });
  });
});
