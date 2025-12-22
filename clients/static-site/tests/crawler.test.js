/**
 * Tests for page discovery and crawling
 */

import assert from 'node:assert';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  discoverPages,
  filePathToUrlPath,
  filterPages,
  generatePageUrl,
} from '../src/crawler.js';

describe('crawler', () => {
  describe('filePathToUrlPath', () => {
    it('converts file path to URL path', () => {
      assert.strictEqual(filePathToUrlPath('index.html'), '/');
      assert.strictEqual(filePathToUrlPath('about.html'), '/about');
      assert.strictEqual(filePathToUrlPath('blog/post-1.html'), '/blog/post-1');
    });

    it('handles index.html in subdirectories', () => {
      assert.strictEqual(filePathToUrlPath('blog/index.html'), '/blog');
      assert.strictEqual(
        filePathToUrlPath('docs/getting-started/index.html'),
        '/docs/getting-started'
      );
    });

    it('normalizes separators', () => {
      assert.strictEqual(
        filePathToUrlPath('blog\\post-1.html'),
        '/blog/post-1'
      );
    });

    it('ensures leading slash', () => {
      assert.strictEqual(filePathToUrlPath('about.html'), '/about');
    });
  });

  describe('filterPages', () => {
    it('returns all pages when no filters', () => {
      let pages = [{ path: '/' }, { path: '/about' }, { path: '/blog/post-1' }];
      let config = { include: null, exclude: null };

      let filtered = filterPages(pages, config);

      assert.strictEqual(filtered.length, 3);
    });

    it('filters by include pattern', () => {
      let pages = [
        { path: '/' },
        { path: '/about' },
        { path: '/blog/post-1' },
        { path: '/blog/post-2' },
      ];
      let config = { include: '/blog/*', exclude: null };

      let filtered = filterPages(pages, config);

      assert.strictEqual(filtered.length, 2);
      assert.strictEqual(filtered[0].path, '/blog/post-1');
      assert.strictEqual(filtered[1].path, '/blog/post-2');
    });

    it('filters by exclude pattern', () => {
      let pages = [
        { path: '/' },
        { path: '/about' },
        { path: '/blog/draft' },
        { path: '/blog/post-1' },
      ];
      let config = { include: null, exclude: '/blog/draft' };

      let filtered = filterPages(pages, config);

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
      let config = { include: '/blog/*', exclude: '/blog/draft' };

      let filtered = filterPages(pages, config);

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].path, '/blog/post-1');
    });
  });

  describe('generatePageUrl', () => {
    it('generates URL for root page', () => {
      let baseUrl = 'http://localhost:3000';
      let page = { path: '/' };

      let url = generatePageUrl(baseUrl, page);

      assert.strictEqual(url, 'http://localhost:3000/index.html');
    });

    it('generates URL for regular page', () => {
      let baseUrl = 'http://localhost:3000';
      let page = { path: '/about' };

      let url = generatePageUrl(baseUrl, page);

      assert.strictEqual(url, 'http://localhost:3000/about.html');
    });

    it('handles trailing slash', () => {
      let baseUrl = 'http://localhost:3000';
      let page = { path: '/blog/' };

      let url = generatePageUrl(baseUrl, page);

      assert.strictEqual(url, 'http://localhost:3000/blog.html');
    });

    it('throws on invalid baseUrl', () => {
      let page = { path: '/about' };

      assert.throws(() => generatePageUrl('', page));
      assert.throws(() => generatePageUrl(null, page));
    });
  });

  describe('path traversal security', () => {
    let testDir;
    let outsideDir;
    let baseDir;

    before(async () => {
      // Create unique temp directory for each test
      let uniqueId = `vizzly-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      baseDir = join(tmpdir(), uniqueId);
      testDir = join(baseDir, 'build');
      outsideDir = join(baseDir, 'outside');

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

    after(async () => {
      // Clean up test directories
      await rm(baseDir, { recursive: true, force: true }).catch(() => {});
    });

    it('does not discover HTML files outside build directory via symlink', async () => {
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
      assert.strictEqual(pages.length, 2);
      assert.ok(!pages.some(p => p.path.includes('secret')));
    });

    it('is not affected by path traversal in directory names', async () => {
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
      assert.ok(pages.length > 0);
      pages.forEach(page => {
        assert.ok(!page.filePath.includes('../outside'));
      });
    });

    it('handles deeply nested legitimate directories', async () => {
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
      assert.ok(apiPage);
      assert.strictEqual(apiPage.path, '/docs/api/v1/reference/endpoint');
    });

    it('does not follow symlinks pointing to parent directories', async () => {
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

      // Should not discover pages through the parent symlink (e.g., secret.html from outside)
      assert.ok(!pages.some(p => p.path.includes('secret')));
      // Should not have infinite recursion or discover outside directory content
      assert.ok(!pages.some(p => p.path.includes('outside')));
    });
  });

  describe('generatePageUrl', () => {
    it('uses filePath when present', () => {
      let baseUrl = 'http://localhost:3000';
      let page = { path: '/about', filePath: 'about.html' };

      let url = generatePageUrl(baseUrl, page);

      assert.strictEqual(url, 'http://localhost:3000/about.html');
    });

    it('normalizes backslashes in filePath', () => {
      let baseUrl = 'http://localhost:3000';
      let page = { path: '/blog/post', filePath: 'blog\\post.html' };

      let url = generatePageUrl(baseUrl, page);

      assert.strictEqual(url, 'http://localhost:3000/blog/post.html');
    });

    it('handles nested filePath with backslashes', () => {
      let baseUrl = 'http://localhost:3000';
      let page = {
        path: '/docs/api/reference',
        filePath: 'docs\\api\\reference.html',
      };

      let url = generatePageUrl(baseUrl, page);

      assert.strictEqual(url, 'http://localhost:3000/docs/api/reference.html');
    });
  });
});
