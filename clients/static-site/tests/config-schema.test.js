/**
 * Tests for configuration schema validation
 */

import assert from 'node:assert';
import { cpus } from 'node:os';
import { describe, it } from 'node:test';
import {
  getDefaultConcurrency,
  validateStaticSiteConfig,
  validateStaticSiteConfigWithDefaults,
} from '../src/config-schema.js';

describe('config-schema', () => {
  describe('getDefaultConcurrency', () => {
    it('returns a positive integer', () => {
      let concurrency = getDefaultConcurrency();

      assert.ok(Number.isInteger(concurrency));
      assert.ok(concurrency > 0);
    });

    it('returns at least 2', () => {
      let concurrency = getDefaultConcurrency();

      assert.ok(concurrency >= 2);
    });

    it('returns at most 8', () => {
      let concurrency = getDefaultConcurrency();

      assert.ok(concurrency <= 8);
    });

    it('calculates based on CPU cores', () => {
      let cores = cpus().length;
      let expected = Math.max(2, Math.min(8, Math.floor(cores / 2)));
      let concurrency = getDefaultConcurrency();

      assert.strictEqual(concurrency, expected);
    });
  });

  describe('validateStaticSiteConfig', () => {
    it('validates minimal config', () => {
      let config = {};

      let validated = validateStaticSiteConfig(config);

      assert.ok(validated.viewports);
      assert.ok(validated.browser);
      assert.ok(validated.screenshot);
      assert.ok(validated.pageDiscovery);
    });

    it('applies default concurrency from CPU cores', () => {
      let config = {};

      let validated = validateStaticSiteConfig(config);
      let expected = getDefaultConcurrency();

      assert.strictEqual(validated.concurrency, expected);
    });

    it('allows overriding concurrency', () => {
      let config = { concurrency: 10 };

      let validated = validateStaticSiteConfig(config);

      assert.strictEqual(validated.concurrency, 10);
    });

    it('validates viewports', () => {
      let config = {
        viewports: [
          { name: 'mobile', width: 375, height: 667 },
          { name: 'desktop', width: 1920, height: 1080 },
        ],
      };

      let validated = validateStaticSiteConfig(config);

      assert.strictEqual(validated.viewports.length, 2);
      assert.strictEqual(validated.viewports[0].name, 'mobile');
    });

    it('rejects invalid viewport', () => {
      let config = {
        viewports: [{ name: 'invalid', width: -100, height: 667 }],
      };

      assert.throws(() => validateStaticSiteConfig(config));
    });

    it('validates browser config', () => {
      let config = {
        browser: {
          headless: false,
          args: ['--no-sandbox'],
        },
      };

      let validated = validateStaticSiteConfig(config);

      assert.strictEqual(validated.browser.headless, false);
      assert.deepStrictEqual(validated.browser.args, ['--no-sandbox']);
    });

    it('validates screenshot config', () => {
      let config = {
        screenshot: {
          fullPage: true,
          omitBackground: true,
        },
      };

      let validated = validateStaticSiteConfig(config);

      assert.strictEqual(validated.screenshot.fullPage, true);
      assert.strictEqual(validated.screenshot.omitBackground, true);
    });

    it('validates page discovery config', () => {
      let config = {
        pageDiscovery: {
          useSitemap: false,
          sitemapPath: 'custom-sitemap.xml',
          scanHtml: true,
        },
      };

      let validated = validateStaticSiteConfig(config);

      assert.strictEqual(validated.pageDiscovery.useSitemap, false);
      assert.strictEqual(
        validated.pageDiscovery.sitemapPath,
        'custom-sitemap.xml'
      );
    });

    it('validates include/exclude patterns', () => {
      let config = {
        include: '/blog/*',
        exclude: '/drafts/*',
      };

      let validated = validateStaticSiteConfig(config);

      assert.strictEqual(validated.include, '/blog/*');
      assert.strictEqual(validated.exclude, '/drafts/*');
    });

    it('allows null include/exclude', () => {
      let config = {
        include: null,
        exclude: null,
      };

      let validated = validateStaticSiteConfig(config);

      assert.strictEqual(validated.include, null);
      assert.strictEqual(validated.exclude, null);
    });
  });

  describe('validateStaticSiteConfigWithDefaults', () => {
    it('returns defaults when config is undefined', () => {
      let validated = validateStaticSiteConfigWithDefaults(undefined);

      assert.ok(validated.viewports);
      assert.ok(validated.browser);
      assert.ok(validated.concurrency > 0);
    });

    it('returns defaults when config is null', () => {
      let validated = validateStaticSiteConfigWithDefaults(null);

      assert.ok(validated.viewports);
      assert.ok(validated.concurrency > 0);
    });

    it('validates provided config', () => {
      let config = { concurrency: 5 };

      let validated = validateStaticSiteConfigWithDefaults(config);

      assert.strictEqual(validated.concurrency, 5);
    });
  });
});
