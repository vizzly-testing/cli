import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runPreviewCapture } from '../src/preview-runner.js';

let device = process.env.VIZZLY_SIMULATOR_UDID;
let outputPath = await mkdtemp(join(tmpdir(), 'vizzly-preview-e2e-'));

try {
  let capture = () =>
    runPreviewCapture({
      container: resolve(
        import.meta.dirname,
        '..',
        'Fixtures',
        'PreviewFixture',
        'PreviewFixture.xcodeproj'
      ),
      device,
      configuration: 'Debug',
      outputPath,
      onProgress: message => process.stdout.write(`${message}\n`),
    });
  let manifest = await capture();

  assert.deepEqual(manifest.previews.map(preview => preview.name).sort(), [
    'Card / Dark',
    'Stateful Counter',
  ]);
  assert.ok(
    manifest.previews.every(
      preview =>
        preview.width > 0 &&
        preview.height > 0 &&
        /^[a-f0-9]{64}$/.test(preview.sha256)
    )
  );
  assert.notEqual(manifest.previews[0].sha256, manifest.previews[1].sha256);

  let repeatedManifest = await capture();
  assert.deepEqual(
    repeatedManifest.previews.map(preview => preview.sha256),
    manifest.previews.map(preview => preview.sha256)
  );

  let missingPreviewPath = join(outputPath, repeatedManifest.previews[0].file);
  await writeFile(missingPreviewPath, 'changed outside Vizzly');
  await assert.rejects(capture, /output contains files not created by Vizzly/);
  await unlink(missingPreviewPath);
  await assert.rejects(capture, /output contains files not created by Vizzly/);
  assert.equal(
    JSON.parse(await readFile(join(outputPath, 'manifest.json'), 'utf8'))
      .previews.length,
    2
  );

  process.stdout.write(
    `Verified ${manifest.previews.length} repeatable stock #Preview screenshots through the linked runtime and safe output replacement\n`
  );
} finally {
  await rm(outputPath, { recursive: true, force: true });
}
