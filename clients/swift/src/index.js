import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { runPreviewCapture } from './preview-runner.js';
import {
  buildCloudRunOptions,
  findLocalTddServer,
  hasApiToken,
  uploadCapturedPreviews,
} from './upload.js';

export function resolvePreviewOptions(options, config) {
  return {
    captureTimeout: options.captureTimeout ?? config.captureTimeout ?? 30_000,
    configuration: options.configuration ?? config.configuration ?? 'Debug',
    device: options.device ?? config.device,
    outputPath: options.output ?? config.output ?? '.vizzly/previews',
    scheme: options.scheme ?? config.scheme,
    upload: options.upload ?? config.upload ?? true,
  };
}

async function saveManifest(manifest) {
  await writeFile(
    join(manifest.outputPath, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

function requireCloudServices(services) {
  let requiredMethods = [
    services?.git?.detect,
    services?.screenshots?.createClient,
    services?.testRunner?.once,
    services?.testRunner?.createBuild,
    services?.testRunner?.finalizeBuild,
    services?.serverManager?.start,
    services?.serverManager?.stop,
  ];

  if (requiredMethods.some(method => typeof method !== 'function')) {
    throw new Error(
      'Cloud preview uploads require a current @vizzly-testing/cli installation'
    );
  }
}

export async function run(container, options = {}, context = {}) {
  let previewOptions = resolvePreviewOptions(
    options,
    context.config?.swiftPreviews ?? {}
  );

  let output = context.output ?? {
    info: message => process.stderr.write(`${message}\n`),
    warn: message => process.stderr.write(`${message}\n`),
  };
  let services = context.services;
  let vizzlyConfig = context.config ?? {};
  let serverManager = null;
  let testRunner = null;
  let buildId = null;
  let buildUrl = null;
  let finalizationAttempted = false;
  let startTime = Date.now();

  try {
    output.info(
      'Preparing to build the iOS app and discover stock #Preview declarations'
    );
    let manifest = await runPreviewCapture({
      container,
      ...previewOptions,
      onProgress: message => output.info(message),
    });
    let upload;

    if (!previewOptions.upload) {
      upload = { mode: 'disabled', uploaded: 0 };
      output.info('Kept preview screenshots local because upload is disabled');
    } else {
      let tddServerUrl = await findLocalTddServer([
        process.cwd(),
        dirname(manifest.container),
      ]);

      if (tddServerUrl) {
        output.info('Using the active local Vizzly TDD server');
        let result = await uploadCapturedPreviews({
          comparison: vizzlyConfig.comparison,
          manifest,
          screenshots: services?.screenshots,
          serverUrl: tddServerUrl,
        });
        upload = {
          mode: 'tdd',
          serverUrl: tddServerUrl,
          uploaded: result.uploaded,
        };
      } else if (hasApiToken(vizzlyConfig)) {
        requireCloudServices(services);
        output.info('Creating a Vizzly cloud build');
        testRunner = services.testRunner;
        serverManager = services.serverManager;
        testRunner.once('build-created', build => {
          buildUrl = build.url ?? null;
        });
        let gitInfo = await services.git.detect({
          buildPrefix: 'SwiftUI Previews',
        });
        let runOptions = buildCloudRunOptions(vizzlyConfig, gitInfo);
        buildId = await testRunner.createBuild(runOptions, false);
        if (!buildId) {
          throw new Error('Vizzly did not create a cloud build');
        }
        await serverManager.start(buildId, false, false);
        let result = await uploadCapturedPreviews({
          buildId,
          comparison: vizzlyConfig.comparison,
          manifest,
          screenshots: services.screenshots,
          serverUrl: `http://localhost:${runOptions.port}`,
        });
        finalizationAttempted = true;
        await testRunner.finalizeBuild(
          buildId,
          false,
          true,
          Date.now() - startTime
        );
        upload = {
          buildId,
          buildUrl,
          mode: 'cloud',
          uploaded: result.uploaded,
        };
      } else {
        upload = {
          mode: 'local-only',
          reason: 'No active TDD server or VIZZLY_TOKEN was found',
          uploaded: 0,
        };
        output.warn(
          'No active TDD server or API token found; kept preview screenshots local'
        );
        output.info('Run `vizzly tdd start` or set VIZZLY_TOKEN to upload');
      }
    }

    manifest = { ...manifest, upload };
    await saveManifest(manifest);

    if (options.json) {
      process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    } else {
      output.info(
        `Captured ${manifest.previews.length} SwiftUI previews in ${manifest.outputPath}`
      );
      if (upload.mode === 'tdd') {
        output.info(`Sent ${upload.uploaded} previews to local Vizzly TDD`);
      }
      if (upload.mode === 'cloud') {
        output.info(`Uploaded ${upload.uploaded} previews to Vizzly`);
        if (upload.buildUrl) {
          output.info(`View results: ${upload.buildUrl}`);
        }
      }
    }

    return manifest;
  } catch (error) {
    if (testRunner && buildId && !finalizationAttempted) {
      finalizationAttempted = true;
      try {
        await testRunner.finalizeBuild(
          buildId,
          false,
          false,
          Date.now() - startTime
        );
      } catch {
        // Preserve the capture or upload error that caused the failed build.
      }
    }
    throw error;
  } finally {
    if (serverManager) {
      try {
        await serverManager.stop();
      } catch {
        // The build result is more useful than a cleanup-only failure.
      }
    }
  }
}

export { run as default, runPreviewCapture };
