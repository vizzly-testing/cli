import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateBaselineFilename,
  generateScreenshotSignature,
} from '../../../src/domains/screenshots/screenshot-identity.js';

let fixtures = fileURLToPath(new URL('../fixtures', import.meta.url));

export async function writeReporterFixture(fixtureData, workingDir) {
  let data = structuredClone(fixtureData);
  let stateDir = join(workingDir, '.vizzly');
  let details = {};
  for (let folder of ['baselines', 'current', 'diffs']) {
    await mkdir(join(stateDir, folder), { recursive: true });
  }
  for (let comparison of data.comparisons) {
    comparison.name = comparison.originalName || comparison.name;
    comparison.signature = generateScreenshotSignature(
      comparison.name,
      comparison.properties
    );
    let filename = generateBaselineFilename(
      comparison.name,
      comparison.signature
    );
    for (let [field, folder] of [
      ['current', 'current'],
      ['baseline', 'baselines'],
      ['diff', 'diffs'],
    ]) {
      if (!comparison[field]) continue;
      await copyFile(
        join(fixtures, comparison[field].replace(/^\//, '')),
        join(stateDir, folder, filename)
      );
      comparison[field] = `/images/${folder}/${filename}`;
    }
    if (comparison.diffClusters) {
      details[comparison.id] = { diffClusters: comparison.diffClusters };
      delete comparison.diffClusters;
    }
  }
  await writeFile(
    join(stateDir, 'comparison-details.json'),
    JSON.stringify(details)
  );
  await writeFile(join(stateDir, 'report-data.json'), JSON.stringify(data));
  return data;
}
