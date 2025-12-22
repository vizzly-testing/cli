/**
 * Tests for configuration loading and merging
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { getPageConfig, mergeConfigs, parseCliOptions } from '../src/config.js';

describe('config', () => {
  describe('parseCliOptions', () => {
    it('parses viewport option', () => {
      let options = { viewports: 'mobile:375x667,desktop:1920x1080' };
      let config = parseCliOptions(options);

      assert.strictEqual(config.viewports.length, 2);
      assert.deepStrictEqual(config.viewports[0], {
        name: 'mobile',
        width: 375,
        height: 667,
      });
      assert.deepStrictEqual(config.viewports[1], {
        name: 'desktop',
        width: 1920,
        height: 1080,
      });
    });

    it('parses concurrency option', () => {
      let options = { concurrency: 5 };
      let config = parseCliOptions(options);

      assert.strictEqual(config.concurrency, 5);
    });

    it('parses include/exclude patterns', () => {
      let options = { include: 'blog/*', exclude: '*/draft' };
      let config = parseCliOptions(options);

      assert.strictEqual(config.include, 'blog/*');
      assert.strictEqual(config.exclude, '*/draft');
    });

    it('parses browser options', () => {
      let options = {
        headless: false,
        browserArgs: '--no-sandbox,--disable-dev-shm-usage',
      };
      let config = parseCliOptions(options);

      assert.strictEqual(config.browser.headless, false);
      assert.deepStrictEqual(config.browser.args, [
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ]);
    });

    it('parses screenshot options', () => {
      let options = { fullPage: true };
      let config = parseCliOptions(options);

      assert.strictEqual(config.screenshot.fullPage, true);
    });

    it('parses page discovery options', () => {
      let options = { useSitemap: false, sitemapPath: 'custom-sitemap.xml' };
      let config = parseCliOptions(options);

      assert.strictEqual(config.pageDiscovery.useSitemap, false);
      assert.strictEqual(config.pageDiscovery.sitemapPath, 'custom-sitemap.xml');
    });
  });

  describe('mergeConfigs', () => {
    it('merges multiple configs with priority', () => {
      let config1 = { concurrency: 3, browser: { headless: true } };
      let config2 = { concurrency: 5, screenshot: { fullPage: true } };
      let config3 = { concurrency: 10 };

      let merged = mergeConfigs(config1, config2, config3);

      assert.strictEqual(merged.concurrency, 10); // Later overrides
      assert.strictEqual(merged.browser.headless, true);
      assert.strictEqual(merged.screenshot.fullPage, true);
    });

    it('deep merges nested objects', () => {
      let config1 = { browser: { headless: true, args: [] } };
      let config2 = { browser: { args: ['--no-sandbox'] } };

      let merged = mergeConfigs(config1, config2);

      assert.strictEqual(merged.browser.headless, true);
      assert.deepStrictEqual(merged.browser.args, ['--no-sandbox']);
    });

    it('handles null configs', () => {
      let config1 = { concurrency: 3 };

      let merged = mergeConfigs(config1, null, undefined);

      assert.strictEqual(merged.concurrency, 3);
    });

    it('merges interactions', () => {
      let config1 = { interactions: { 'blog/*': () => {} } };
      let config2 = { interactions: { 'products/*': () => {} } };

      let merged = mergeConfigs(config1, config2);

      assert.strictEqual(Object.keys(merged.interactions).length, 2);
      assert.ok(merged.interactions['blog/*']);
      assert.ok(merged.interactions['products/*']);
    });
  });

  describe('getPageConfig', () => {
    it('returns global config when no page overrides', () => {
      let globalConfig = {
        viewports: [{ name: 'mobile', width: 375, height: 667 }],
        screenshot: { fullPage: false },
      };
      let page = { path: '/about' };

      let config = getPageConfig(globalConfig, page);

      assert.deepStrictEqual(config, globalConfig);
    });

    it('applies exact path match', () => {
      let globalConfig = {
        viewports: [
          { name: 'mobile', width: 375, height: 667 },
          { name: 'desktop', width: 1920, height: 1080 },
        ],
        pages: {
          '/pricing': {
            screenshot: { fullPage: true },
          },
        },
      };
      let page = { path: '/pricing' };

      let config = getPageConfig(globalConfig, page);

      assert.strictEqual(config.screenshot.fullPage, true);
    });

    it('applies pattern match', () => {
      let globalConfig = {
        viewports: [
          { name: 'mobile', width: 375, height: 667 },
          { name: 'desktop', width: 1920, height: 1080 },
        ],
        pages: {
          'blog/*': {
            viewports: ['mobile'],
          },
        },
      };
      let page = { path: 'blog/post-1' };

      let config = getPageConfig(globalConfig, page);

      assert.strictEqual(config.viewports.length, 1);
      assert.strictEqual(config.viewports[0].name, 'mobile');
    });

    it('filters viewports by name', () => {
      let globalConfig = {
        viewports: [
          { name: 'mobile', width: 375, height: 667 },
          { name: 'tablet', width: 768, height: 1024 },
          { name: 'desktop', width: 1920, height: 1080 },
        ],
        pages: {
          '/': {
            viewports: ['mobile', 'desktop'],
          },
        },
      };
      let page = { path: '/' };

      let config = getPageConfig(globalConfig, page);

      assert.strictEqual(config.viewports.length, 2);
      assert.strictEqual(config.viewports[0].name, 'mobile');
      assert.strictEqual(config.viewports[1].name, 'desktop');
    });

    it('uses viewport objects directly', () => {
      let globalConfig = {
        viewports: [{ name: 'mobile', width: 375, height: 667 }],
        pages: {
          '/custom': {
            viewports: [{ name: 'custom', width: 800, height: 600 }],
          },
        },
      };
      let page = { path: '/custom' };

      let config = getPageConfig(globalConfig, page);

      assert.strictEqual(config.viewports.length, 1);
      assert.strictEqual(config.viewports[0].name, 'custom');
    });

    it('merges screenshot options', () => {
      let globalConfig = {
        screenshot: { fullPage: false, omitBackground: false },
        pages: {
          '/pricing': {
            screenshot: { fullPage: true },
          },
        },
      };
      let page = { path: '/pricing' };

      let config = getPageConfig(globalConfig, page);

      assert.strictEqual(config.screenshot.fullPage, true);
      assert.strictEqual(config.screenshot.omitBackground, false);
    });
  });
});
