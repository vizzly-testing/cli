import { test, expect } from '@playwright/test';
import { vizzlyScreenshot } from '../../dist/client/index.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createReporterTestServer } from './test-helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test.describe('Vizzly Reporter - Visual Tests', () => {
  test('Empty State', async ({ page, browserName }) => {
    let server;
    // Load empty state fixture
    let fixtureData = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'empty-state.json'), 'utf8')
    );

    // Start test server with fixture
    server = createReporterTestServer(fixtureData, 3456);
    await server.start();

    // Navigate to reporter
    await page.goto('/', { waitUntil: 'networkidle' });

    // Verify empty state is displayed
    await expect(page.locator('text=No screenshots yet')).toBeVisible();

    // Take screenshot
    await vizzlyScreenshot(
      'reporter-empty-state',
      await page.screenshot({ fullPage: true }),
      {
        browser: browserName,
        viewport: page.viewportSize(),
      }
    );

    // Cleanup
    await server.stop();
  });

  test('Passed Comparisons', async ({ page, browserName }) => {
    let server;
    // Load passed state fixture
    let fixtureData = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'passed-state.json'), 'utf8')
    );

    // Start test server with fixture
    server = createReporterTestServer(fixtureData, 3456);
    await server.start();

    // Navigate to reporter
    await page.goto('/', { waitUntil: 'networkidle' });

    // Verify passed comparisons are displayed
    await expect(page.locator('text=homepage-desktop')).toBeVisible();
    await expect(page.locator('text=homepage-mobile')).toBeVisible();

    // Verify status filters show correct counts
    await expect(page.locator('text=All (2)')).toBeVisible();
    await expect(page.locator('text=Passed (2)')).toBeVisible();

    // Take screenshot
    await vizzlyScreenshot(
      'reporter-passed-state',
      await page.screenshot({ fullPage: true }),
      {
        browser: browserName,
        viewport: page.viewportSize(),
        marketing: true,
      }
    );

    // Cleanup
    await server.stop();
  });

  test('Failed Comparisons', async ({ page, browserName }) => {
    let server;

    // Load failed state fixture
    let fixtureData = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'failed-state.json'), 'utf8')
    );

    // Start test server with fixture (unique port for this test)
    server = createReporterTestServer(fixtureData, 3458);
    await server.start();

    // Navigate to reporter
    await page.goto('http://localhost:3458/', { waitUntil: 'networkidle' });

    // Verify both comparisons are displayed
    await expect(page.locator('text=homepage-desktop')).toBeVisible();
    await expect(page.locator('text=pricing-page')).toBeVisible();

    // Verify status filters show correct counts
    await expect(page.locator('text=All (2)')).toBeVisible();
    await expect(page.locator('text=Failed (1)')).toBeVisible();
    await expect(page.locator('text=Passed (1)')).toBeVisible();

    // Take screenshot
    await vizzlyScreenshot(
      'reporter-failed-state',
      await page.screenshot({ fullPage: true }),
      {
        browser: browserName,
        viewport: page.viewportSize(),
      }
    );

    // Cleanup
    await server.stop();
  });

  test('Failed Comparison with Overlay Mode', async ({ page, browserName }) => {
    let server;

    // Load failed state fixture
    let fixtureData = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'failed-state.json'), 'utf8')
    );

    // Start test server with fixture (unique port for this test)
    server = createReporterTestServer(fixtureData, 3459);
    await server.start();

    // Navigate to reporter
    await page.goto('http://localhost:3459/', { waitUntil: 'networkidle' });

    // Click on the failed comparison to open it
    await page.locator('text=homepage-desktop').click();

    // Wait for comparison viewer to load
    await expect(page.locator('text=Overlay')).toBeVisible();
    await expect(page.locator('text=Side by Side')).toBeVisible();

    // Verify overlay mode is active by default
    await expect(
      page.locator('button:has-text("Overlay")').first()
    ).toHaveClass(/bg-amber-500/);

    // Verify Accept/Reject buttons are visible (individual comparison actions)
    await expect(
      page.getByRole('button', { name: 'Accept', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Reject', exact: true })
    ).toBeVisible();

    // Take screenshot of overlay mode
    await vizzlyScreenshot(
      'reporter-overlay-mode',
      await page.screenshot({ fullPage: true }),
      {
        browser: browserName,
        viewport: page.viewportSize(),
        marketing: true,
      }
    );

    // Cleanup
    await server.stop();
  });

  test('Failed Comparison with Onion Mode on Diff', async ({
    page,
    browserName,
  }) => {
    let server;

    // Load failed state fixture
    let fixtureData = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'failed-state.json'), 'utf8')
    );

    // Start test server with fixture (unique port for this test)
    server = createReporterTestServer(fixtureData, 3460);
    await server.start();

    // Navigate to reporter
    await page.goto('http://localhost:3460/', { waitUntil: 'networkidle' });

    // Click on the failed comparison to open it
    await page.locator('text=homepage-desktop').click();

    // Wait for comparison viewer to load
    await expect(page.locator('text=Overlay')).toBeVisible();
    await expect(page.locator('text=Side by Side')).toBeVisible();
    await expect(page.locator('text=Onion')).toBeVisible();

    // Click on Onion mode
    await page.locator('button:has-text("Onion")').click();

    // Verify onion mode is active
    await expect(page.locator('button:has-text("Onion")').first()).toHaveClass(
      /bg-amber-500/
    );

    // Click on Diff tab
    await page.locator('button:has-text("Diff")').click();

    // Take screenshot of onion mode on diff
    await vizzlyScreenshot(
      'reporter-onion-mode-diff',
      await page.screenshot({ fullPage: true }),
      {
        browser: browserName,
        viewport: page.viewportSize(),
        marketing: true,
      }
    );

    // Cleanup
    await server.stop();
  });

  test('Stats View', async ({ page, browserName }) => {
    let server;

    // Load passed state fixture (has some data to show stats)
    let fixtureData = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'passed-state.json'), 'utf8')
    );

    // Start test server
    server = createReporterTestServer(fixtureData, 3461);
    await server.start();

    // Navigate directly to stats route
    await page.goto('http://localhost:3461/stats', {
      waitUntil: 'networkidle',
    });

    // Wait for stats content to load
    await expect(page.locator('text=Statistics Overview')).toBeVisible();

    // Take screenshot
    await vizzlyScreenshot(
      'reporter-stats-view',
      await page.screenshot({ fullPage: true }),
      {
        browser: browserName,
        viewport: page.viewportSize(),
      }
    );

    // Cleanup
    await server.stop();
  });

  test('Settings View', async ({ page, browserName }) => {
    let server;

    // Load empty state fixture (settings doesn't depend on comparison data)
    let fixtureData = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'empty-state.json'), 'utf8')
    );

    // Start test server
    server = createReporterTestServer(fixtureData, 3462);
    await server.start();

    // Navigate directly to settings route
    await page.goto('http://localhost:3462/settings', {
      waitUntil: 'networkidle',
    });

    // Wait for settings content to load
    await expect(page.locator('text=General Settings')).toBeVisible();

    // Take screenshot
    await vizzlyScreenshot(
      'reporter-settings-view',
      await page.screenshot({ fullPage: true }),
      {
        browser: browserName,
        viewport: page.viewportSize(),
      }
    );

    // Cleanup
    await server.stop();
  });

  test('Projects View - Not Authenticated', async ({ page, browserName }) => {
    let server;

    // Load empty state fixture
    let fixtureData = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'empty-state.json'), 'utf8')
    );

    // Start test server
    server = createReporterTestServer(fixtureData, 3463);
    await server.start();

    // Navigate directly to projects route
    await page.goto('http://localhost:3463/projects', {
      waitUntil: 'networkidle',
    });

    // Wait for projects content to load - should show sign in prompt since not authenticated
    await expect(
      page.locator('text=Sign in to access projects and team features')
    ).toBeVisible();

    // Take screenshot
    await vizzlyScreenshot(
      'reporter-projects-view-logged-out',
      await page.screenshot({ fullPage: true }),
      {
        browser: browserName,
        viewport: page.viewportSize(),
      }
    );

    // Cleanup
    await server.stop();
  });
});
