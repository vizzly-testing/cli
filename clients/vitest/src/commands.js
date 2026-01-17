/**
 * Custom Vitest browser commands for E2E testing
 *
 * These commands provide access to external content for testing
 * while working within Vitest's iframe-based test harness.
 */

/**
 * Load external page content into the test frame
 * Fetches HTML from URL and injects it into the current document
 *
 * @type {import('vitest/node').BrowserCommand<[url: string]>}
 */
export async function loadPage(ctx, url) {
  if (ctx.provider.name !== 'playwright') {
    throw new Error('loadPage command only supports Playwright provider');
  }

  let frame = await ctx.frame();

  // Fetch the HTML content
  let response = await fetch(url);
  let html = await response.text();

  // Inject the HTML content into the frame
  await frame.setContent(html, {
    waitUntil: 'networkidle',
  });
}

/**
 * Wait for network to be idle
 *
 * @type {import('vitest/node').BrowserCommand<[options?: { timeout?: number }]>}
 */
export async function waitForNetworkIdle(ctx, options = {}) {
  if (ctx.provider.name !== 'playwright') {
    throw new Error('waitForNetworkIdle command only supports Playwright provider');
  }

  let frame = await ctx.frame();
  await frame.waitForLoadState('networkidle', {
    timeout: options.timeout || 30000,
  });
}
