import { test as base, expect } from '@playwright/test';
import { startCloudApi } from './cloud-api.js';
import { installFontFixture } from './fonts.js';
import { comparisonIds, reportFixture } from './report-data.js';
import { startRealReporter } from './reporter-server.js';
import {
  captureReporter,
  waitForFullscreenViewerReady,
} from './screenshots.js';

export { expect };
export let test = base.extend({
  reportData: [reportFixture(), { option: true }],
  signedIn: [false, { option: true }],
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(new Date('2026-10-25T12:00:00Z'));
    await installFontFixture(page);
    await use(page);
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixture argument.
  cloud: async ({}, use) => {
    let cloud = await startCloudApi();
    try {
      await use(cloud);
    } finally {
      await cloud.stop();
    }
  },
  reporter: async ({ reportData, signedIn, cloud }, use) => {
    let reporter = await startRealReporter(reportData, {
      apiUrl: cloud.url,
      signedIn,
    });
    try {
      await use(reporter);
    } finally {
      cloud.releasePending();
      await reporter.stop();
    }
  },
  capture: async ({ page, browserName }, use, testInfo) => {
    await use(name => captureReporter(page, browserName, testInfo, name));
  },
  openLogin: async ({ page, reporter }, use) => {
    await use(async () => {
      await page.goto(`${reporter.url}/builds`);
      await expect(
        page.getByRole('button', { name: 'Sign In', exact: true })
      ).toBeVisible();
    });
  },
  openReview: async ({ page, reporter }, use) => {
    await use(async (id = comparisonIds.pricing) => {
      await page.goto(`${reporter.url}/comparison/${id}`);
      await waitForFullscreenViewerReady(page);
    });
  },
  openQueue: async ({ page }, use) => {
    await use(async () => {
      if (page.viewportSize().width < 640) {
        await page.getByRole('button', { name: 'Queue', exact: true }).click();
      }
      return page.getByRole('tabpanel', { name: 'Queue', exact: true });
    });
  },
});
