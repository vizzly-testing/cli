/**
 * Tests for configuration functions
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultConfig,
  loadConfig,
  mergeConfigs,
  mergeStoryConfig,
  parseCliOptions,
} from '../src/config.js';

describe('parseCliOptions', () => {
  it('should parse viewports option', () => {
    let options = { viewports: 'mobile:375x667,desktop:1920x1080' };
    let config = parseCliOptions(options);

    assert.equal(config.viewports.length, 2);
    assert.deepEqual(config.viewports[0], {
      name: 'mobile',
      width: 375,
      height: 667,
    });
  });

  it('should filter out invalid viewports', () => {
    let options = { viewports: 'mobile:375x667,invalid,desktop:1920x1080' };
    let config = parseCliOptions(options);

    assert.equal(config.viewports.length, 2);
  });

  it('should parse concurrency', () => {
    let options = { concurrency: 5 };
    let config = parseCliOptions(options);

    assert.equal(config.concurrency, 5);
  });

  it('should parse include and exclude', () => {
    let options = { include: 'button*', exclude: '*test*' };
    let config = parseCliOptions(options);

    assert.equal(config.include, 'button*');
    assert.equal(config.exclude, '*test*');
  });

  it('should parse browser options', () => {
    let options = {
      headless: false,
      browserArgs: '--arg1,--arg2',
    };
    let config = parseCliOptions(options);

    assert.equal(config.browser.headless, false);
    assert.deepEqual(config.browser.args, ['--arg1', '--arg2']);
  });

  it('should parse browser type option', () => {
    let options = { browser: 'webkit' };
    let config = parseCliOptions(options);

    assert.equal(config.browser.type, 'webkit');
  });

  it('should parse screenshot options', () => {
    let options = { fullPage: true };
    let config = parseCliOptions(options);

    assert.equal(config.screenshot.fullPage, true);
  });
});

describe('mergeConfigs', () => {
  it('should merge multiple configs', () => {
    let config1 = { concurrency: 3 };
    let config2 = { concurrency: 5, include: 'button*' };

    let merged = mergeConfigs(config1, config2);

    assert.equal(merged.concurrency, 5);
    assert.equal(merged.include, 'button*');
  });

  it('should deep merge browser config', () => {
    let config1 = { browser: { headless: true, args: ['--arg1'] } };
    let config2 = { browser: { headless: false } };

    let merged = mergeConfigs(config1, config2);

    assert.equal(merged.browser.headless, false);
    assert.deepEqual(merged.browser.args, ['--arg1']);
  });

  it('should override arrays instead of concatenating', () => {
    let config1 = {
      viewports: [{ name: 'mobile', width: 375, height: 667 }],
    };
    let config2 = {
      viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
    };

    let merged = mergeConfigs(config1, config2);

    assert.equal(merged.viewports.length, 1);
    assert.equal(merged.viewports[0].name, 'desktop');
  });

  it('should handle null/undefined configs', () => {
    let merged = mergeConfigs(
      defaultConfig,
      null,
      { concurrency: 5 },
      undefined
    );

    assert.equal(merged.concurrency, 5);
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

    assert.equal(merged.viewports[0].name, 'mobile');
    assert.equal(merged.screenshot.fullPage, false);
  });

  it('should return global config if no story config', () => {
    let globalConfig = { concurrency: 3 };
    let merged = mergeStoryConfig(globalConfig, null);

    assert.deepEqual(merged, globalConfig);
  });

  it('should merge beforeScreenshot hook', () => {
    let globalConfig = {};
    let hook = async () => {};
    let storyConfig = { beforeScreenshot: hook };

    let merged = mergeStoryConfig(globalConfig, storyConfig);

    assert.equal(merged.beforeScreenshot, hook);
  });
});

describe('loadConfig', () => {
  it('should use vizzlyConfig.storybook when provided', async () => {
    let vizzlyConfig = {
      storybook: {
        concurrency: 10,
        viewports: [{ name: 'custom', width: 800, height: 600 }],
      },
    };

    let config = await loadConfig('./storybook-static', {}, vizzlyConfig);

    assert.equal(config.concurrency, 10);
    assert.equal(config.viewports.length, 1);
    assert.equal(config.viewports[0].name, 'custom');
  });

  it('should prefer CLI options over vizzlyConfig.storybook', async () => {
    let vizzlyConfig = {
      storybook: {
        concurrency: 10,
        include: 'from-config',
      },
    };
    let cliOptions = { concurrency: 5, include: 'from-cli' };

    let config = await loadConfig(
      './storybook-static',
      cliOptions,
      vizzlyConfig
    );

    assert.equal(config.concurrency, 5);
    assert.equal(config.include, 'from-cli');
  });

  it('should use defaults when no vizzlyConfig provided', async () => {
    let config = await loadConfig('./storybook-static', {}, {});

    assert.equal(config.concurrency, defaultConfig.concurrency);
    assert.equal(config.viewports.length, 2);
    assert.deepEqual(config.viewports, defaultConfig.viewports);
  });

  it('should handle missing storybook key in vizzlyConfig', async () => {
    let vizzlyConfig = {
      otherPlugin: { foo: 'bar' },
    };

    let config = await loadConfig('./storybook-static', {}, vizzlyConfig);

    assert.equal(config.concurrency, defaultConfig.concurrency);
  });

  it('should deep merge browser config from vizzlyConfig', async () => {
    let vizzlyConfig = {
      storybook: {
        browser: {
          headless: false,
          args: ['--disable-gpu'],
        },
      },
    };

    let config = await loadConfig('./storybook-static', {}, vizzlyConfig);

    assert.equal(config.browser.headless, false);
    assert.deepEqual(config.browser.args, ['--disable-gpu']);
  });

  it('should set storybookPath from argument', async () => {
    let config = await loadConfig('/path/to/storybook', {}, {});

    assert.equal(config.storybookPath, '/path/to/storybook');
  });
});
