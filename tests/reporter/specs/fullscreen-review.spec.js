import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { startRealReporter } from '../real-server-helper.js';
import { waitForFullscreenViewerReady } from './viewer-test-utils.js';

let fixture = JSON.parse(
  await readFile(
    new URL('../fixtures/mixed-state.json', import.meta.url),
    'utf8'
  )
);
let pricingId = 'pricing-page-firefox-1920x1080';
let checkoutId = 'checkout-form-safari-1280x720';
let newId = 'dashboard-widget-chrome-1920x1080';

test.describe('Local fullscreen review', () => {
  let server;

  test.beforeEach(async () => {
    let data = structuredClone(fixture);
    let pricing = data.comparisons.find(item => item.id === pricingId);
    pricing.diffClusters = [
      {
        boundingBox: { x: 200, y: 300, width: 1000, height: 100 },
        pixelCount: 5000,
      },
      {
        boundingBox: { x: 400, y: 2800, width: 600, height: 90 },
        pixelCount: 900,
      },
    ];
    pricing.diffCount = 5900;
    pricing.properties.metadata = { component: 'PricingCard' };
    let checkout = data.comparisons.find(item => item.id === checkoutId);
    checkout.properties = {
      browser: 'safari',
      viewport_width: 1280,
      viewport_height: 720,
    };
    pricing.properties.suite = 'Checkout';
    pricing.properties.url = 'https://example.test/pricing';
    data.comparisons.push({
      ...pricing,
      id: 'pricing-page-chromium-1920x1080',
      properties: { ...pricing.properties, browser: 'chromium' },
    });
    server = await startRealReporter(data);
  });

  test.afterEach(async () => {
    await server?.stop();
  });

  async function openReview(page, id = pricingId) {
    await page.goto(`${server.url}/comparison/${id}`);
    await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();
    await waitForFullscreenViewerReady(page);
  }

  async function openQueue(page) {
    if (page.viewportSize().width < 640) {
      await page.getByRole('button', { name: 'Queue', exact: true }).click();
    }
    return page.getByRole('tabpanel', { name: 'Queue', exact: true });
  }

  async function capture(page, testInfo, name) {
    await waitForFullscreenViewerReady(page);
    let path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path });
    await testInfo.attach(name, { path, contentType: 'image/png' });
  }

  test('review chrome, metadata, and one sidebar match the product layout', async ({
    page,
  }, testInfo) => {
    await openReview(page);
    await expect(
      page.getByRole('heading', { level: 1, name: 'pricing-page', exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('1920×1080', { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Fit width', exact: true })
    ).toBeVisible();
    await capture(page, testInfo, 'fullscreen-review');
    let queue = await openQueue(page);
    await expect(
      queue.getByRole('button', { name: /pricing-page/ })
    ).toBeVisible();
    await expect(
      queue.getByRole('list', { name: 'pricing-page variants' })
    ).toBeVisible();
    await capture(page, testInfo, 'review-queue-variants');
    await page.getByRole('tab', { name: 'Details', exact: true }).click();
    let details = page.getByRole('tabpanel', { name: 'Details', exact: true });
    await expect(details.getByText('1920×1080', { exact: true })).toBeVisible();
    await expect(details.getByText('5,900', { exact: true })).toBeVisible();
    await expect(
      details.getByText('https://example.test/pricing', { exact: true })
    ).toBeVisible();
    await expect(
      details.getByText('PricingCard', { exact: true })
    ).toBeVisible();
    await expect(queue).not.toBeVisible();
    await capture(page, testInfo, 'review-details');
    await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .click();
    await expect(details).not.toBeVisible();
    let dimensions = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    expect(dimensions.scrollWidth).toBe(dimensions.width);
    expect(dimensions.scrollHeight).toBe(dimensions.height);
  });

  test('search, filters, and variant navigation operate on the review queue', async ({
    page,
  }) => {
    await openReview(page);
    let queue = await openQueue(page);
    let search = queue.getByRole('textbox', { name: 'Search review queue' });
    await search.fill('checkout-form');
    await expect(
      queue.getByRole('button', { name: 'checkout-form', exact: true })
    ).toBeVisible();
    await expect(
      queue.getByRole('button', { name: /pricing-page/ })
    ).not.toBeVisible();
    await queue
      .getByRole('button', { name: 'Clear search', exact: true })
      .click();
    await queue.getByRole('button', { name: 'New', exact: true }).click();
    await expect(
      queue.getByRole('button', { name: /dashboard-widget/ })
    ).toBeVisible();
    await expect(
      queue.getByRole('button', { name: 'checkout-form', exact: true })
    ).not.toBeVisible();
    await queue.getByRole('button', { name: 'All', exact: true }).click();
    await queue
      .getByRole('button', { name: 'chromium · 1920×1080', exact: true })
      .click();
    await expect(page).toHaveURL(/pricing-page-chromium-1920x1080$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'pricing-page', exact: true })
    ).toBeVisible();
  });

  test('fit modes, actual size, and comparison modes render at the requested scale', async ({
    page,
  }, testInfo) => {
    await openReview(page);
    let canvas = page.getByTestId('screenshot-canvas');
    let current = canvas.getByRole('img', {
      name: 'pricing-page',
      exact: true,
    });
    let width = await current.evaluate(
      img => img.getBoundingClientRect().width
    );
    let availableWidth = await canvas.evaluate(
      element => element.clientWidth - 40
    );
    expect(Math.abs(width - availableWidth)).toBeLessThan(2);
    await page.getByRole('button', { name: 'Fit width', exact: true }).click();
    await page
      .getByRole('menuitemradio', { name: 'Fit to screen', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Fit screen', exact: true })
    ).toBeVisible();
    let bounds = await current.boundingBox();
    let canvasBounds = await canvas.boundingBox();
    expect(bounds.height).toBeLessThanOrEqual(canvasBounds.height - 39);
    await page.getByRole('button', { name: 'Fit screen', exact: true }).click();
    await page
      .getByRole('menuitemradio', { name: 'Actual size', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: '100%', exact: true })
    ).toBeVisible();
    expect(
      await current.evaluate(img => img.getBoundingClientRect().width)
    ).toBe(await current.evaluate(img => img.naturalWidth));
    await page.keyboard.press('9');
    await page.getByRole('radio', { name: 'Toggle', exact: true }).click();
    await expect(canvas.getByText('Showing Baseline')).toBeVisible();
    await page.getByRole('heading', { level: 1 }).click();
    await page.keyboard.press('Space');
    await page.keyboard.press('d');
    await expect(canvas.getByText('Showing Current')).toBeVisible();
    await page.getByRole('radio', { name: 'Slide', exact: true }).click();
    let slider = canvas.getByRole('slider');
    await expect(slider).toBeVisible();
    await slider.fill('75');
    await expect(canvas.getByText('75% current')).toBeVisible();
    await capture(page, testInfo, 'review-slide');
    await page.getByRole('radio', { name: 'Overlay', exact: true }).click();
    await page.keyboard.down('b');
    await expect(canvas.getByText('Showing Baseline')).toBeVisible();
    await page.keyboard.up('b');
    await expect(canvas.getByText('Showing Baseline')).not.toBeVisible();
  });

  test('approve and reject persist to disk and advance through only unreviewed captures', async ({
    page,
  }) => {
    await openReview(page);
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${checkoutId}$`));
    let report = await server.readReport();
    expect(report.comparisons.find(item => item.id === pricingId).status).toBe(
      'passed'
    );
    let baseline = report.comparisons.find(
      item => item.id === pricingId
    ).baseline;
    let saved = await readFile(
      join(server.workingDir, '.vizzly', baseline.replace('/images/', ''))
    );
    let current = report.comparisons.find(
      item => item.id === pricingId
    ).current;
    expect(
      saved.equals(
        await readFile(
          join(server.workingDir, '.vizzly', current.replace('/images/', ''))
        )
      )
    ).toBe(true);
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${newId}$`));
    report = await server.readReport();
    expect(report.comparisons.find(item => item.id === checkoutId).status).toBe(
      'rejected'
    );
    // A new browser session sees the persisted rejection, independent of optimistic state.
    await page.reload();
    let queue = await openQueue(page);
    await queue.getByRole('button', { name: 'All', exact: true }).click();
    await queue.getByRole('button', { name: /checkout-form/ }).click();
    if (page.viewportSize().width < 640)
      await page
        .getByRole('button', { name: 'Close sidebar', exact: true })
        .click();
    await expect(
      page.getByRole('button', { name: 'Rejected', exact: true })
    ).toBeVisible();
  });

  test('a completed save preserves manual navigation made while it was pending', async ({
    page,
  }) => {
    await openReview(page);
    let releaseResponse;
    let responseReady;
    let held = new Promise(resolve => {
      releaseResponse = resolve;
    });
    let ready = new Promise(resolve => {
      responseReady = resolve;
    });
    // Hold delivery of the real server response, without changing its result.
    await page.route('**/api/baseline/accept', async route => {
      let response = await route.fetch();
      responseReady();
      await held;
      await route.fulfill({ response });
    });
    try {
      await page.getByRole('button', { name: 'Approve', exact: true }).click();
      await ready;
      let queue = await openQueue(page);
      await queue.getByRole('button', { name: /dashboard-widget/ }).click();
      await expect(page).toHaveURL(new RegExp(`${newId}$`));
      await page
        .getByRole('button', { name: 'Close sidebar', exact: true })
        .click();
      releaseResponse();
      await expect(
        page.getByRole('button', { name: 'Approve', exact: true })
      ).toBeEnabled();
      await expect(page).toHaveURL(new RegExp(`${newId}$`));
    } finally {
      releaseResponse();
    }
  });

  test('failed approval keeps the current capture open and offers a retry', async ({
    page,
  }) => {
    await openReview(page);
    let comparison = server.data.comparisons.find(
      item => item.id === pricingId
    );
    let path = join(
      server.workingDir,
      '.vizzly',
      comparison.current.replace('/images/', '')
    );
    let contents = await readFile(path);
    await rm(path);
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Could not save your review'
    );
    await expect(page).toHaveURL(new RegExp(`${pricingId}$`));
    await expect(
      page.getByRole('button', { name: 'Approve', exact: true })
    ).toBeEnabled();
    await writeFile(path, contents);
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${checkoutId}$`));
  });

  test('change overview jumps to offscreen differences and details can show regions', async ({
    page,
  }, testInfo) => {
    await openReview(page);
    let overview = page.getByRole('navigation', {
      name: 'Changes overview',
      exact: true,
    });
    await expect(overview).toBeVisible();
    await overview.getByRole('button', { name: /Rows 2,800/ }).click();
    await expect(
      page.getByRole('status').filter({ hasText: /Rows 2,800/ })
    ).toBeInViewport();
    await expect(page.getByTestId('screenshot-canvas')).not.toHaveJSProperty(
      'scrollTop',
      0
    );
    await capture(page, testInfo, 'review-change-navigation');
    await openQueue(page);
    await page.getByRole('tab', { name: 'Details', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Show changed regions' }).check();
    await expect(
      page.getByRole('img', { name: 'Review regions', exact: true })
    ).toBeAttached();
    await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .click();
    await capture(page, testInfo, 'review-change-regions');
  });

  test('keyboard decisions finish the queue and focused controls keep their Space behavior', async ({
    page,
  }) => {
    await openReview(page);
    let queue = await openQueue(page);
    await page.getByRole('tab', { name: 'Queue', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByRole('tab', { name: 'Details', exact: true })
    ).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(
      page.getByRole('tab', { name: 'Queue', exact: true })
    ).toBeFocused();
    await queue
      .getByRole('button', { name: 'checkout-form', exact: true })
      .focus();
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(new RegExp(`${checkoutId}$`));
    await expect(
      page.getByText('Review Mode', { exact: true })
    ).not.toBeVisible();
    await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .click();
    await page.getByRole('heading', { level: 1 }).click();
    await page.keyboard.press('Space');
    await page.keyboard.press('r');
    await expect(page).toHaveURL(new RegExp(`${newId}$`));
    await page.keyboard.press('a');
    await expect(page).toHaveURL(/pricing-page-chromium-1920x1080$/);
    await page.keyboard.press('a');
    await expect(page).toHaveURL(new RegExp(`${pricingId}$`));
    await page.keyboard.press('a');
    await expect(page).toHaveURL(`${server.url}/`);
    expect(
      (await server.readReport()).comparisons.every(item =>
        ['passed', 'rejected'].includes(item.status)
      )
    ).toBe(true);
  });

  test('missing baseline images explain how to inspect the current capture', async ({
    page,
  }) => {
    let comparison = server.data.comparisons.find(
      item => item.id === pricingId
    );
    await rm(
      join(
        server.workingDir,
        '.vizzly',
        comparison.baseline.replace('/images/', '')
      )
    );
    await openReview(page);
    await page.getByRole('radio', { name: 'Toggle', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Baseline image unavailable'
    );
    await page.getByRole('radio', { name: 'Overlay', exact: true }).click();
    await expect(page.getByRole('alert')).not.toBeVisible();
    await expect(
      page
        .getByTestId('screenshot-canvas')
        .getByRole('img', { name: 'pricing-page', exact: true })
    ).toBeVisible();
  });

  test('deletion still closes after SSE removes the capture before the response arrives', async ({
    page,
  }) => {
    await openReview(page, newId);
    let releaseResponse;
    let held = new Promise(resolve => {
      releaseResponse = resolve;
    });
    await page.route('**/api/baseline/delete', async route => {
      let response = await route.fetch();
      await held;
      await route.fulfill({ response });
    });
    try {
      await page
        .getByRole('button', { name: 'Delete screenshot', exact: true })
        .click();
      await expect(
        page.getByText('Comparison not found', { exact: true })
      ).toBeVisible();
      releaseResponse();
      await expect(page).toHaveURL(`${server.url}/`);
    } finally {
      releaseResponse();
    }
  });

  test('delete removes a new capture and returns to the list', async ({
    page,
  }) => {
    await openReview(page, newId);
    await page
      .getByRole('button', { name: 'Delete screenshot', exact: true })
      .click();
    await expect(page).toHaveURL(`${server.url}/`);
    expect(
      (await server.readReport()).comparisons.some(item => item.id === newId)
    ).toBe(false);
  });
});
