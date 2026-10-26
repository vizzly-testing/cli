import { expect } from '@playwright/test';
import { vizzlyScreenshot } from '../../../dist/client/index.js';

export async function waitForReporterImages(page, selector = 'body') {
  await page.locator(selector).evaluate(async root => {
    await document.fonts.ready;
    await Promise.all(
      [...root.querySelectorAll('img')].map(img => img.decode().catch(() => {}))
    );
    await new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
  });
}

export async function waitForFullscreenViewerReady(page) {
  await expect(page.getByTestId('fullscreen-viewer')).toBeVisible();
  await waitForReporterImages(page, '[data-testid="fullscreen-viewer"]');
}

export async function captureReporter(page, browserName, testInfo, name) {
  await waitForReporterImages(page);
  let path = testInfo.outputPath(`${name}.png`);
  let screenshot = await page.screenshot({
    path,
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
  });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  let result = await vizzlyScreenshot(name, screenshot, {
    properties: { browser: browserName, viewport: page.viewportSize() },
  });
  if (process.env.VIZZLY_SERVER_URL) {
    expect(result, `Vizzly should receive ${name}`).not.toBeNull();
  }
  return result;
}
