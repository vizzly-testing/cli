/**
 * Tests for CLI option parsing and config merging
 * Ensures CLI options don't override config file values when not explicitly set
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { mergeConfigs, parseCliOptions } from '../src/config.js';

describe('CLI Options', () => {
  it('does not include fullPage in parsed options when not set', () => {
    let options = {};
    let result = parseCliOptions(options);

    assert.strictEqual(result.screenshot, undefined);
  });

  it('includes fullPage when explicitly set to true', () => {
    let options = { fullPage: true };
    let result = parseCliOptions(options);

    assert.deepStrictEqual(result.screenshot, { fullPage: true });
  });

  it('includes fullPage when explicitly set to false', () => {
    let options = { fullPage: false };
    let result = parseCliOptions(options);

    assert.deepStrictEqual(result.screenshot, { fullPage: false });
  });

  it('preserves config fullPage: false when CLI option not set', () => {
    let defaultConfig = {
      screenshot: { fullPage: true, omitBackground: false },
    };

    let userConfig = {
      screenshot: { fullPage: false, omitBackground: false },
    };

    let cliOptions = {}; // No CLI options
    let parsedCli = parseCliOptions(cliOptions);

    let result = mergeConfigs(defaultConfig, userConfig, parsedCli);

    assert.strictEqual(result.screenshot.fullPage, false);
  });

  it('allows CLI option to override config fullPage', () => {
    let defaultConfig = {
      screenshot: { fullPage: true, omitBackground: false },
    };

    let userConfig = {
      screenshot: { fullPage: true, omitBackground: false },
    };

    let cliOptions = { fullPage: false }; // Explicit CLI override
    let parsedCli = parseCliOptions(cliOptions);

    let result = mergeConfigs(defaultConfig, userConfig, parsedCli);

    assert.strictEqual(result.screenshot.fullPage, false);
  });
});
