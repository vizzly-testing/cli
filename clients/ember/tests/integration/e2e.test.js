/**
 * End-to-end tests for Ember SDK
 *
 * Uses the shared test-site (FluffyCloud) for consistent testing across all SDKs.
 * These tests verify the full flow:
 * 1. Start TDD server
 * 2. Start test-site server
 * 3. Launch browser via our Playwright-based launcher
 * 4. Capture screenshots and verify they reach the TDD server
 *
 * Run with: RUN_E2E=1 npm run test:integration
 */

import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { closeBrowser, launchBrowser } from '../../src/launcher/browser.js';
import {
  setPage,
  startScreenshotServer,
  stopScreenshotServer,
} from '../../src/launcher/screenshot-server.js';

// Paths
let testDir = join(tmpdir(), `vizzly-ember-test-${Date.now()}`);
let testSitePath = resolve(import.meta.dirname, '../../../../test-site');

// Helper to start a static file server for test-site
function startTestSiteServer(port = 3030) {
  return new Promise((resolve, reject) => {
    let server = spawn('python3', ['-m', 'http.server', String(port)], {
      cwd: testSitePath,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;

    server.stderr.on('data', data => {
      let msg = data.toString();
      if (msg.includes('Serving HTTP') && !resolved) {
        resolved = true;
        resolve({ server, port, url: `http://127.0.0.1:${port}` });
      }
    });

    server.on('error', err => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    // Fallback timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ server, port, url: `http://127.0.0.1:${port}` });
      }
    }, 2000);
  });
}

// Check if running under `vizzly tdd run` or `vizzly run`
let externalServer = !!process.env.VIZZLY_SERVER_URL;

// =============================================================================
// E2E Tests with TDD Server and Test Site
// =============================================================================

describe('e2e with TDD server using shared test-site', { skip: !process.env.RUN_E2E }, () => {
  let tddServer = null;
  let testSiteServer = null;
  let screenshotServer = null;
  let browserInstance = null;
  let testSiteUrl = null;

  before(async () => {
    // Check test-site exists
    assert.ok(
      existsSync(join(testSitePath, 'index.html')),
      'test-site/index.html should exist'
    );

    // Start test-site server
    let testSiteInfo = await startTestSiteServer(3030 + Math.floor(Math.random() * 1000));
    testSiteServer = testSiteInfo.server;
    testSiteUrl = testSiteInfo.url;

    // Start TDD server only if not running under vizzly wrapper
    if (!externalServer) {
      // Create test directory for TDD server
      mkdirSync(testDir, { recursive: true });

      tddServer = spawn('npx', ['vizzly', 'tdd', 'start'], {
        cwd: testDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, VIZZLY_HOME: testDir },
      });

      // Wait for TDD server to start
      await new Promise((resolve, reject) => {
        let timeout = setTimeout(() => reject(new Error('TDD server timeout')), 10000);

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

    // Start screenshot server
    screenshotServer = await startScreenshotServer();
  });

  after(async () => {
    if (browserInstance) await closeBrowser(browserInstance);
    if (screenshotServer) await stopScreenshotServer(screenshotServer);
    if (testSiteServer) testSiteServer.kill('SIGTERM');
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
  // Homepage Tests
  // ===========================================================================

  it('captures homepage full page screenshot', async () => {
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;

    browserInstance = await launchBrowser('chromium', `${testSiteUrl}/index.html`, {
      screenshotUrl,
      playwrightOptions: { headless: true },
    });

    setPage(browserInstance.page);

    let response = await fetch(`${screenshotUrl}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'homepage-full',
        properties: { page: 'homepage', fullPage: true },
      }),
    });

    let result = await response.json();
    assert.strictEqual(response.status, 200, 'Should succeed');
    assert.ok(['new', 'match'].includes(result.status), `Should have status 'new' or 'match', got: ${result.status}`);
  });

  it('captures navigation bar with selector', async () => {
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;

    let response = await fetch(`${screenshotUrl}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'homepage-nav',
        selector: 'nav',
        properties: { component: 'navigation' },
      }),
    });

    let result = await response.json();
    assert.strictEqual(response.status, 200, 'Should succeed');
    assert.ok(['new', 'match'].includes(result.status), `Should have status 'new' or 'match', got: ${result.status}`);
  });

  it('captures hero section', async () => {
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;

    let response = await fetch(`${screenshotUrl}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'homepage-hero',
        selector: 'section',
        properties: { section: 'hero' },
      }),
    });

    let result = await response.json();
    assert.strictEqual(response.status, 200, 'Should succeed');
    assert.ok(['new', 'match'].includes(result.status), `Should have status 'new' or 'match', got: ${result.status}`);
  });

  // ===========================================================================
  // Multiple Pages
  // ===========================================================================

  it('captures features page', async () => {
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;

    // Navigate to features page
    await browserInstance.page.goto(`${testSiteUrl}/features.html`);
    await browserInstance.page.waitForLoadState('networkidle');

    let response = await fetch(`${screenshotUrl}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'features-full',
        properties: { page: 'features' },
      }),
    });

    let result = await response.json();
    assert.strictEqual(response.status, 200, 'Should succeed');
    assert.ok(['new', 'match'].includes(result.status), `Should have status 'new' or 'match', got: ${result.status}`);
  });

  it('captures pricing page', async () => {
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;

    await browserInstance.page.goto(`${testSiteUrl}/pricing.html`);
    await browserInstance.page.waitForLoadState('networkidle');

    let response = await fetch(`${screenshotUrl}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'pricing-full',
        properties: { page: 'pricing' },
      }),
    });

    let result = await response.json();
    assert.strictEqual(response.status, 200, 'Should succeed');
    assert.ok(['new', 'match'].includes(result.status), `Should have status 'new' or 'match', got: ${result.status}`);
  });

  it('captures contact page', async () => {
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;

    await browserInstance.page.goto(`${testSiteUrl}/contact.html`);
    await browserInstance.page.waitForLoadState('networkidle');

    let response = await fetch(`${screenshotUrl}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'contact-full',
        properties: { page: 'contact' },
      }),
    });

    let result = await response.json();
    assert.strictEqual(response.status, 200, 'Should succeed');
    assert.ok(['new', 'match'].includes(result.status), `Should have status 'new' or 'match', got: ${result.status}`);
  });

  // ===========================================================================
  // Screenshot Options
  // ===========================================================================

  it('captures screenshot with threshold option', async () => {
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;

    await browserInstance.page.goto(`${testSiteUrl}/index.html`);

    let response = await fetch(`${screenshotUrl}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'threshold-test',
        selector: 'nav',
        threshold: 5,
        properties: { test: 'threshold' },
      }),
    });

    let result = await response.json();
    assert.strictEqual(response.status, 200, 'Should succeed');
    assert.ok(['new', 'match'].includes(result.status), `Should have status 'new' or 'match', got: ${result.status}`);
  });

  it('captures screenshot with all options', async () => {
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;

    let response = await fetch(`${screenshotUrl}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'all-options-test',
        selector: 'footer',
        threshold: 3,
        properties: {
          browser: 'chromium',
          viewport: { width: 1920, height: 1080 },
          testType: 'comprehensive',
        },
      }),
    });

    let result = await response.json();
    assert.strictEqual(response.status, 200, 'Should succeed');
    assert.ok(['new', 'match'].includes(result.status), `Should have status 'new' or 'match', got: ${result.status}`);
  });

  // ===========================================================================
  // Multiple Screenshots Per Test
  // ===========================================================================

  it('captures multiple screenshots in sequence', async () => {
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;
    let pages = ['index.html', 'features.html', 'pricing.html'];

    for (let i = 0; i < pages.length; i++) {
      await browserInstance.page.goto(`${testSiteUrl}/${pages[i]}`);
      await browserInstance.page.waitForLoadState('networkidle');

      let response = await fetch(`${screenshotUrl}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `sequence-${i}`,
          selector: 'nav',
          properties: { page: pages[i], index: i },
        }),
      });

      let result = await response.json();
      assert.strictEqual(response.status, 200, `Should succeed for ${pages[i]}`);
      assert.ok(['new', 'match'].includes(result.status), `Should have status 'new' or 'match', got: ${result.status}`);
    }
  });
});

// =============================================================================
// Tests without TDD Server (verify screenshot server mechanics)
// Skip this suite when running under vizzly wrapper since a TDD server IS available
// =============================================================================

describe('screenshot server mechanics (without TDD server)', { skip: externalServer }, () => {
  let screenshotServer = null;
  let testSiteServer = null;
  let browserInstance = null;
  let testSiteUrl = null;

  before(async () => {
    // Start test-site server
    let testSiteInfo = await startTestSiteServer(4030 + Math.floor(Math.random() * 1000));
    testSiteServer = testSiteInfo.server;
    testSiteUrl = testSiteInfo.url;

    // Start screenshot server
    screenshotServer = await startScreenshotServer();
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;

    // Launch browser pointing to test-site
    browserInstance = await launchBrowser('chromium', `${testSiteUrl}/index.html`, {
      screenshotUrl,
      playwrightOptions: { headless: true },
    });

    setPage(browserInstance.page);
  });

  after(async () => {
    if (browserInstance) await closeBrowser(browserInstance);
    if (screenshotServer) await stopScreenshotServer(screenshotServer);
    if (testSiteServer) testSiteServer.kill('SIGTERM');
  });

  it('screenshot server receives request and captures screenshot (fails without TDD)', async () => {
    let response = await fetch(`http://127.0.0.1:${screenshotServer.port}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'no-tdd-test',
        selector: 'nav',
      }),
    });

    // Without TDD server, should fail at forwarding step
    assert.strictEqual(response.status, 500, 'Should fail without TDD server');

    let result = await response.json();
    assert.ok(
      result.error.includes('No Vizzly server found'),
      'Error should mention missing server'
    );
  });

  it('health endpoint works while page is set', async () => {
    let response = await fetch(`http://127.0.0.1:${screenshotServer.port}/health`);
    let result = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.page, true, 'Page should be available');
  });
});
