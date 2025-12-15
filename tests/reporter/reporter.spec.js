import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { vizzlyScreenshot } from '../../dist/client/index.js';
import { createReporterTestServer } from './test-helper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test.describe('Vizzly Reporter - Visual Tests', () => {
  test('Empty State', async ({ page, browserName }) => {
    let server;
    // Load empty state fixture
    const fixtureData = JSON.parse(
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
    const fixtureData = JSON.parse(
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
    const fixtureData = JSON.parse(
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
    // Skip on mobile - view mode buttons are hidden on small screens
    const viewport = page.viewportSize();
    test.skip(viewport.width < 640, 'View mode buttons hidden on mobile');

    let server;

    // Load failed state fixture
    const fixtureData = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'failed-state.json'), 'utf8')
    );

    // Start test server with fixture (unique port for this test)
    server = createReporterTestServer(fixtureData, 3459);
    await server.start();

    // Navigate to reporter
    await page.goto('http://localhost:3459/', { waitUntil: 'networkidle' });

    // Click on the failed comparison to open it
    await page.locator('text=homepage-desktop').click();

    // Wait for fullscreen comparison viewer to load
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Verify view mode buttons are visible
    await expect(
      page.getByRole('button', { name: 'Overlay', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Toggle', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Slide', exact: true })
    ).toBeVisible();

    // Verify overlay mode is active by default
    await expect(
      page.getByRole('button', { name: 'Overlay', exact: true })
    ).toHaveClass(/bg-blue-600/);

    // Verify Approve/Reject buttons are visible (individual comparison actions)
    await expect(
      page.getByRole('button', { name: 'Approve', exact: true })
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

  test('Failed Comparison with Slide Mode', async ({ page, browserName }) => {
    // Skip on mobile - view mode buttons are hidden on small screens
    const viewport = page.viewportSize();
    test.skip(viewport.width < 640, 'View mode buttons hidden on mobile');

    let server;

    // Load failed state fixture
    const fixtureData = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'failed-state.json'), 'utf8')
    );

    // Start test server with fixture (unique port for this test)
    server = createReporterTestServer(fixtureData, 3460);
    await server.start();

    // Navigate to reporter
    await page.goto('http://localhost:3460/', { waitUntil: 'networkidle' });

    // Click on the failed comparison to open it
    await page.locator('text=homepage-desktop').click();

    // Wait for fullscreen comparison viewer to load
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Verify view mode buttons are visible
    await expect(
      page.getByRole('button', { name: 'Overlay', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Toggle', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Slide', exact: true })
    ).toBeVisible();

    // Click on Slide mode (formerly Onion)
    await page.getByRole('button', { name: 'Slide', exact: true }).click();

    // Verify slide mode is active
    await expect(
      page.getByRole('button', { name: 'Slide', exact: true })
    ).toHaveClass(/bg-blue-600/);

    // Take screenshot of slide mode
    await vizzlyScreenshot(
      'reporter-slide-mode',
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
    const fixtureData = JSON.parse(
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
    await expect(page.locator('text=Statistics')).toBeVisible();

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
    const fixtureData = JSON.parse(
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

  test('Reject Comparison', async ({ page, browserName }) => {
    // Skip on mobile - view mode buttons are hidden on small screens
    const viewport = page.viewportSize();
    test.skip(viewport.width < 640, 'Action buttons hidden on mobile');

    let server;

    // Load failed state fixture
    const fixtureData = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'failed-state.json'), 'utf8')
    );

    // Start test server with fixture (unique port for this test)
    server = createReporterTestServer(fixtureData, 3465);
    await server.start();

    // Navigate to reporter
    await page.goto('http://localhost:3465/', { waitUntil: 'networkidle' });

    // Click on the failed comparison to open it
    await page.locator('text=homepage-desktop').click();

    // Wait for fullscreen comparison viewer to load
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Verify Reject button is visible
    const rejectButton = page.getByTestId('btn-reject');
    await expect(rejectButton).toBeVisible();

    // Click Reject button
    await rejectButton.click();

    // Wait for the mutation to be processed
    await page.waitForResponse(
      response =>
        response.url().includes('/api/baseline/reject') &&
        response.status() === 200
    );

    // Verify reject button shows active/selected state (red background)
    await expect(rejectButton).toHaveClass(/bg-red-600/);

    // Take screenshot of rejected state
    await vizzlyScreenshot(
      'reporter-comparison-rejected',
      await page.screenshot({ fullPage: true }),
      {
        browser: browserName,
        viewport: page.viewportSize(),
      }
    );

    // Verify the mutation was recorded via test endpoint
    const mutationsResponse = await page.request.get(
      'http://localhost:3465/__test__/mutations'
    );
    const { mutations } = await mutationsResponse.json();
    expect(mutations).toContainEqual(
      expect.objectContaining({
        type: 'reject',
        id: expect.any(String),
      })
    );

    // Cleanup
    await server.stop();
  });

  test('Accept then Reject Comparison', async ({ page }) => {
    // Skip on mobile - view mode buttons are hidden on small screens
    const viewport = page.viewportSize();
    test.skip(viewport.width < 640, 'Action buttons hidden on mobile');

    let server;

    // Load failed state fixture
    const fixtureData = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'failed-state.json'), 'utf8')
    );

    // Start test server with fixture (unique port for this test)
    server = createReporterTestServer(fixtureData, 3466);
    await server.start();

    // Navigate to reporter
    await page.goto('http://localhost:3466/', { waitUntil: 'networkidle' });

    // Click on the failed comparison to open it
    await page.locator('text=homepage-desktop').click();

    // Wait for fullscreen comparison viewer to load
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();

    // Click Approve button first
    const approveButton = page.getByTestId('btn-approve');
    await approveButton.click();

    // Wait for the accept mutation to be processed
    await page.waitForResponse(
      response =>
        response.url().includes('/api/baseline/accept') &&
        response.status() === 200
    );

    // Verify approve button shows active state (green background)
    await expect(approveButton).toHaveClass(/bg-green-600/);

    // Now click Reject button to change decision
    const rejectButton = page.getByTestId('btn-reject');
    await rejectButton.click();

    // Wait for the reject mutation to be processed
    await page.waitForResponse(
      response =>
        response.url().includes('/api/baseline/reject') &&
        response.status() === 200
    );

    // Verify reject button now shows active state
    await expect(rejectButton).toHaveClass(/bg-red-600/);

    // Verify the mutations were recorded
    const mutationsResponse = await page.request.get(
      'http://localhost:3466/__test__/mutations'
    );
    const { mutations } = await mutationsResponse.json();

    // Should have both accept and reject mutations
    expect(mutations.length).toBe(2);
    expect(mutations[0].type).toBe('accept');
    expect(mutations[1].type).toBe('reject');

    // Cleanup
    await server.stop();
  });

  test('Projects View - Not Authenticated', async ({ page, browserName }) => {
    let server;

    // Load empty state fixture
    const fixtureData = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'empty-state.json'), 'utf8')
    );

    // Start test server - use same port pattern as other tests
    server = createReporterTestServer(fixtureData, 3464);
    await server.start();

    // Navigate directly to projects route
    await page.goto('http://localhost:3464/projects', {
      waitUntil: 'networkidle',
    });

    // Wait for projects content to load - should show sign in prompt since not authenticated
    await expect(
      page.getByRole('heading', { name: 'Projects', level: 1 })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Not signed in', level: 3 })
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
