/**
 * Tests for CLI option parsing and config merging
 * Ensures CLI options don't override config file values when not explicitly set
 */

import { describe, it, expect } from 'vitest';
import { parseCliOptions, mergeConfigs } from '../src/config.js';

describe('CLI Options', () => {
  it('should not include fullPage in parsed options when not set', () => {
    let options = {};
    let result = parseCliOptions(options);

    expect(result.screenshot).toBeUndefined();
  });

  it('should include fullPage when explicitly set to true', () => {
    let options = { fullPage: true };
    let result = parseCliOptions(options);

    expect(result.screenshot).toEqual({ fullPage: true });
  });

  it('should include fullPage when explicitly set to false', () => {
    let options = { fullPage: false };
    let result = parseCliOptions(options);

    expect(result.screenshot).toEqual({ fullPage: false });
  });

  it('should preserve config fullPage: true when CLI option not set', () => {
    let defaultConfig = {
      screenshot: { fullPage: false, omitBackground: false }
    };

    let userConfig = {
      screenshot: { fullPage: true, omitBackground: false }
    };

    let cliOptions = {}; // No CLI options
    let parsedCli = parseCliOptions(cliOptions);

    let result = mergeConfigs(defaultConfig, userConfig, parsedCli);

    expect(result.screenshot.fullPage).toBe(true);
  });

  it('should allow CLI option to override config fullPage', () => {
    let defaultConfig = {
      screenshot: { fullPage: false, omitBackground: false }
    };

    let userConfig = {
      screenshot: { fullPage: true, omitBackground: false }
    };

    let cliOptions = { fullPage: false }; // Explicit CLI override
    let parsedCli = parseCliOptions(cliOptions);

    let result = mergeConfigs(defaultConfig, userConfig, parsedCli);

    expect(result.screenshot.fullPage).toBe(false);
  });
});
