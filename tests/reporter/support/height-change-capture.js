import { expect } from '@playwright/test';

// Produce two real PNGs with an insertion between matching rows, then send them
// through the same HTTP upload and native comparison path the SDK uses.
export async function compareHeightChange(
  browser,
  request,
  reporter,
  direction
) {
  let producer = await browser.newPage({
    viewport: { width: 320, height: 200 },
  });
  let capture = async inserted => {
    let colors = [
      '#dc2626',
      '#16a34a',
      '#2563eb',
      '#eab308',
      '#06b6d4',
      '#9333ea',
    ];
    let sections = colors
      .map(
        (color, index) =>
          `${inserted && index === 2 ? '<div style="height:120px;background:#f97316"></div>' : ''}<div style="height:100px;background:linear-gradient(${color},#111827)"></div>`
      )
      .join('');
    await producer.setContent(`<style>body{margin:0}</style>${sections}`);
    return producer.screenshot({ fullPage: true });
  };
  try {
    for (let inserted of direction === 'added'
      ? [false, true]
      : [true, false]) {
      let image = await capture(inserted);
      let response = await request.post(`${reporter.url}/screenshot`, {
        data: {
          name: 'height-change',
          type: 'base64',
          image: image.toString('base64'),
          properties: { browser: browser.browserType().name() },
        },
      });
      expect(response.ok(), await response.text()).toBe(true);
    }
    let response = await request.get(`${reporter.url}/api/report-data`);
    let report = await response.json();
    return report.comparisons.find(item => item.name === 'height-change');
  } finally {
    await producer.close();
  }
}
