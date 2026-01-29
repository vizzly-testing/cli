/**
 * E2E Integration Tests for Storybook SDK
 *
 * Uses the example-storybook to verify the full screenshot capture flow:
 * story discovery → browser launch → screenshot capture → TDD server.
 *
 * Run with: VIZZLY_E2E=1 npm test -- e2e.test.js
 *
 * Requires:
 * - TDD server running: `vizzly tdd start`
 * - example-storybook built: `cd example-storybook && npm run build`
 */

import assert from 'node:assert';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { closeBrowser, launchBrowser, navigateToUrl } from '../src/browser.js';
import { discoverStories, generateStoryUrl } from '../src/crawler.js';
import { getBeforeScreenshotHook, getStoryConfig } from '../src/hooks.js';
import { captureAndSendScreenshot } from '../src/screenshot.js';
import { startStaticServer, stopStaticServer } from '../src/server.js';
import { setViewport } from '../src/utils/viewport.js';

/**
 * Prepare a story page for screenshot (test helper)
 * @param {Object} browser - Browser instance
 * @param {string} url - Story URL
 * @param {Object} viewport - Viewport configuration
 * @returns {Promise<Object>} Page instance
 */
async function prepareStoryPage(browser, url, viewport) {
  let page = await browser.newPage();
  await setViewport(page, viewport);
  await navigateToUrl(page, url);
  return page;
}

// Paths
let testDir = join(tmpdir(), `vizzly-storybook-e2e-${Date.now()}`);
let exampleStorybookPath = resolve(import.meta.dirname, '../example-storybook');
let storybookBuildPath = join(exampleStorybookPath, 'dist');

// Skip E2E tests unless explicitly enabled
let runE2E = process.env.VIZZLY_E2E === '1';

// Check if running under `vizzly tdd run` or `vizzly run`
let externalServer = !!process.env.VIZZLY_SERVER_URL;

describe('Storybook E2E with example-storybook', { skip: !runE2E }, () => {
  let tddServer = null;
  let serverInfo = null;
  let browser = null;

  // Mock logger for tests (unused but kept for future use)
  let _logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };

  before(async () => {
    // Check if example-storybook is built, if not build it
    if (!existsSync(storybookBuildPath)) {
      console.log('Building example-storybook...');
      try {
        execSync('npm install && npm run build-storybook', {
          cwd: exampleStorybookPath,
          stdio: 'pipe',
        });
      } catch (error) {
        console.error('Failed to build example-storybook:', error.message);
        throw new Error(
          'example-storybook build required. Run: cd example-storybook && npm run build-storybook'
        );
      }
    }

    assert.ok(
      existsSync(join(storybookBuildPath, 'index.html')),
      'dist/index.html should exist'
    );

    // Start TDD server only if not running under vizzly wrapper
    if (!externalServer) {
      // Create temp directory
      mkdirSync(testDir, { recursive: true });

      tddServer = spawn('npx', ['vizzly', 'tdd', 'start'], {
        cwd: testDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, VIZZLY_HOME: testDir },
      });

      // Wait for TDD server to start
      await new Promise((resolve, reject) => {
        let timeout = setTimeout(
          () => reject(new Error('TDD server timeout')),
          15000
        );

        tddServer.stdout.on('data', data => {
          if (
            data.toString().includes('TDD server started') ||
            data.toString().includes('localhost:47392')
          ) {
            clearTimeout(timeout);
            resolve();
          }
        });

        tddServer.on('error', err => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }

    // Start static server for Storybook
    serverInfo = await startStaticServer(storybookBuildPath);

    // Launch browser
    browser = await launchBrowser({ headless: true });
  });

  after(async () => {
    if (browser) await closeBrowser(browser);
    if (serverInfo) await stopStaticServer(serverInfo);

    if (tddServer && !externalServer) {
      tddServer.kill('SIGTERM');
      await new Promise(resolve => {
        tddServer.on('exit', resolve);
        setTimeout(resolve, 2000);
      });
    }

    if (!externalServer) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // ===========================================================================
  // Story Discovery Tests
  // ===========================================================================

  describe('Story Discovery', () => {
    it('discovers stories from example-storybook', async () => {
      let config = {
        storybookPath: storybookBuildPath,
        include: null,
        exclude: null,
      };

      let stories = await discoverStories(storybookBuildPath, config);

      assert.ok(
        stories.length > 0,
        `Should find stories, found ${stories.length}`
      );

      // Each story should have required fields
      for (let story of stories) {
        assert.ok(story.id, 'Story should have id');
        assert.ok(story.title, 'Story should have title');
        assert.ok(story.name, 'Story should have name');
      }
    });

    it('filters stories with include patterns', async () => {
      // Pattern matches against story.id (e.g., 'components-button--primary')
      let config = {
        storybookPath: storybookBuildPath,
        include: '*button*',
        exclude: null,
      };

      let stories = await discoverStories(storybookBuildPath, config);

      assert.ok(
        stories.length > 0,
        `Should find Button stories, found ${stories.length}`
      );

      // Should only find Button stories
      for (let story of stories) {
        assert.ok(
          story.id.toLowerCase().includes('button'),
          `Should only include Button stories, got: ${story.id}`
        );
      }
    });

    it('excludes stories with exclude patterns', async () => {
      // Pattern matches against story.id (e.g., 'components-button--primary')
      let config = {
        storybookPath: storybookBuildPath,
        include: null,
        exclude: '*button*',
      };

      let stories = await discoverStories(storybookBuildPath, config);

      // Should not find Button stories
      for (let story of stories) {
        assert.ok(
          !story.id.toLowerCase().includes('button'),
          `Should exclude Button stories, got: ${story.id}`
        );
      }
    });
  });

  // ===========================================================================
  // Screenshot Capture Tests
  // ===========================================================================

  describe('Screenshot Capture', () => {
    it('captures story screenshot', async () => {
      let config = {
        storybookPath: storybookBuildPath,
        include: null,
        exclude: null,
      };

      let stories = await discoverStories(storybookBuildPath, config);
      assert.ok(stories.length > 0, 'Need at least one story');

      let story = stories[0];
      let storyUrl = generateStoryUrl(serverInfo.url, story.id);
      let viewport = { name: 'desktop', width: 1920, height: 1080 };

      let page = await prepareStoryPage(browser, storyUrl, viewport);

      try {
        await captureAndSendScreenshot(page, story, viewport, {
          threshold: 0,
          properties: { test: 'e2e' },
        });

        // If we get here without error, screenshot succeeded
        assert.ok(true, 'Screenshot should succeed');
      } finally {
        await page.close();
      }
    });

    it('captures story with custom threshold', async () => {
      let config = {
        storybookPath: storybookBuildPath,
        include: null,
        exclude: null,
      };

      let stories = await discoverStories(storybookBuildPath, config);
      let story = stories[0];
      let storyUrl = generateStoryUrl(serverInfo.url, story.id);
      let viewport = { name: 'desktop', width: 1920, height: 1080 };

      let page = await prepareStoryPage(browser, storyUrl, viewport);

      try {
        await captureAndSendScreenshot(page, story, viewport, {
          threshold: 5,
          properties: { test: 'threshold' },
        });

        assert.ok(true, 'Screenshot with threshold should succeed');
      } finally {
        await page.close();
      }
    });
  });

  // ===========================================================================
  // Multi-Story Tests
  // ===========================================================================

  describe('Multi-Story Screenshots', () => {
    it('captures multiple stories', async () => {
      let config = {
        storybookPath: storybookBuildPath,
        include: null,
        exclude: null,
      };

      let stories = await discoverStories(storybookBuildPath, config);
      let storiesToTest = stories.slice(0, 3); // Test first 3 stories
      let viewport = { name: 'desktop', width: 1920, height: 1080 };

      let results = [];

      for (let story of storiesToTest) {
        let storyUrl = generateStoryUrl(serverInfo.url, story.id);
        let page = await prepareStoryPage(browser, storyUrl, viewport);

        try {
          await captureAndSendScreenshot(page, story, viewport, {
            threshold: 0,
            properties: { storyId: story.id },
          });
          results.push({ story: story.id, success: true });
        } catch (error) {
          results.push({
            story: story.id,
            success: false,
            error: error.message,
          });
        } finally {
          await page.close();
        }
      }

      let allSucceeded = results.every(r => r.success);
      assert.ok(allSucceeded, 'All story screenshots should succeed');
    });

    it('captures stories with multiple viewports', async () => {
      let config = {
        storybookPath: storybookBuildPath,
        include: null,
        exclude: null,
      };

      let stories = await discoverStories(storybookBuildPath, config);
      let story = stories[0];

      let viewports = [
        { name: 'desktop', width: 1920, height: 1080 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'mobile', width: 375, height: 812 },
      ];

      let results = [];

      for (let viewport of viewports) {
        let storyUrl = generateStoryUrl(serverInfo.url, story.id);
        let page = await prepareStoryPage(browser, storyUrl, viewport);

        try {
          await captureAndSendScreenshot(page, story, viewport, {
            threshold: 0,
            properties: { viewport: viewport.name },
          });
          results.push({ viewport: viewport.name, success: true });
        } catch (error) {
          results.push({
            viewport: viewport.name,
            success: false,
            error: error.message,
          });
        } finally {
          await page.close();
        }
      }

      let allSucceeded = results.every(r => r.success);
      assert.ok(allSucceeded, 'All viewport screenshots should succeed');
    });
  });

  // ===========================================================================
  // Story Configuration Tests
  // ===========================================================================

  describe('Story Configuration', () => {
    it('generates correct story URLs', () => {
      let baseUrl = 'http://localhost:6006';
      let storyId = 'example-button--primary';

      let url = generateStoryUrl(baseUrl, storyId);

      assert.ok(url.includes(baseUrl), 'URL should include base URL');
      assert.ok(url.includes(storyId), 'URL should include story ID');
      assert.ok(
        url.includes('viewMode=story'),
        'URL should have viewMode=story'
      );
    });

    it('gets story-specific config', () => {
      let story = {
        id: 'example-button--primary',
        title: 'Example/Button',
        name: 'Primary',
      };

      let config = {
        viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
        threshold: 0,
        stories: {
          'Example/Button': {
            threshold: 5,
          },
        },
      };

      let storyConfig = getStoryConfig(story, config);

      // Should have viewports from config
      assert.ok(storyConfig.viewports, 'Should have viewports');
    });

    it('gets before-screenshot hook for story', () => {
      let story = {
        id: 'example-button--primary',
        title: 'Example/Button',
        name: 'Primary',
      };

      let config = {
        interactions: {
          // Pattern matches against story.id (example-button--primary)
          '*button*': async page => {
            await page.waitForSelector('button');
          },
        },
      };

      let hook = getBeforeScreenshotHook(story, config);

      // Hook should be a function (pattern *button* matches story.id)
      assert.ok(
        typeof hook === 'function',
        `Hook should be function, got ${typeof hook}`
      );
    });
  });
});

// ===========================================================================
// Unit tests that don't require TDD server
// ===========================================================================

describe('Storybook SDK (unit tests)', () => {
  it('generates correct iframe URL for story', () => {
    let baseUrl = 'http://localhost:6006';
    let storyId = 'components-button--primary';

    let url = generateStoryUrl(baseUrl, storyId);

    assert.ok(url.startsWith(baseUrl), 'Should start with base URL');
    assert.ok(url.includes('iframe.html'), 'Should use iframe.html');
    assert.ok(url.includes(`id=${storyId}`), 'Should include story ID');
    assert.ok(url.includes('viewMode=story'), 'Should set viewMode to story');
  });

  it('discovers stories from storybook build', async () => {
    // Skip if example-storybook not built
    if (!existsSync(storybookBuildPath)) {
      return;
    }

    let config = {
      storybookPath: storybookBuildPath,
      include: null,
      exclude: null,
    };

    let stories = await discoverStories(storybookBuildPath, config);
    assert.ok(stories.length > 0, 'Should find stories');
  });

  it('matches stories against include patterns', async () => {
    // Skip if example-storybook not built
    if (!existsSync(storybookBuildPath)) {
      return;
    }

    let config = {
      storybookPath: storybookBuildPath,
      include: null, // Include all
      exclude: null,
    };

    let allStories = await discoverStories(storybookBuildPath, config);

    let filteredConfig = {
      storybookPath: storybookBuildPath,
      include: '**/Button*',
      exclude: null,
    };

    let filteredStories = await discoverStories(
      storybookBuildPath,
      filteredConfig
    );

    assert.ok(
      filteredStories.length <= allStories.length,
      'Filtered count should be less than or equal to all'
    );
  });
});
