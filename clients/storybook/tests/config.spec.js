/**
 * Tests for configuration functions
 */

import { describe, it, expect } from 'vitest';
import {
  parseCliOptions,
  mergeConfigs,
  mergeStoryConfig,
  defaultConfig,
} from '../src/config.js';

describe('parseCliOptions', () => {
  it('should parse viewports option', () => {
    let options = { viewports: 'mobile:375x667,desktop:1920x1080' };
    let config = parseCliOptions(options);

    expect(config.viewports).toHaveLength(2);
    expect(config.viewports[0]).toEqual({
      name: 'mobile',
      width: 375,
      height: 667,
    });
  });

  it('should filter out invalid viewports', () => {
    let options = { viewports: 'mobile:375x667,invalid,desktop:1920x1080' };
    let config = parseCliOptions(options);

    expect(config.viewports).toHaveLength(2);
  });

  it('should parse concurrency', () => {
    let options = { concurrency: 5 };
    let config = parseCliOptions(options);

    expect(config.concurrency).toBe(5);
  });

  it('should parse include and exclude', () => {
    let options = { include: 'button*', exclude: '*test*' };
    let config = parseCliOptions(options);

    expect(config.include).toBe('button*');
    expect(config.exclude).toBe('*test*');
  });

  it('should parse browser options', () => {
    let options = {
      headless: false,
      browserArgs: '--arg1,--arg2',
    };
    let config = parseCliOptions(options);

    expect(config.browser.headless).toBe(false);
    expect(config.browser.args).toEqual(['--arg1', '--arg2']);
  });

  it('should parse screenshot options', () => {
    let options = { fullPage: true };
    let config = parseCliOptions(options);

    expect(config.screenshot.fullPage).toBe(true);
  });
});

describe('mergeConfigs', () => {
  it('should merge multiple configs', () => {
    let config1 = { concurrency: 3 };
    let config2 = { concurrency: 5, include: 'button*' };

    let merged = mergeConfigs(config1, config2);

    expect(merged.concurrency).toBe(5);
    expect(merged.include).toBe('button*');
  });

  it('should deep merge browser config', () => {
    let config1 = { browser: { headless: true, args: ['--arg1'] } };
    let config2 = { browser: { headless: false } };

    let merged = mergeConfigs(config1, config2);

    expect(merged.browser.headless).toBe(false);
    expect(merged.browser.args).toEqual(['--arg1']);
  });

  it('should override arrays instead of concatenating', () => {
    let config1 = {
      viewports: [{ name: 'mobile', width: 375, height: 667 }],
    };
    let config2 = {
      viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
    };

    let merged = mergeConfigs(config1, config2);

    expect(merged.viewports).toHaveLength(1);
    expect(merged.viewports[0].name).toBe('desktop');
  });

  it('should handle null/undefined configs', () => {
    let merged = mergeConfigs(
      defaultConfig,
      null,
      { concurrency: 5 },
      undefined
    );

    expect(merged.concurrency).toBe(5);
  });
});

describe('mergeStoryConfig', () => {
  it('should merge story config with global config', () => {
    let globalConfig = {
      viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
      screenshot: { fullPage: false },
    };

    let storyConfig = {
      viewports: [{ name: 'mobile', width: 375, height: 667 }],
    };

    let merged = mergeStoryConfig(globalConfig, storyConfig);

    expect(merged.viewports[0].name).toBe('mobile');
    expect(merged.screenshot.fullPage).toBe(false);
  });

  it('should return global config if no story config', () => {
    let globalConfig = { concurrency: 3 };
    let merged = mergeStoryConfig(globalConfig, null);

    expect(merged).toEqual(globalConfig);
  });

  it('should merge beforeScreenshot hook', () => {
    let globalConfig = {};
    let hook = async () => {};
    let storyConfig = { beforeScreenshot: hook };

    let merged = mergeStoryConfig(globalConfig, storyConfig);

    expect(merged.beforeScreenshot).toBe(hook);
  });
});
