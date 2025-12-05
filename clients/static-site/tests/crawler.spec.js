/**
 * Tests for page discovery and crawling
 */

import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  discoverPages,
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
      let pages = [{ path: '/' }, { path: '/about' }, { path: '/blog/post-1' }];
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
      expect(filtered.find(p => p.path === '/blog/draft')).toBeUndefined();
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

  describe('path traversal security', () => {
    let testDir;
    let outsideDir;

    beforeEach(async () => {
      // Create unique temp directory for each test
      let uniqueId = `vizzly-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      testDir = join(tmpdir(), uniqueId, 'build');
      outsideDir = join(tmpdir(), uniqueId, 'outside');

      await mkdir(testDir, { recursive: true });
      await mkdir(outsideDir, { recursive: true });

      // Create legitimate pages inside build directory
      await writeFile(
        join(testDir, 'index.html'),
        '<html><body>Home</body></html>'
      );
      await mkdir(join(testDir, 'blog'), { recursive: true });
      await writeFile(
        join(testDir, 'blog', 'post.html'),
        '<html><body>Post</body></html>'
      );

      // Create sensitive file outside build directory
      await writeFile(
        join(outsideDir, 'secret.html'),
        '<html><body>Secret</body></html>'
      );
    });

    afterEach(async () => {
      // Clean up test directories
      await rm(join(tmpdir(), testDir.split('/').slice(0, -1).pop()), {
        recursive: true,
        force: true,
      }).catch(() => {});
    });

    it('should not discover HTML files outside build directory via symlink', async () => {
      // Create symlink pointing outside build directory
      let symlinkPath = join(testDir, 'evil-link');
      try {
        await symlink(outsideDir, symlinkPath, 'dir');
      } catch (error) {
        // Skip test if symlinks not supported (e.g., Windows without admin)
        if (error.code === 'EPERM' || error.code === 'EACCES') {
          return;
        }
        throw error;
      }

      let config = {
        buildPath: testDir,
        pageDiscovery: {
          useSitemap: false,
          scanHtml: true,
          sitemapPath: 'sitemap.xml',
        },
        include: null,
        exclude: null,
      };

      let pages = await discoverPages(testDir, config);

      // Should only find pages inside build directory
      expect(pages).toHaveLength(2);
      expect(pages.some(p => p.path.includes('secret'))).toBe(false);
    });

    it('should not be affected by path traversal in directory names', async () => {
      // Create directory with path traversal pattern (should be treated as literal)
      let traversalDir = join(testDir, '..', 'fake-escape');
      await mkdir(traversalDir, { recursive: true });
      await writeFile(
        join(traversalDir, 'page.html'),
        '<html><body>Page</body></html>'
      );

      let config = {
        buildPath: testDir,
        pageDiscovery: {
          useSitemap: false,
          scanHtml: true,
          sitemapPath: 'sitemap.xml',
        },
        include: null,
        exclude: null,
      };

      let pages = await discoverPages(testDir, config);

      // Should find legitimate pages but validate paths stay in bounds
      expect(pages.length).toBeGreaterThan(0);
      pages.forEach(page => {
        expect(page.filePath).not.toContain('../outside');
      });
    });

    it('should handle deeply nested legitimate directories', async () => {
      // Create deeply nested legitimate structure
      let deepPath = join(testDir, 'docs', 'api', 'v1', 'reference');
      await mkdir(deepPath, { recursive: true });
      await writeFile(
        join(deepPath, 'endpoint.html'),
        '<html><body>API</body></html>'
      );

      let config = {
        buildPath: testDir,
        pageDiscovery: {
          useSitemap: false,
          scanHtml: true,
          sitemapPath: 'sitemap.xml',
        },
        include: null,
        exclude: null,
      };

      let pages = await discoverPages(testDir, config);

      // Should find all legitimate pages including deeply nested ones
      let apiPage = pages.find(p => p.path.includes('endpoint'));
      expect(apiPage).toBeDefined();
      expect(apiPage.path).toBe('/docs/api/v1/reference/endpoint');
    });

    it('should not follow symlinks pointing to parent directories', async () => {
      // Create symlink to parent directory
      let parentLink = join(testDir, 'parent-link');
      try {
        await symlink(join(testDir, '..'), parentLink, 'dir');
      } catch (error) {
        if (error.code === 'EPERM' || error.code === 'EACCES') {
          return;
        }
        throw error;
      }

      let config = {
        buildPath: testDir,
        pageDiscovery: {
          useSitemap: false,
          scanHtml: true,
          sitemapPath: 'sitemap.xml',
        },
        include: null,
        exclude: null,
      };

      let pages = await discoverPages(testDir, config);

      // Should only find pages directly in build, not through parent symlink
      expect(pages).toHaveLength(2);
    });
  });
});
