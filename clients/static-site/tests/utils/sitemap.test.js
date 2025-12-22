/**
 * Tests for sitemap parsing utilities
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  parseSitemapXML,
  urlsToRelativePaths,
} from '../../src/utils/sitemap.js';

describe('sitemap', () => {
  describe('parseSitemapXML', () => {
    it('parses standard sitemap format', () => {
      let xml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.com/</loc></url>
          <url><loc>https://example.com/about</loc></url>
          <url><loc>https://example.com/blog/post-1</loc></url>
        </urlset>`;

      let result = parseSitemapXML(xml);

      assert.strictEqual(result.urls.length, 3);
      assert.strictEqual(result.childSitemaps.length, 0);
      assert.strictEqual(result.urls[0], 'https://example.com/');
      assert.strictEqual(result.urls[1], 'https://example.com/about');
      assert.strictEqual(result.urls[2], 'https://example.com/blog/post-1');
    });

    it('parses sitemap with single URL', () => {
      let xml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.com/</loc></url>
        </urlset>`;

      let result = parseSitemapXML(xml);

      assert.strictEqual(result.urls.length, 1);
      assert.strictEqual(result.urls[0], 'https://example.com/');
    });

    it('parses sitemap index format', () => {
      let xml = `<?xml version="1.0" encoding="UTF-8"?>
        <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <sitemap><loc>https://example.com/sitemap-0.xml</loc></sitemap>
          <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
        </sitemapindex>`;

      let result = parseSitemapXML(xml);

      assert.strictEqual(result.urls.length, 0);
      assert.strictEqual(result.childSitemaps.length, 2);
      assert.strictEqual(
        result.childSitemaps[0],
        'https://example.com/sitemap-0.xml'
      );
      assert.strictEqual(
        result.childSitemaps[1],
        'https://example.com/sitemap-1.xml'
      );
    });

    it('parses sitemap index with single child', () => {
      let xml = `<?xml version="1.0" encoding="UTF-8"?>
        <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <sitemap><loc>https://example.com/sitemap-0.xml</loc></sitemap>
        </sitemapindex>`;

      let result = parseSitemapXML(xml);

      assert.strictEqual(result.urls.length, 0);
      assert.strictEqual(result.childSitemaps.length, 1);
    });

    it('returns empty arrays for invalid XML', () => {
      let xml = `<?xml version="1.0"?><root><something/></root>`;

      let result = parseSitemapXML(xml);

      assert.strictEqual(result.urls.length, 0);
      assert.strictEqual(result.childSitemaps.length, 0);
    });

    it('handles URLs with extra metadata', () => {
      let xml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://example.com/page</loc>
            <lastmod>2024-01-15</lastmod>
            <changefreq>weekly</changefreq>
            <priority>0.8</priority>
          </url>
        </urlset>`;

      let result = parseSitemapXML(xml);

      assert.strictEqual(result.urls.length, 1);
      assert.strictEqual(result.urls[0], 'https://example.com/page');
    });

    it('filters out entries without loc', () => {
      let xml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.com/valid</loc></url>
          <url><lastmod>2024-01-15</lastmod></url>
        </urlset>`;

      let result = parseSitemapXML(xml);

      assert.strictEqual(result.urls.length, 1);
      assert.strictEqual(result.urls[0], 'https://example.com/valid');
    });
  });

  describe('urlsToRelativePaths', () => {
    it('converts full URLs to relative paths', () => {
      let urls = [
        'https://example.com/',
        'https://example.com/about',
        'https://example.com/blog/post-1',
      ];

      let paths = urlsToRelativePaths(urls, 'https://example.com');

      assert.deepStrictEqual(paths, ['/', '/about', '/blog/post-1']);
    });

    it('handles URLs with trailing slashes', () => {
      let urls = ['https://example.com/about/', 'https://example.com/blog/'];

      let paths = urlsToRelativePaths(urls, 'https://example.com');

      assert.deepStrictEqual(paths, ['/about', '/blog']);
    });

    it('handles root URL with trailing slash', () => {
      let urls = ['https://example.com/'];

      let paths = urlsToRelativePaths(urls, 'https://example.com');

      assert.deepStrictEqual(paths, ['/']);
    });

    it('handles empty base URL', () => {
      let urls = ['https://example.com/page', 'https://other.com/page'];

      let paths = urlsToRelativePaths(urls, '');

      assert.deepStrictEqual(paths, ['/page', '/page']);
    });

    it('handles URLs without protocol', () => {
      let urls = ['/about', '/blog/post'];

      let paths = urlsToRelativePaths(urls, '');

      assert.deepStrictEqual(paths, ['/about', '/blog/post']);
    });

    it('adds leading slash when missing', () => {
      let urls = ['about', 'blog/post'];

      let paths = urlsToRelativePaths(urls, '');

      assert.deepStrictEqual(paths, ['/about', '/blog/post']);
    });
  });
});
