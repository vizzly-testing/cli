import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseRegistryTypes,
  parseRuntimeEvents,
  readPngMetadata,
} from '../src/preview-runner.js';

describe('Swift preview runner contracts', () => {
  it('discovers generated stock #Preview registry types from Mach-O symbols', () => {
    let output = [
      '_$s13PreviewFixture0017PreviewFixtureswift_tAFJhfMX1_0_15RegistryfMu_VMn',
      '_main',
      '_$s13PreviewFixture0017PreviewFixtureswift_tAFJhfMX1_0_15RegistryfMu_VMn',
      '_$s13PreviewFixture0017PreviewFixtureswift_tAFJhfMX2_0_15RegistryfMu_VMn',
    ].join('\n');

    assert.deepEqual(parseRegistryTypes(output), [
      '13PreviewFixture0017PreviewFixtureswift_tAFJhfMX1_0_15RegistryfMu_V',
      '13PreviewFixture0017PreviewFixtureswift_tAFJhfMX2_0_15RegistryfMu_V',
    ]);
  });

  it('ignores app logs and reads versioned runtime completion events', () => {
    let output = [
      'ordinary app log',
      'VIZZLY_PREVIEW_EVENT {"protocolVersion":1,"type":"preview-resolved","name":"Card"}',
      'VIZZLY_PREVIEW_EVENT {"protocolVersion":1,"type":"capture-complete","filename":"vizzly-preview.png"}',
    ].join('\n');

    assert.deepEqual(
      parseRuntimeEvents(output).map(event => event.type),
      ['preview-resolved', 'capture-complete']
    );
  });

  it('validates observable PNG dimensions and content hash', () => {
    let png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.writeUInt32BE(393, 16);
    png.writeUInt32BE(852, 20);

    let metadata = readPngMetadata(png);
    assert.equal(metadata.width, 393);
    assert.equal(metadata.height, 852);
    assert.match(metadata.sha256, /^[a-f0-9]{64}$/);
  });

  it('rejects a non-PNG capture', () => {
    assert.throws(() => readPngMetadata(Buffer.from('not a png')), /valid PNG/);
  });
});
