/**
 * Tests for CLI option parsing and config merging
 * Ensures CLI options don't override config file values when not explicitly set
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { Command } from 'commander';
import packageJson from '../package.json' with { type: 'json' };
import { mergeConfigs, parseCliOptions } from '../src/config.js';
import plugin from '../src/plugin.js';

function getStaticSiteOptionNames() {
  let program = new Command();
  plugin.register(program, {
    config: {},
    output: {},
    services: {},
  });

  let command = program.commands.find(
    candidate => candidate.name() === 'static-site'
  );

  return command.options.map(option => option.long);
}

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

  it('registers --no-headless so users can override headless config', () => {
    let optionNames = getStaticSiteOptionNames();

    assert.ok(optionNames.includes('--no-headless'));
  });

  it('registers --no-use-sitemap so users can disable sitemap discovery', () => {
    let optionNames = getStaticSiteOptionNames();

    assert.ok(optionNames.includes('--no-use-sitemap'));
  });

  it('registers --request-timeout so users can tune the Vizzly transport', () => {
    let optionNames = getStaticSiteOptionNames();

    assert.ok(optionNames.includes('--request-timeout'));
  });

  it('keeps plugin version aligned with package metadata', () => {
    assert.strictEqual(plugin.version, packageJson.version);
  });
});
