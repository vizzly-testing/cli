import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { vizzlyScreenshot } from '../client/index.js';

let directory = process.argv[2];
for (let entry of await readdir(directory, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(png|jpe?g|webp)$/i.test(entry.name)) continue;
  let name = entry.name.replace(/\.[^.]+$/, '');
  let receipt = await vizzlyScreenshot(name, path.join(directory, entry.name));
  if (!receipt) throw new Error(`Could not capture ${entry.name}.`);
}
