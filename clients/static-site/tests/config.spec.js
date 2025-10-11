/**
 * Tests for configuration loading and merging
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseCliOptions,
  mergeConfigs,
  getPageConfig,
  defaultConfig,
} from '../src/config.js';

describe('config', () => {
  describe('parseCliOptions', () => {
    it('should parse viewport option', () => {
      let options = { viewports: 'mobile:375x667,desktop:1920x1080' };
      let config = parseCliOptions(options);

      expect(config.viewports).toHaveLength(2);
      expect(config.viewports[0]).toEqual({
        name: 'mobile',
        width: 375,
        height: 667,
      });
      expect(config.viewports[1]).toEqual({
        name: 'desktop',
        width: 1920,
        height: 1080,
      });
    });

    it('should parse concurrency option', () => {
      let options = { concurrency: 5 };
      let config = parseCliOptions(options);

      expect(config.concurrency).toBe(5);
    });

    it('should parse include/exclude patterns', () => {
      let options = { include: 'blog/*', exclude: '*/draft' };
      let config = parseCliOptions(options);

      expect(config.include).toBe('blog/*');
      expect(config.exclude).toBe('*/draft');
    });

    it('should parse browser options', () => {
      let options = {
        headless: false,
        browserArgs: '--no-sandbox,--disable-dev-shm-usage',
      };
      let config = parseCliOptions(options);

      expect(config.browser.headless).toBe(false);
      expect(config.browser.args).toEqual([
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ]);
    });

    it('should parse screenshot options', () => {
      let options = { fullPage: true };
      let config = parseCliOptions(options);

      expect(config.screenshot.fullPage).toBe(true);
    });

    it('should parse page discovery options', () => {
      let options = { useSitemap: false, sitemapPath: 'custom-sitemap.xml' };
      let config = parseCliOptions(options);

      expect(config.pageDiscovery.useSitemap).toBe(false);
      expect(config.pageDiscovery.sitemapPath).toBe('custom-sitemap.xml');
    });
  });

  describe('mergeConfigs', () => {
    it('should merge multiple configs with priority', () => {
      let config1 = { concurrency: 3, browser: { headless: true } };
      let config2 = { concurrency: 5, screenshot: { fullPage: true } };
      let config3 = { concurrency: 10 };

      let merged = mergeConfigs(config1, config2, config3);

      expect(merged.concurrency).toBe(10); // Later overrides
      expect(merged.browser.headless).toBe(true);
      expect(merged.screenshot.fullPage).toBe(true);
    });

    it('should deep merge nested objects', () => {
      let config1 = { browser: { headless: true, args: [] } };
      let config2 = { browser: { args: ['--no-sandbox'] } };

      let merged = mergeConfigs(config1, config2);

      expect(merged.browser.headless).toBe(true);
      expect(merged.browser.args).toEqual(['--no-sandbox']);
    });

    it('should handle null configs', () => {
      let config1 = { concurrency: 3 };

      let merged = mergeConfigs(config1, null, undefined);

      expect(merged.concurrency).toBe(3);
    });

    it('should merge interactions', () => {
      let config1 = { interactions: { 'blog/*': () => {} } };
      let config2 = { interactions: { 'products/*': () => {} } };

      let merged = mergeConfigs(config1, config2);

      expect(Object.keys(merged.interactions)).toHaveLength(2);
      expect(merged.interactions['blog/*']).toBeDefined();
      expect(merged.interactions['products/*']).toBeDefined();
    });
  });

  describe('getPageConfig', () => {
    it('should return global config when no page overrides', () => {
      let globalConfig = {
        viewports: [{ name: 'mobile', width: 375, height: 667 }],
        screenshot: { fullPage: false },
      };
      let page = { path: '/about' };

      let config = getPageConfig(globalConfig, page);

      expect(config).toEqual(globalConfig);
    });

    it('should apply exact path match', () => {
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

      expect(config.screenshot.fullPage).toBe(true);
    });

    it('should apply pattern match', () => {
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

      expect(config.viewports).toHaveLength(1);
      expect(config.viewports[0].name).toBe('mobile');
    });

    it('should filter viewports by name', () => {
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

      expect(config.viewports).toHaveLength(2);
      expect(config.viewports[0].name).toBe('mobile');
      expect(config.viewports[1].name).toBe('desktop');
    });

    it('should use viewport objects directly', () => {
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

      expect(config.viewports).toHaveLength(1);
      expect(config.viewports[0].name).toBe('custom');
    });

    it('should merge screenshot options', () => {
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

      expect(config.screenshot.fullPage).toBe(true);
      expect(config.screenshot.omitBackground).toBe(false);
    });
  });
});
