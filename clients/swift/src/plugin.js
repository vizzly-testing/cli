import packageJson from '../package.json' with { type: 'json' };
import { run } from './index.js';

export default {
  name: 'swift-previews',
  version: packageJson.version,
  configSchema: {
    swiftPreviews: {
      configuration: 'Debug',
      output: '.vizzly/previews',
    },
  },

  register(program, context) {
    program
      .command('previews [container]')
      .description(
        'Render screenshots from stock SwiftUI #Preview declarations'
      )
      .option('--scheme <scheme>', 'Xcode scheme to build')
      .option(
        '--device <udid>',
        'Simulator UDID (auto-detected when exactly one iOS Simulator is booted)'
      )
      .option('--configuration <name>', 'Build configuration', 'Debug')
      .option('--output <path>', 'Screenshot output directory')
      .option('--json', 'Print the capture manifest as JSON')
      .action(async (container = '.', options) => {
        let globalOptions = program.opts();
        await run(container, { ...globalOptions, ...options }, context);
      });
  },
};
