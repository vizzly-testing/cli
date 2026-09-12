import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertCompleteCapture, resolvePreviewOptions } from '../src/index.js';

describe('Swift preview CLI options', () => {
  it('uses configured defaults when command options are omitted', () => {
    assert.deepEqual(
      resolvePreviewOptions(
        {},
        {
          captureTimeout: 45_000,
          configuration: 'Release',
          device: 'CONFIGURED-DEVICE',
          include: 'Race cockpit*',
          output: 'configured-output',
          scheme: 'ConfiguredScheme',
          upload: false,
        }
      ),
      {
        captureTimeout: 45_000,
        configuration: 'Release',
        device: 'CONFIGURED-DEVICE',
        include: 'Race cockpit*',
        outputPath: 'configured-output',
        scheme: 'ConfiguredScheme',
        upload: false,
      }
    );
  });

  it('lets command options override configuration', () => {
    let resolved = resolvePreviewOptions(
      {
        captureTimeout: 5_000,
        configuration: 'Debug',
        include: 'Track · event',
        output: 'command-output',
      },
      {
        captureTimeout: 45_000,
        configuration: 'Release',
        output: 'configured-output',
      }
    );

    assert.equal(resolved.captureTimeout, 5_000);
    assert.equal(resolved.configuration, 'Debug');
    assert.equal(resolved.include, 'Track · event');
    assert.equal(resolved.outputPath, 'command-output');
    assert.equal(resolved.upload, true);
  });
});

describe('Swift preview capture completion', () => {
  it('accepts a complete preview set', () => {
    assert.doesNotThrow(() =>
      assertCompleteCapture({ failures: [], previews: [{}] })
    );
  });

  it('fails after preserving the manifest for incomplete preview sets', () => {
    assert.throws(
      () =>
        assertCompleteCapture({
          failures: [{ name: 'Broken preview' }],
          outputPath: '/tmp/previews',
          previews: [{ name: 'Working preview' }],
        }),
      error =>
        error.message.includes('1 of 2 SwiftUI previews failed') &&
        error.message.includes('/tmp/previews/manifest.json')
    );
  });
});
