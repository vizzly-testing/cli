import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  applicationBinaryCandidates,
  parseBootedIOSSimulators,
  parseRegistryTypes,
  parseRuntimeEvents,
  parseSchemes,
  readPngMetadata,
  runtimeDeploymentTarget,
  selectBootedIOSSimulator,
  selectScheme,
} from '../src/preview-runner.js';

let simulatorList = JSON.stringify({
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-26-5': [
      {
        isAvailable: true,
        name: 'iPhone 17 Pro',
        state: 'Booted',
        udid: 'PHONE-17-PRO',
      },
    ],
    'com.apple.CoreSimulator.SimRuntime.tvOS-26-5': [
      {
        isAvailable: true,
        name: 'Apple TV 4K',
        state: 'Booted',
        udid: 'APPLE-TV',
      },
    ],
    'com.apple.CoreSimulator.SimRuntime.iOS-18-5': [
      {
        isAvailable: true,
        name: 'iPhone 16',
        state: 'Shutdown',
        udid: 'SHUTDOWN-PHONE',
      },
      {
        isAvailable: false,
        name: 'Unavailable iPhone',
        state: 'Booted',
        udid: 'UNAVAILABLE-PHONE',
      },
    ],
  },
});

describe('Swift preview runner contracts', () => {
  it('auto-selects the only shared Xcode scheme', () => {
    let schemes = parseSchemes(
      JSON.stringify({ project: { schemes: ['PreviewFixture'] } })
    );

    assert.deepEqual(selectScheme(schemes), {
      name: 'PreviewFixture',
      selection: 'automatic',
    });
  });

  it('requires an explicit scheme when an Xcode container has several', () => {
    assert.throws(
      () => selectScheme(['App', 'AppTests']),
      /More than one Xcode scheme is available.*--scheme <scheme>/s
    );
    assert.throws(
      () => selectScheme(['App'], 'Missing'),
      /Missing is not an available Xcode scheme/
    );
  });

  it('finds only available, booted iOS Simulators', () => {
    assert.deepEqual(parseBootedIOSSimulators(simulatorList), [
      {
        name: 'iPhone 17 Pro',
        runtime: 'iOS 26.5',
        udid: 'PHONE-17-PRO',
      },
    ]);
  });

  it('auto-selects the only booted iOS Simulator', () => {
    assert.deepEqual(
      selectBootedIOSSimulator(parseBootedIOSSimulators(simulatorList)),
      {
        name: 'iPhone 17 Pro',
        runtime: 'iOS 26.5',
        selection: 'automatic',
        udid: 'PHONE-17-PRO',
      }
    );
  });

  it('requires an explicit choice when multiple iOS Simulators are booted', () => {
    let simulators = [
      {
        name: 'iPhone 17 Pro',
        runtime: 'iOS 26.5',
        udid: 'PHONE-17-PRO',
      },
      {
        name: 'iPad Pro 13-inch',
        runtime: 'iOS 26.5',
        udid: 'IPAD-PRO',
      },
    ];

    assert.throws(
      () => selectBootedIOSSimulator(simulators),
      error =>
        error.message.includes('More than one iOS Simulator is booted') &&
        error.message.includes('iPad Pro 13-inch (iOS 26.5, IPAD-PRO)') &&
        error.message.includes('Pass --device <udid> to choose one')
    );
  });

  it('explains how to recover when no iOS Simulator is booted', () => {
    assert.throws(
      () => selectBootedIOSSimulator([]),
      /No booted iOS Simulator was found.*Open Simulator or boot one from Xcode/
    );
  });

  it('honors an explicitly selected booted Simulator', () => {
    let simulators = parseBootedIOSSimulators(simulatorList);
    assert.equal(
      selectBootedIOSSimulator(simulators, 'PHONE-17-PRO').selection,
      'explicit'
    );
    assert.throws(
      () => selectBootedIOSSimulator(simulators, 'NOT-BOOTED'),
      /NOT-BOOTED is not a booted iOS Simulator/
    );
  });

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

  it('finds the built app executable with or without a debug dylib', () => {
    let appPath = '/tmp/Build/PreviewFixture.app';
    let settings = {
      EXECUTABLE_NAME: 'PreviewFixture',
      EXECUTABLE_PATH: 'PreviewFixture.app/PreviewFixture',
      PRODUCT_NAME: 'PreviewFixture',
      TARGET_BUILD_DIR: '/tmp/Build',
    };

    assert.deepEqual(applicationBinaryCandidates(appPath, settings), [
      join(appPath, 'PreviewFixture'),
      join(appPath, 'PreviewFixture.debug.dylib'),
    ]);
  });

  it('compiles the injected runtime for at least iOS 17', () => {
    assert.equal(runtimeDeploymentTarget('13.0'), '17.0');
    assert.equal(runtimeDeploymentTarget('17.0'), '17.0');
    assert.equal(runtimeDeploymentTarget('26.0'), '26.0');
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
    let png = Buffer.alloc(45);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.writeUInt32BE(13, 8);
    png.write('IHDR', 12, 'ascii');
    png.writeUInt32BE(393, 16);
    png.writeUInt32BE(852, 20);
    png.writeUInt32BE(0, 33);
    png.write('IEND', 37, 'ascii');

    let metadata = readPngMetadata(png);
    assert.equal(metadata.width, 393);
    assert.equal(metadata.height, 852);
    assert.match(metadata.sha256, /^[a-f0-9]{64}$/);
  });

  it('rejects a non-PNG capture', () => {
    assert.throws(() => readPngMetadata(Buffer.from('not a png')), /valid PNG/);
    let truncated = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.from([0, 0, 0, 13]),
      Buffer.from('IHDR'),
    ]);
    assert.throws(() => readPngMetadata(truncated), /valid PNG/);
  });
});
