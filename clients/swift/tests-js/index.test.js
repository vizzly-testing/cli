import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolvePreviewOptions } from '../src/index.js';

describe('Swift preview CLI options', () => {
  it('uses configured defaults when command options are omitted', () => {
    assert.deepEqual(
      resolvePreviewOptions(
        {},
        {
          captureTimeout: 45_000,
          configuration: 'Release',
          device: 'CONFIGURED-DEVICE',
          output: 'configured-output',
          scheme: 'ConfiguredScheme',
          upload: false,
        }
      ),
      {
        captureTimeout: 45_000,
        configuration: 'Release',
        device: 'CONFIGURED-DEVICE',
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
    assert.equal(resolved.outputPath, 'command-output');
    assert.equal(resolved.upload, true);
  });
});
