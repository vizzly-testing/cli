import assert from 'node:assert';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { browserMappings, configure } from '../../src/testem-config.js';

describe('testem-config', () => {
  beforeEach(() => {
    // Clean up before each test
  });

  afterEach(() => {
    // Clean up any playwright.json that was written
    let playwrightConfig = join(process.cwd(), '.vizzly', 'playwright.json');
    if (existsSync(playwrightConfig)) {
      rmSync(playwrightConfig);
    }
  });

  describe('configure()', () => {
    it('returns config with Vizzly launchers when given empty object', () => {
      let result = configure({});
      assert.ok(result.launchers, 'should have launchers');
      assert.ok(result.launchers.VizzlyChrome, 'should have VizzlyChrome');
      assert.ok(result.launchers.VizzlyFirefox, 'should have VizzlyFirefox');
      assert.ok(result.launchers.VizzlyWebKit, 'should have VizzlyWebKit');
    });

    it('remaps Chrome to VizzlyChrome in launch_in_ci', () => {
      let result = configure({
        launch_in_ci: ['Chrome'],
      });
      assert.deepStrictEqual(result.launch_in_ci, ['VizzlyChrome']);
    });

    it('remaps Firefox to VizzlyFirefox in launch_in_ci', () => {
      let result = configure({
        launch_in_ci: ['Firefox'],
      });
      assert.deepStrictEqual(result.launch_in_ci, ['VizzlyFirefox']);
    });

    it('remaps Safari to VizzlyWebKit in launch_in_ci', () => {
      let result = configure({
        launch_in_ci: ['Safari'],
      });
      assert.deepStrictEqual(result.launch_in_ci, ['VizzlyWebKit']);
    });

    it('remaps multiple browsers in launch_in_ci', () => {
      let result = configure({
        launch_in_ci: ['Chrome', 'Firefox'],
      });
      assert.deepStrictEqual(result.launch_in_ci, [
        'VizzlyChrome',
        'VizzlyFirefox',
      ]);
    });

    it('remaps browsers in launch_in_dev', () => {
      let result = configure({
        launch_in_dev: ['Chrome'],
      });
      assert.deepStrictEqual(result.launch_in_dev, ['VizzlyChrome']);
    });

    it('preserves unknown browser names', () => {
      let result = configure({
        launch_in_ci: ['Chrome', 'IE', 'CustomBrowser'],
      });
      assert.deepStrictEqual(result.launch_in_ci, [
        'VizzlyChrome',
        'IE',
        'CustomBrowser',
      ]);
    });

    it('preserves other config options', () => {
      let result = configure({
        test_page: 'tests/index.html?hidepassed',
        launch_in_ci: ['Chrome'],
        disable_watching: true,
      });

      assert.strictEqual(result.test_page, 'tests/index.html?hidepassed');
      assert.strictEqual(result.disable_watching, true);
    });

    it('merges with existing launchers', () => {
      let result = configure({
        launchers: {
          CustomLauncher: { exe: 'custom', args: ['--test'] },
        },
      });

      assert.ok(result.launchers.CustomLauncher, 'preserves custom launcher');
      assert.ok(result.launchers.VizzlyChrome, 'adds VizzlyChrome');
    });

    it('creates correct VizzlyChrome launcher config', () => {
      let result = configure({});
      let launcher = result.launchers.VizzlyChrome;

      assert.strictEqual(launcher.exe, 'node');
      assert.ok(Array.isArray(launcher.args));
      assert.strictEqual(launcher.protocol, 'browser');

      // Check args format: [launcherPath, browserType]
      assert.ok(launcher.args[0].endsWith('vizzly-testem-launcher.js'));
      assert.strictEqual(launcher.args[1], 'chromium');
    });

    it('creates correct VizzlyFirefox launcher config', () => {
      let result = configure({});
      let launcher = result.launchers.VizzlyFirefox;

      assert.strictEqual(launcher.exe, 'node');
      assert.ok(Array.isArray(launcher.args));
      assert.strictEqual(launcher.protocol, 'browser');
      assert.ok(launcher.args[0].endsWith('vizzly-testem-launcher.js'));
      assert.strictEqual(launcher.args[1], 'firefox');
    });

    it('creates correct VizzlyWebKit launcher config', () => {
      let result = configure({});
      let launcher = result.launchers.VizzlyWebKit;

      assert.strictEqual(launcher.exe, 'node');
      assert.ok(Array.isArray(launcher.args));
      assert.strictEqual(launcher.protocol, 'browser');
      assert.ok(launcher.args[0].endsWith('vizzly-testem-launcher.js'));
      assert.strictEqual(launcher.args[1], 'webkit');
    });

    it('writes playwright.json when playwrightOptions provided', () => {
      configure({}, { headless: false, slowMo: 100, timeout: 30000 });

      let configPath = join(process.cwd(), '.vizzly', 'playwright.json');
      assert.ok(existsSync(configPath), 'should write playwright.json');

      let content = JSON.parse(readFileSync(configPath, 'utf8'));
      assert.deepStrictEqual(content, {
        headless: false,
        slowMo: 100,
        timeout: 30000,
      });
    });

    it('does not write playwright.json when playwrightOptions is empty', () => {
      // Clean up any existing file first
      let configPath = join(process.cwd(), '.vizzly', 'playwright.json');
      if (existsSync(configPath)) {
        rmSync(configPath);
      }

      configure({}, {});

      assert.ok(!existsSync(configPath), 'should not write empty playwright.json');
    });

    it('handles lowercase browser names', () => {
      let result = configure({
        launch_in_ci: ['chrome', 'firefox', 'safari', 'webkit'],
      });
      assert.deepStrictEqual(result.launch_in_ci, [
        'VizzlyChrome',
        'VizzlyFirefox',
        'VizzlyWebKit',
        'VizzlyWebKit',
      ]);
    });

    it('returns new object without mutating input', () => {
      let input = {
        launch_in_ci: ['Chrome'],
        test_page: 'tests/index.html',
      };
      let inputCopy = JSON.parse(JSON.stringify(input));

      configure(input);

      assert.deepStrictEqual(input, inputCopy, 'input should not be mutated');
    });
  });

  describe('browserMappings', () => {
    it('maps Chrome to VizzlyChrome', () => {
      assert.strictEqual(browserMappings.Chrome, 'VizzlyChrome');
    });

    it('maps chrome (lowercase) to VizzlyChrome', () => {
      assert.strictEqual(browserMappings.chrome, 'VizzlyChrome');
    });

    it('maps Firefox to VizzlyFirefox', () => {
      assert.strictEqual(browserMappings.Firefox, 'VizzlyFirefox');
    });

    it('maps Safari to VizzlyWebKit', () => {
      assert.strictEqual(browserMappings.Safari, 'VizzlyWebKit');
    });

    it('maps WebKit to VizzlyWebKit', () => {
      assert.strictEqual(browserMappings.WebKit, 'VizzlyWebKit');
    });
  });
});
