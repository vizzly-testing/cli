import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import packageJson from '../package.json' with { type: 'json' };
import plugin from '../src/plugin.js';

describe('Swift preview plugin package', () => {
  it('publishes a CLI-discoverable native runtime', () => {
    assert.equal(packageJson.vizzlyPlugin, './src/plugin.js');
    assert.equal(plugin.version, packageJson.version);
    assert.ok(packageJson.files.includes('Sources/VizzlyPreviewRuntime'));
    assert.ok(packageJson.files.includes('Sources/CVizzlyPreviewRuntime'));
    assert.ok(!packageJson.files.includes('Package.swift'));
    assert.equal(
      packageJson.peerDependencies['@vizzly-testing/cli'],
      '>=0.35.3-beta.3'
    );
  });

  it('documents conservative capture defaults for vizzly init', () => {
    assert.deepEqual(plugin.configSchema.swiftPreviews, {
      captureTimeout: 30_000,
      configuration: 'Debug',
      device: null,
      output: '.vizzly/previews',
      scheme: null,
      upload: true,
    });
  });
});
