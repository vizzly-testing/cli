import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { vizzlyScreenshot } from '../../src/client/index.js';

let mode = process.argv[2];
let png = await readFile(
  new URL(
    '../reporter/fixtures/images/screenshots/pricing-page.png',
    import.meta.url
  )
);

if (mode === 'report-failure') {
  await mkdir('.vizzly', { recursive: true });
  await writeFile(path.join('.vizzly', 'report'), 'Blocks report directory');
}

if (['valid', 'mixed', 'report-failure', 'valid-fail'].includes(mode)) {
  let receipt = await vizzlyScreenshot('first-capture', png);
  if (!receipt) throw new Error('Screenshot capture failed');
}

// Small, fully encoded PNGs make a deterministic visible change on repeat.
if (mode === 'red' || mode === 'blue') {
  let encoded =
    mode === 'red'
      ? 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGP4z8DwHx9mGBkKAMLXf4EvceABAAAAAElFTkSuQmCC'
      : 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEUlEQVR4nGNgYPj/Hz8eEQoAQ1d/gZtbdTsAAAAASUVORK5CYII=';
  let receipt = await vizzlyScreenshot(
    'first-capture',
    Buffer.from(encoded, 'base64')
  );
  if (!receipt) throw new Error('Screenshot capture failed');
}

if (mode === 'invalid') {
  await vizzlyScreenshot('broken-capture', Buffer.from('invalid-png'));
}
if (mode === 'invalid-replace') {
  await vizzlyScreenshot('first-capture', Buffer.from('invalid-png'));
}

if (mode === 'mixed' || mode === 'missing') {
  await vizzlyScreenshot('missing-file', path.resolve('does-not-exist.png'));
}

if (mode === 'fail' || mode === 'valid-fail') process.exitCode = 1;
