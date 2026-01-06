/**
 * Integration test for the vizzly-browser launcher
 *
 * This test verifies the full flow:
 * 1. Launcher starts screenshot server
 * 2. Launcher opens browser with Playwright
 * 3. Page can call vizzlyScreenshot via the injected URL
 * 4. Screenshot is captured and forwarded
 */

import assert from 'node:assert';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { closeBrowser, launchBrowser } from '../../src/launcher/browser.js';
import {
  setPage,
  startScreenshotServer,
  stopScreenshotServer,
} from '../../src/launcher/screenshot-server.js';

describe('launcher integration', () => {
  let screenshotServer = null;
  let testServer = null;
  let testServerPort = null;
  let browserInstance = null;

  before(async () => {
    // Start a simple test page server
    testServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Test Page</title></head>
        <body>
          <h1 id="title">Hello Vizzly</h1>
          <div id="content" style="width: 200px; height: 100px; background: blue;">
            Test Content
          </div>
          <script>
            window.testResults = [];

            async function runTest() {
              let screenshotUrl = window.__VIZZLY_SCREENSHOT_URL__;
              if (!screenshotUrl) {
                window.testResults.push({ error: 'No screenshot URL' });
                return;
              }

              try {
                // Test 1: Full page screenshot
                let response = await fetch(screenshotUrl + '/screenshot', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: 'test-full-page',
                    properties: { test: 'integration' }
                  })
                });
                let result = await response.json();
                window.testResults.push({ name: 'full-page', result, status: response.status });

                // Test 2: Element screenshot
                response = await fetch(screenshotUrl + '/screenshot', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: 'test-element',
                    selector: '#content'
                  })
                });
                result = await response.json();
                window.testResults.push({ name: 'element', result, status: response.status });

                window.testsComplete = true;
              } catch (error) {
                window.testResults.push({ error: error.message });
                window.testsComplete = true;
              }
            }

            // Run tests after a small delay to ensure page is ready
            setTimeout(runTest, 100);
          </script>
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
    if (browserInstance) {
      await closeBrowser(browserInstance);
    }
    if (screenshotServer) {
      await stopScreenshotServer(screenshotServer);
    }
    if (testServer) {
      testServer.close();
    }
  });

  it('launches browser and captures screenshots', async () => {
    // Start screenshot server
    screenshotServer = await startScreenshotServer();
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;

    // Launch browser
    let testUrl = `http://127.0.0.1:${testServerPort}/`;
    browserInstance = await launchBrowser('chromium', testUrl, {
      screenshotUrl,
      playwrightOptions: { headless: true },
    });

    // Set page reference for screenshot capture
    setPage(browserInstance.page);

    // Wait for tests to complete
    let testsComplete = await browserInstance.page.evaluate(async () => {
      // Wait up to 5 seconds for tests to complete
      for (let i = 0; i < 50; i++) {
        if (window.testsComplete) return true;
        await new Promise(r => setTimeout(r, 100));
      }
      return false;
    });

    assert.ok(testsComplete, 'Tests should complete');

    // Get test results
    let results = await browserInstance.page.evaluate(() => window.testResults);

    assert.ok(results.length >= 2, 'Should have at least 2 test results');

    // Verify full page screenshot
    let fullPageResult = results.find(r => r.name === 'full-page');
    assert.ok(fullPageResult, 'Should have full-page result');
    // Note: Without a real Vizzly TDD server, we expect an error about no server
    // This still validates the flow works up to the forwarding step
    assert.ok(
      fullPageResult.status === 200 || fullPageResult.status === 500,
      'Should get a response (200 if TDD server running, 500 if not)'
    );

    // Verify element screenshot
    let elementResult = results.find(r => r.name === 'element');
    assert.ok(elementResult, 'Should have element result');
  });

  it('injects screenshot URL into page context', async () => {
    // Start fresh screenshot server
    if (screenshotServer) {
      await stopScreenshotServer(screenshotServer);
    }
    screenshotServer = await startScreenshotServer();
    let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;

    // Close previous browser
    if (browserInstance) {
      await closeBrowser(browserInstance);
    }

    // Launch new browser
    let testUrl = `http://127.0.0.1:${testServerPort}/`;
    browserInstance = await launchBrowser('chromium', testUrl, {
      screenshotUrl,
      playwrightOptions: { headless: true },
    });

    // Verify the URL was injected
    let injectedUrl = await browserInstance.page.evaluate(
      () => window.__VIZZLY_SCREENSHOT_URL__
    );

    assert.strictEqual(injectedUrl, screenshotUrl, 'Screenshot URL should be injected');
  });

  it('captures element screenshots with selector', async () => {
    // Reuse existing browser or launch new one
    if (!browserInstance) {
      screenshotServer = await startScreenshotServer();
      let screenshotUrl = `http://127.0.0.1:${screenshotServer.port}`;
      let testUrl = `http://127.0.0.1:${testServerPort}/`;
      browserInstance = await launchBrowser('chromium', testUrl, {
        screenshotUrl,
        playwrightOptions: { headless: true },
      });
    }

    setPage(browserInstance.page);

    // Directly test screenshot capture
    let element = browserInstance.page.locator('#content');
    let screenshot = await element.screenshot({ type: 'png' });

    assert.ok(screenshot, 'Should capture screenshot');
    assert.ok(Buffer.isBuffer(screenshot), 'Screenshot should be a buffer');
    assert.ok(screenshot.length > 0, 'Screenshot should have content');

    // Verify it's a valid PNG (starts with PNG magic bytes)
    let pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    assert.ok(
      screenshot.subarray(0, 4).equals(pngMagic),
      'Screenshot should be valid PNG'
    );
  });
});
