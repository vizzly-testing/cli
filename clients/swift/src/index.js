import { runPreviewCapture } from './preview-runner.js';

export async function run(container, options = {}, context = {}) {
  let config = context.config?.swiftPreviews ?? {};
  let scheme = options.scheme ?? config.scheme;
  let device = options.device ?? config.device;
  let outputPath = options.output ?? config.output ?? '.vizzly/previews';

  if (!scheme) {
    throw new Error('Swift preview capture requires --scheme <scheme>');
  }

  if (!device) {
    throw new Error('Swift preview capture requires --device <simulator-udid>');
  }

  let output = context.output ?? {
    info: message => process.stdout.write(`${message}\n`),
  };

  output.info(
    'Building the iOS app and discovering stock #Preview declarations'
  );
  let manifest = await runPreviewCapture({
    container,
    scheme,
    device,
    configuration: options.configuration ?? config.configuration ?? 'Debug',
    outputPath,
    onProgress: message => output.info(message),
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } else {
    output.info(
      `Captured ${manifest.previews.length} SwiftUI previews in ${manifest.outputPath}`
    );
  }

  return manifest;
}

export { runPreviewCapture } from './preview-runner.js';
export { run as default };
