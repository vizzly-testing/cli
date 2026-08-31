import packageJson from '../package.json' with { type: 'json' };
import { run } from './index.js';

function parsePositiveInteger(value) {
  let parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Expected a positive integer');
  }
  return parsed;
}

export default {
  name: 'swift-previews',
  version: packageJson.version,
  configSchema: {
    swiftPreviews: {
      captureTimeout: 30_000,
      configuration: 'Debug',
      output: '.vizzly/previews',
      upload: true,
    },
  },

  register(program, context) {
    program
      .command('previews [container]')
      .description(
        'Render screenshots from stock SwiftUI #Preview declarations'
      )
      .option(
        '--scheme <scheme>',
        'Xcode scheme (auto-detected when exactly one is available)'
      )
      .option(
        '--device <udid>',
        'Simulator UDID (auto-detected when exactly one iOS Simulator is booted)'
      )
      .option('--configuration <name>', 'Build configuration')
      .option(
        '--capture-timeout <ms>',
        'Maximum time to render each preview',
        parsePositiveInteger
      )
      .option('--output <path>', 'Screenshot output directory')
      .option(
        '--no-upload',
        'Capture local PNGs without sending them to Vizzly'
      )
      .option('--json', 'Print the capture manifest as JSON')
      .action(async (container = '.', options) => {
        let mergedOptions = { ...program.opts(), ...options };
        await run(container, mergedOptions, context);
      });
  },
};
