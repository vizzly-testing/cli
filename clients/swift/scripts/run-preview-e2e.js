import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runPreviewCapture } from '../src/preview-runner.js';

let device = process.env.VIZZLY_SIMULATOR_UDID;
if (!device) {
  throw new Error(
    'Set VIZZLY_SIMULATOR_UDID to an already-booted iOS Simulator UDID'
  );
}

let outputPath = await mkdtemp(join(tmpdir(), 'vizzly-preview-e2e-'));

try {
  let manifest = await runPreviewCapture({
    container: resolve(
      import.meta.dirname,
      '..',
      'Fixtures',
      'PreviewFixture',
      'PreviewFixture.xcodeproj'
    ),
    scheme: 'PreviewFixture',
    device,
    configuration: 'Debug',
    outputPath,
    onProgress: message => process.stdout.write(`${message}\n`),
  });

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

  process.stdout.write(
    `Verified ${manifest.previews.length} stock #Preview screenshots\n`
  );
} finally {
  await rm(outputPath, { recursive: true, force: true });
}
