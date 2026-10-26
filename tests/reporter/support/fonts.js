import { readFileSync } from 'node:fs';

let font = readFileSync(
  new URL('../fixtures/fonts/jetbrains-mono.ttf', import.meta.url)
).toString('base64');

export async function installFontFixture(page) {
  await page.route(
    url =>
      url.hostname === 'fonts.googleapis.com' &&
      url.searchParams.get('family')?.startsWith('JetBrains Mono:'),
    route =>
      route.fulfill({
        contentType: 'text/css',
        body: `@font-face {
          font-family: 'JetBrains Mono';
          font-style: normal;
          font-weight: 100 800;
          font-display: swap;
          src: url(data:font/ttf;base64,${font}) format('truetype');
        }`,
      })
  );
}
