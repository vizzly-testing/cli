/**
 * End-to-end test with Vizzly TDD server
 *
 * This test runs the full flow including the TDD server:
 * 1. Start TDD server
 * 2. Launch browser via our launcher
 * 3. Capture screenshot
 * 4. Verify it reaches the TDD server
 *
 * Skip this test if TDD server dependencies aren't available.
 */

import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { closeBrowser, launchBrowser } from '../../src/launcher/browser.js';
import {
  setPage,
  startScreenshotServer,
  stopScreenshotServer,
} from '../../src/launcher/screenshot-server.js';

// Create a temporary directory for this test
let testDir = join(tmpdir(), `vizzly-ember-test-${Date.now()}`);

describe('e2e with TDD server', { skip: !process.env.RUN_E2E }, () => {
  let tddServer = null;
  let screenshotServer = null;
  let testServer = null;
  let testServerPort = null;
  let browserInstance = null;

  before(async () => {
    // Create test directory
    mkdirSync(testDir, { recursive: true });

    // Start TDD server
    tddServer = spawn('npx', ['vizzly', 'tdd', 'start'], {
      cwd: testDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, VIZZLY_HOME: testDir },
    });

    // Wait for TDD server to start
    await new Promise((resolve, reject) => {
      let timeout = setTimeout(() => reject(new Error('TDD server timeout')), 10000);

      tddServer.stdout.on('data', data => {
        if (data.toString().includes('TDD server started') ||
            data.toString().includes('localhost:47392')) {
          clearTimeout(timeout);
          resolve();
        }
      });

      tddServer.on('error', err => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Start test page server
    testServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>E2E Test</title></head>
        <body>
          <h1>E2E Test Page</h1>
          <div id="box" style="width: 100px; height: 100px; background: red;"></div>
        </body>
        </html>
      `);
    });

    await new Promise(resolve => {
      testServer.listen(0, '127.0.0.1', () => {
        testServerPort = testServer.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (browserInstance) await closeBrowser(browserInstance);
    if (screenshotServer) await stopScreenshotServer(screenshotServer);
    if (testServer) testServer.close();
    if (tddServer) {
      tddServer.kill('SIGTERM');
      // Wait for process to exit
      await new Promise(resolve => {
        tddServer.on('exit', resolve);
        setTimeout(resolve, 2000);
      });
    }
    // Cleanup test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('captures screenshot and sends to TDD server', async () => {
    // Start screenshot server
    screenshotServer = await startScreenshotServer();
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;

    // Launch browser
    let testUrl = `http://127.0.0.1:${testServerPort}/`;
    browserInstance = await launchBrowser('chromium', testUrl, {
      screenshotUrl,
      playwrightOptions: { headless: true },
    });

    setPage(browserInstance.page);

    // Make screenshot request directly from test
    let response = await fetch(`${screenshotUrl}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'e2e-test-screenshot',
        properties: { test: 'e2e' },
      }),
    });

    let result = await response.json();

    assert.strictEqual(response.status, 200, 'Should succeed');
    assert.ok(result.success || result.comparison, 'Should have success or comparison');
  });
});

// Run a simpler version without TDD server
describe('e2e without TDD server', () => {
  let screenshotServer = null;
  let testServer = null;
  let testServerPort = null;
  let browserInstance = null;

  before(async () => {
    // Start test page server
    testServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Simple E2E</title></head>
        <body>
          <h1>Simple Test</h1>
          <div id="target" style="width: 50px; height: 50px; background: green;"></div>
        </body>
        </html>
      `);
    });

    await new Promise(resolve => {
      testServer.listen(0, '127.0.0.1', () => {
        testServerPort = testServer.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (browserInstance) await closeBrowser(browserInstance);
    if (screenshotServer) await stopScreenshotServer(screenshotServer);
    if (testServer) testServer.close();
  });

  it('screenshot server receives request and captures screenshot', async () => {
    screenshotServer = await startScreenshotServer();
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;

    let testUrl = `http://127.0.0.1:${testServerPort}/`;
    browserInstance = await launchBrowser('chromium', testUrl, {
      screenshotUrl,
      playwrightOptions: { headless: true },
    });

    setPage(browserInstance.page);

    // Request screenshot - will fail at forward step since no TDD server
    let response = await fetch(`${screenshotUrl}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'simple-test',
        selector: '#target',
      }),
    });

    // We expect 500 because no TDD server, but the screenshot was captured
    assert.strictEqual(response.status, 500, 'Should fail without TDD server');

    let result = await response.json();
    assert.ok(
      result.error.includes('No Vizzly server found'),
      'Error should mention missing server'
    );
  });

  it('health endpoint works while page is set', async () => {
    let response = await fetch(
      `http://127.0.0.1:${screenshotServer.port}/health`
    );
    let result = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.page, true, 'Page should be available');
  });
});
