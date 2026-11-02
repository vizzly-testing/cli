import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import {
  setPage,
  startScreenshotServer,
  stopScreenshotServer,
} from '../../src/launcher/screenshot-server.js';

// Vizzly is the external upload boundary; capture uses a real browser and HTTP.
test('captures completed animations for element and page screenshots', async t => {
  let forwarded = [];
  let vizzly = createServer(async (req, res) => {
    let chunks = [];
    for await (let chunk of req) chunks.push(chunk);
    forwarded.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'passed' }));
  });
  vizzly.listen(0, '127.0.0.1');
  await once(vizzly, 'listening');
  t.after(() => new Promise(resolve => vizzly.close(resolve)));

  let originalUrl = process.env.VIZZLY_SERVER_URL;
  process.env.VIZZLY_SERVER_URL = `http://127.0.0.1:${vizzly.address().port}`;
  t.after(() => {
    if (originalUrl === undefined) delete process.env.VIZZLY_SERVER_URL;
    else process.env.VIZZLY_SERVER_URL = originalUrl;
    setPage(null);
  });

  let browser = await chromium.launch();
  t.after(() => browser.close());
  let page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  setPage(page);
  let server = await startScreenshotServer();
  t.after(() => stopScreenshotServer(server));

  for (let selector of ['#ember-testing', null]) {
    await page.setContent(`
      <style>
        body { margin: 0; }
        #ember-testing { width: 320px; height: 240px; background: white; }
        .modal {
          width: 200px; height: 100px; background: blue;
          animation: enter 60s linear forwards;
        }
        @keyframes enter {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
      </style>
      <div id="ember-testing"><div class="modal"></div></div>
    `);
    // Pin the animation to its starting frame without waiting on wall time.
    await page.evaluate(() => {
      let animation = document.querySelector('.modal').getAnimations()[0];
      animation.pause();
      animation.currentTime = 0;
    });

    let response = await fetch(`http://127.0.0.1:${server.port}/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'animated-modal', selector }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'passed');
    let actual = Buffer.from(forwarded.at(-1).image, 'base64');

    // The screenshot must show the final modal, even when capture starts early.
    await page.locator('.modal').evaluate(element => {
      element.style.animation = 'none';
    });
    let expected = selector
      ? await page.locator(selector).screenshot()
      : await page.screenshot();
    assert.deepEqual(
      actual,
      expected,
      `${selector || 'page'} shows final state`
    );
  }
  assert.equal(forwarded.length, 2);
});
