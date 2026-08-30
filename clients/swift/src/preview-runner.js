import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';

let eventPrefix = 'VIZZLY_PREVIEW_EVENT ';
let minimumRuntimeDeploymentTarget = '17.0';
let supportedXcodeVersion = '26.6';

function invalidPng() {
  throw new Error('Preview capture did not produce a valid PNG');
}

export function parseRegistryTypes(output) {
  let registries = new Set();

  for (let line of output.split('\n')) {
    let match = line.trim().match(/^_\$s(.+fMu_V)Mn$/);
    if (match) {
      registries.add(match[1]);
    }
  }

  return [...registries].sort();
}

export function parseRuntimeEvents(output) {
  let events = [];

  for (let line of output.split('\n')) {
    if (!line.startsWith(eventPrefix)) {
      continue;
    }

    let event = JSON.parse(line.slice(eventPrefix.length));
    if (event.protocolVersion !== 1 || typeof event.type !== 'string') {
      throw new Error('The Swift preview runtime emitted an unsupported event');
    }
    events.push(event);
  }

  return events;
}

export function readPngMetadata(buffer) {
  let signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(signature)) {
    invalidPng();
  }

  let offset = 8;
  let width;
  let height;
  let foundEnd = false;
  while (offset + 12 <= buffer.length) {
    let length = buffer.readUInt32BE(offset);
    let type = buffer.toString('ascii', offset + 4, offset + 8);
    let nextOffset = offset + 12 + length;
    if (nextOffset > buffer.length) {
      invalidPng();
    }

    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) {
        invalidPng();
      }
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
    }

    if (type === 'IEND') {
      foundEnd = length === 0;
      break;
    }
    offset = nextOffset;
  }

  if (!foundEnd || !width || !height) {
    invalidPng();
  }

  return {
    width,
    height,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

export function parseSchemes(output) {
  let payload = JSON.parse(output);
  return [...(payload.project?.schemes ?? payload.workspace?.schemes ?? [])]
    .filter(scheme => typeof scheme === 'string' && scheme.length > 0)
    .sort();
}

export function selectScheme(schemes, requestedScheme) {
  if (requestedScheme) {
    if (!schemes.includes(requestedScheme)) {
      throw new Error(
        `${requestedScheme} is not an available Xcode scheme. ` +
          `Available schemes: ${schemes.join(', ') || 'none'}`
      );
    }
    return { name: requestedScheme, selection: 'explicit' };
  }

  if (schemes.length === 0) {
    throw new Error(
      'No shared Xcode schemes are available. Share a scheme in Xcode or ' +
        'pass --scheme <scheme>.'
    );
  }

  if (schemes.length > 1) {
    throw new Error(
      `More than one Xcode scheme is available: ${schemes.join(', ')}. ` +
        'Pass --scheme <scheme> to choose one.'
    );
  }

  return { name: schemes[0], selection: 'automatic' };
}

function displayRuntime(runtimeIdentifier) {
  let identifier = runtimeIdentifier.split('.').at(-1);
  return identifier.replace(/^iOS-/, 'iOS ').replaceAll('-', '.');
}

export function parseBootedIOSSimulators(output) {
  let payload = JSON.parse(output);
  let simulators = [];

  for (let [runtimeIdentifier, devices] of Object.entries(
    payload.devices ?? {}
  )) {
    if (!runtimeIdentifier.includes('.SimRuntime.iOS-')) {
      continue;
    }

    for (let device of devices) {
      if (device.state !== 'Booted' || device.isAvailable !== true) {
        continue;
      }

      simulators.push({
        name: device.name,
        runtime: displayRuntime(runtimeIdentifier),
        udid: device.udid,
      });
    }
  }

  return simulators.sort((left, right) =>
    `${left.name}\0${left.udid}`.localeCompare(`${right.name}\0${right.udid}`)
  );
}

function formatSimulator(simulator) {
  return `${simulator.name} (${simulator.runtime}, ${simulator.udid})`;
}

export function selectBootedIOSSimulator(simulators, requestedDevice) {
  if (requestedDevice) {
    let selected = simulators.find(
      simulator => simulator.udid === requestedDevice
    );
    if (!selected) {
      throw new Error(
        `${requestedDevice} is not a booted iOS Simulator. ` +
          'Boot it first or omit --device to auto-select.'
      );
    }
    return { ...selected, selection: 'explicit' };
  }

  if (simulators.length === 0) {
    throw new Error(
      'No booted iOS Simulator was found. ' +
        'Open Simulator or boot one from Xcode, then rerun the command.'
    );
  }

  if (simulators.length > 1) {
    let choices = simulators
      .map(simulator => `  - ${formatSimulator(simulator)}`)
      .join('\n');
    throw new Error(
      `More than one iOS Simulator is booted:\n${choices}\n` +
        'Pass --device <udid> to choose one.'
    );
  }

  return { ...simulators[0], selection: 'automatic' };
}

function runCommand(executable, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    let signal = options.timeoutMs
      ? AbortSignal.timeout(options.timeoutMs)
      : undefined;
    let child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      signal,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = [];
    let stderr = [];

    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.once('error', error => {
      if (error.name === 'AbortError') {
        rejectPromise(
          new Error(
            `${basename(executable)} timed out after ${options.timeoutMs}ms`
          )
        );
        return;
      }
      rejectPromise(error);
    });
    child.once('close', (exitCode, terminationSignal) => {
      let result = {
        exitCode,
        signal: terminationSignal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      };

      if (exitCode !== 0 && !options.allowFailure) {
        let detail = result.stderr.trim() || result.stdout.trim();
        rejectPromise(
          new Error(
            `${basename(executable)} failed with exit ${exitCode}${detail ? `: ${detail}` : ''}`
          )
        );
        return;
      }
      resolvePromise(result);
    });
  });
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveContainer(input) {
  let candidate = resolve(input);
  let extension = extname(candidate);
  if (extension === '.xcodeproj' || extension === '.xcworkspace') {
    return candidate;
  }

  let entries = await readdir(candidate, { withFileTypes: true });
  let containers = entries
    .filter(
      entry =>
        entry.isDirectory() &&
        (entry.name.endsWith('.xcworkspace') ||
          entry.name.endsWith('.xcodeproj'))
    )
    .map(entry => join(candidate, entry.name));

  let workspaces = containers.filter(path => path.endsWith('.xcworkspace'));
  let selected = workspaces.length === 1 ? workspaces : containers;
  if (selected.length !== 1) {
    throw new Error(
      `Expected exactly one Xcode project or workspace in ${candidate}`
    );
  }
  return selected[0];
}

function containerArguments(container) {
  return container.endsWith('.xcworkspace')
    ? ['-workspace', container]
    : ['-project', container];
}

async function resolveScheme(container, requestedScheme) {
  let result = await runCommand('xcodebuild', [
    ...containerArguments(container),
    '-list',
    '-json',
  ]);
  return selectScheme(parseSchemes(result.stdout), requestedScheme);
}

async function assertSupportedToolchain() {
  let result = await runCommand('xcodebuild', ['-version']);
  let match = result.stdout.match(/^Xcode (\S+)/m);
  if (!match || match[1] !== supportedXcodeVersion) {
    let detectedVersion = match?.[1] ?? 'unknown';
    throw new Error(
      `Unsupported preview ABI for Xcode ${detectedVersion}. ` +
        `This release supports Xcode ${supportedXcodeVersion}`
    );
  }
  return match[1];
}

async function resolveSimulator(requestedDevice) {
  let result = await runCommand('xcrun', [
    'simctl',
    'list',
    'devices',
    'booted',
    '--json',
  ]);
  let simulators = parseBootedIOSSimulators(result.stdout);
  return selectBootedIOSSimulator(simulators, requestedDevice);
}

async function validateOutputPath(outputPath) {
  if (!(await pathExists(outputPath))) {
    return;
  }

  let entries = await readdir(outputPath, { withFileTypes: true });
  if (entries.length === 0) {
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(join(outputPath, 'manifest.json'), 'utf8')
    );
  } catch {
    throw unmanagedOutputError(outputPath);
  }

  let previewFiles = manifest.previews?.map(preview => preview.file);
  if (
    manifest.protocolVersion !== 1 ||
    !Array.isArray(previewFiles) ||
    previewFiles.some(file => !file || basename(file) !== file)
  ) {
    throw unmanagedOutputError(outputPath);
  }

  let expectedEntries = new Set(['manifest.json', ...previewFiles]);
  if (
    entries.some(entry => !entry.isFile() || !expectedEntries.has(entry.name))
  ) {
    throw unmanagedOutputError(outputPath);
  }
}

function unmanagedOutputError(outputPath) {
  return new Error(
    `Preview output contains files not created by Vizzly: ${outputPath}`
  );
}

function selectionAction(selection) {
  return selection === 'automatic' ? 'Auto-selected' : 'Using';
}

async function replaceOutputDirectory(stagingPath, outputPath) {
  let hadPreviousOutput = await pathExists(outputPath);
  let backupPath = `${stagingPath}-previous`;
  if (hadPreviousOutput) {
    await rename(outputPath, backupPath);
  }

  try {
    await rename(stagingPath, outputPath);
  } catch (error) {
    if (hadPreviousOutput) {
      await rename(backupPath, outputPath);
    }
    throw error;
  }

  if (hadPreviousOutput) {
    await rm(backupPath, { recursive: true, force: true });
  }
}

function xcodeArguments({
  container,
  scheme,
  device,
  configuration,
  derivedDataPath,
}) {
  return [
    ...containerArguments(container),
    '-scheme',
    scheme,
    '-configuration',
    configuration,
    '-sdk',
    'iphonesimulator',
    '-destination',
    `id=${device}`,
    '-derivedDataPath',
    derivedDataPath,
    'ARCHS=arm64',
    'ONLY_ACTIVE_ARCH=YES',
  ];
}

async function buildApplication(options) {
  let args = xcodeArguments(options);
  await runCommand('xcodebuild', [...args, 'build']);
  let settingsResult = await runCommand('xcodebuild', [
    ...args,
    '-showBuildSettings',
    '-json',
  ]);
  let settingsGroups = JSON.parse(settingsResult.stdout);
  let group = settingsGroups.find(item =>
    item.buildSettings?.FULL_PRODUCT_NAME?.endsWith('.app')
  );
  if (!group) {
    throw new Error(`Scheme ${options.scheme} did not produce an iOS app`);
  }

  let settings = group.buildSettings;
  let appPath = join(settings.TARGET_BUILD_DIR, settings.FULL_PRODUCT_NAME);
  if (!(await pathExists(appPath))) {
    throw new Error(`Built app was not found at ${appPath}`);
  }

  return { appPath, settings };
}

export function applicationBinaryCandidates(appPath, settings) {
  let candidates = [];
  if (settings.EXECUTABLE_NAME) {
    candidates.push(join(appPath, settings.EXECUTABLE_NAME));
  }
  if (settings.TARGET_BUILD_DIR && settings.EXECUTABLE_PATH) {
    candidates.push(join(settings.TARGET_BUILD_DIR, settings.EXECUTABLE_PATH));
  }
  if (settings.PRODUCT_NAME) {
    candidates.push(join(appPath, `${settings.PRODUCT_NAME}.debug.dylib`));
  }
  return [...new Set(candidates)];
}

async function applicationBinaries(appPath, settings) {
  let candidates = applicationBinaryCandidates(appPath, settings);
  let entries = await readdir(appPath, { withFileTypes: true });
  for (let entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.dylib')) {
      candidates.push(join(appPath, entry.name));
    }
  }

  let binaries = [];
  for (let candidate of new Set(candidates)) {
    if (await pathExists(candidate)) {
      binaries.push(candidate);
    }
  }
  return binaries;
}

export function runtimeDeploymentTarget(deploymentTarget) {
  let version = Number.parseFloat(deploymentTarget);
  return version >= Number.parseFloat(minimumRuntimeDeploymentTarget)
    ? deploymentTarget
    : minimumRuntimeDeploymentTarget;
}

async function discoverRegistries(appPath, settings) {
  let registries = new Set();
  for (let binary of await applicationBinaries(appPath, settings)) {
    let result = await runCommand('nm', ['-j', binary], {
      allowFailure: true,
    });
    for (let registry of parseRegistryTypes(result.stdout)) {
      registries.add(registry);
    }
  }
  return [...registries].sort();
}

async function compileRuntime(clientRoot, buildPath, deploymentTarget) {
  let sdkResult = await runCommand('xcrun', [
    '--sdk',
    'iphonesimulator',
    '--show-sdk-path',
  ]);
  let sdkPath = sdkResult.stdout.trim();
  let moduleCache = join(buildPath, 'module-cache');
  let objectPath = join(buildPath, 'RuntimeConstructor.o');
  let dylibPath = join(buildPath, 'libVizzlyPreviewRuntime.dylib');
  let cSource = join(
    clientRoot,
    'Sources',
    'CVizzlyPreviewRuntime',
    'RuntimeConstructor.c'
  );
  let headerPath = join(
    clientRoot,
    'Sources',
    'CVizzlyPreviewRuntime',
    'include'
  );
  let swiftSource = join(
    clientRoot,
    'Sources',
    'VizzlyPreviewRuntime',
    'VizzlyPreviewRuntime.swift'
  );
  let target = `arm64-apple-ios${runtimeDeploymentTarget(deploymentTarget)}-simulator`;

  await mkdir(moduleCache, { recursive: true });
  await runCommand('xcrun', [
    '--sdk',
    'iphonesimulator',
    'clang',
    '-c',
    cSource,
    '-I',
    headerPath,
    '-target',
    target,
    '-isysroot',
    sdkPath,
    '-o',
    objectPath,
  ]);
  await runCommand('xcrun', [
    '--toolchain',
    'XcodeDefault',
    'swiftc',
    '-emit-library',
    swiftSource,
    objectPath,
    '-module-name',
    'VizzlyPreviewRuntime',
    '-target',
    target,
    '-sdk',
    sdkPath,
    '-parse-as-library',
    '-module-cache-path',
    moduleCache,
    '-o',
    dylibPath,
  ]);
  return dylibPath;
}

async function embedRuntime(appPath, dylibPath) {
  let frameworksPath = join(appPath, 'Frameworks');
  let embeddedPath = join(frameworksPath, basename(dylibPath));
  await mkdir(frameworksPath, { recursive: true });
  await copyFile(dylibPath, embeddedPath);
  await runCommand('codesign', ['--force', '--sign', '-', embeddedPath]);
  await runCommand('codesign', ['--force', '--deep', '--sign', '-', appPath]);
}

function slug(value) {
  let result = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return result || 'unnamed-preview';
}

async function captureRegistry({
  registryType,
  index,
  device,
  bundleId,
  containerPath,
  outputPath,
  captureTimeout,
}) {
  let runtimeFilename = 'vizzly-preview.png';
  let runtimePath = join(containerPath, 'Documents', runtimeFilename);
  await rm(runtimePath, { force: true });

  let result = await runCommand(
    'xcrun',
    [
      'simctl',
      'launch',
      '--console',
      '--terminate-running-process',
      device,
      bundleId,
    ],
    {
      allowFailure: true,
      timeoutMs: captureTimeout,
      env: {
        ...process.env,
        SIMCTL_CHILD_DYLD_INSERT_LIBRARIES:
          '@executable_path/Frameworks/libVizzlyPreviewRuntime.dylib',
        SIMCTL_CHILD_VIZZLY_REGISTRY_TYPE: registryType,
        SIMCTL_CHILD_VIZZLY_OUTPUT_FILENAME: runtimeFilename,
      },
    }
  );
  let events = parseRuntimeEvents(`${result.stdout}\n${result.stderr}`);
  let resolved = events.find(event => event.type === 'preview-resolved');
  let completed = events.find(event => event.type === 'capture-complete');
  let failed = events.find(event => event.type === 'capture-failed');
  if (failed || !resolved || !completed || !(await pathExists(runtimePath))) {
    let reason = failed?.message ?? 'The app exited without capture completion';
    throw new Error(`Preview ${index + 1} failed: ${reason}`);
  }

  let filename = `${String(index + 1).padStart(3, '0')}-${slug(resolved.name)}.png`;
  let artifactPath = join(outputPath, filename);
  await copyFile(runtimePath, artifactPath);
  let buffer = await readFile(artifactPath);
  let metadata = readPngMetadata(buffer);

  return {
    id: createHash('sha256').update(registryType).digest('hex').slice(0, 16),
    name: resolved.name,
    registryType,
    viewType: resolved.viewType,
    file: filename,
    ...metadata,
  };
}

export async function runPreviewCapture({
  container: containerInput,
  scheme,
  device,
  configuration = 'Debug',
  outputPath: outputInput,
  captureTimeout = 30_000,
  onProgress = () => {},
}) {
  let temporaryPath;
  let stagingPath;

  try {
    let clientRoot = resolve(import.meta.dirname, '..');
    let container = await resolveContainer(containerInput);
    let outputPath = resolve(outputInput);
    let outputParent = dirname(outputPath);
    await mkdir(outputParent, { recursive: true });
    await validateOutputPath(outputPath);
    temporaryPath = await mkdtemp(join(tmpdir(), 'vizzly-previews-'));
    stagingPath = await mkdtemp(join(outputParent, '.vizzly-previews-'));

    let xcodeVersion = await assertSupportedToolchain();
    let selectedScheme = await resolveScheme(container, scheme);
    let resolvedScheme = selectedScheme.name;
    let schemeAction = selectionAction(selectedScheme.selection);
    onProgress(`${schemeAction} Xcode scheme: ${resolvedScheme}`);
    let simulator = await resolveSimulator(device);
    let resolvedDevice = simulator.udid;
    let simulatorAction = selectionAction(simulator.selection);
    onProgress(
      `${simulatorAction} booted iOS Simulator: ${formatSimulator(simulator)}`
    );
    let derivedDataPath = join(temporaryPath, 'DerivedData');
    let { appPath, settings } = await buildApplication({
      container,
      scheme: resolvedScheme,
      device: resolvedDevice,
      configuration,
      derivedDataPath,
    });
    let registryTypes = await discoverRegistries(appPath, settings);
    if (registryTypes.length === 0) {
      throw new Error(
        `No stock #Preview declarations were found in ${resolvedScheme}`
      );
    }
    onProgress(
      `Discovered ${registryTypes.length} stock #Preview declarations`
    );

    let runtimePath = await compileRuntime(
      clientRoot,
      temporaryPath,
      settings.IPHONEOS_DEPLOYMENT_TARGET ?? minimumRuntimeDeploymentTarget
    );
    await embedRuntime(appPath, runtimePath);
    await runCommand('xcrun', ['simctl', 'install', resolvedDevice, appPath]);

    let bundleId = settings.PRODUCT_BUNDLE_IDENTIFIER;
    let containerResult = await runCommand('xcrun', [
      'simctl',
      'get_app_container',
      resolvedDevice,
      bundleId,
      'data',
    ]);
    let dataContainerPath = containerResult.stdout.trim();
    let previews = [];
    for (let [index, registryType] of registryTypes.entries()) {
      let preview = await captureRegistry({
        registryType,
        index,
        device: resolvedDevice,
        bundleId,
        containerPath: dataContainerPath,
        outputPath: stagingPath,
        captureTimeout,
      });
      previews.push(preview);
      onProgress(`Captured ${preview.name}`);
    }

    let manifest = {
      protocolVersion: 1,
      xcodeVersion,
      container,
      scheme: resolvedScheme,
      device: resolvedDevice,
      simulator,
      configuration,
      outputPath,
      previews,
    };
    await writeFile(
      join(stagingPath, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    await replaceOutputDirectory(stagingPath, outputPath);
    stagingPath = undefined;
    return manifest;
  } catch (error) {
    throw new Error(`Swift preview capture failed: ${error.message}`, {
      cause: error,
    });
  } finally {
    if (temporaryPath) {
      await rm(temporaryPath, { recursive: true, force: true });
    }
    if (stagingPath) {
      await rm(stagingPath, { recursive: true, force: true });
    }
  }
}
