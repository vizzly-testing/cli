import { runPreviewCapture } from './preview-runner.js';

export function resolvePreviewOptions(options, config) {
  return {
    captureTimeout: options.captureTimeout ?? config.captureTimeout ?? 30_000,
    configuration: options.configuration ?? config.configuration ?? 'Debug',
    device: options.device ?? config.device,
    outputPath: options.output ?? config.output ?? '.vizzly/previews',
    scheme: options.scheme ?? config.scheme,
  };
}

export async function run(container, options = {}, context = {}) {
  let previewOptions = resolvePreviewOptions(
    options,
    context.config?.swiftPreviews ?? {}
  );

  let output = context.output ?? {
    info: message => process.stderr.write(`${message}\n`),
  };

  output.info(
    'Preparing to build the iOS app and discover stock #Preview declarations'
  );
  let manifest = await runPreviewCapture({
    container,
    ...previewOptions,
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

export { run as default, runPreviewCapture };
