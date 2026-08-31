import { access, readFile } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readServerUrl(startDir) {
  let currentDir = startDir;
  let root = parse(currentDir).root;

  while (currentDir !== root) {
    let serverPath = join(currentDir, '.vizzly', 'server.json');
    if (await pathExists(serverPath)) {
      try {
        let server = JSON.parse(await readFile(serverPath, 'utf8'));
        let port = Number(server.port);
        if (Number.isInteger(port) && port > 0) {
          return `http://localhost:${port}`;
        }
      } catch {
        // Keep searching when a stale or partial server file is present.
      }
    }
    currentDir = dirname(currentDir);
  }

  return null;
}

export async function findLocalTddServer(startDirectories) {
  let checkedUrls = new Set();

  for (let startDir of startDirectories) {
    let serverUrl = await readServerUrl(startDir);
    if (!serverUrl || checkedUrls.has(serverUrl)) {
      continue;
    }
    checkedUrls.add(serverUrl);

    try {
      let response = await fetch(`${serverUrl}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        return serverUrl;
      }
    } catch {
      // A stale server file is not an active TDD session.
    }
  }

  return null;
}

export function hasApiToken(config = {}, env = process.env) {
  return Boolean(config.apiKey || env.VIZZLY_TOKEN);
}

export function buildCloudRunOptions(vizzlyConfig = {}, gitInfo = {}) {
  let runOptions = {
    port: vizzlyConfig.server?.port || 47392,
    timeout: vizzlyConfig.server?.timeout || 30_000,
    buildName:
      vizzlyConfig.build?.name ||
      gitInfo.buildName ||
      `SwiftUI Previews ${new Date().toISOString()}`,
    branch: gitInfo.branch || 'main',
    commit: gitInfo.commit,
    message: gitInfo.message,
    environment: vizzlyConfig.build?.environment,
    eager: vizzlyConfig.eager || false,
    allowNoToken: false,
    wait: false,
    uploadAll: false,
    pullRequestNumber: gitInfo.prNumber,
    parallelId: vizzlyConfig.parallelId,
  };

  if (vizzlyConfig.comparison?.threshold != null) {
    runOptions.threshold = vizzlyConfig.comparison.threshold;
  }
  if (vizzlyConfig.comparison?.minClusterSize != null) {
    runOptions.minClusterSize = vizzlyConfig.comparison.minClusterSize;
  }

  return runOptions;
}

function previewNames(manifest) {
  let baseNames = manifest.previews.map(
    preview => `${manifest.scheme} - ${preview.name}`
  );
  let baseCounts = new Map();
  for (let name of baseNames) {
    baseCounts.set(name, (baseCounts.get(name) ?? 0) + 1);
  }

  let qualifiedNames = manifest.previews.map((preview, index) => {
    let baseName = baseNames[index];
    return baseCounts.get(baseName) === 1
      ? baseName
      : `${baseName} - ${preview.viewType}`;
  });
  let qualifiedCounts = new Map();
  for (let name of qualifiedNames) {
    qualifiedCounts.set(name, (qualifiedCounts.get(name) ?? 0) + 1);
  }

  return qualifiedNames.map((name, index) =>
    qualifiedCounts.get(name) === 1
      ? name
      : `${name} - ${manifest.previews[index].id}`
  );
}

function safeScreenshotName(name, previewId) {
  let safeName = name
    .replace(/\s*[\\/]\s*/g, ' - ')
    .replace(/\.{2,}/g, '.')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\s+/g, ' ');
  if (safeName.startsWith('.')) {
    safeName = `Preview ${safeName}`;
  }
  if (safeName.length > 255) {
    safeName = `${safeName.slice(0, 236).trim()} - ${previewId}`;
  }
  return safeName;
}

function runtimeVersion(runtime) {
  return runtime?.replace(/^iOS\s+/, '') ?? null;
}

export function buildPreviewUploadRecords(manifest) {
  let names = previewNames(manifest).map((name, index) =>
    safeScreenshotName(name, manifest.previews[index].id)
  );
  let nameCounts = new Map();
  for (let name of names) {
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  return manifest.previews.map((preview, index) => ({
    filePath: join(manifest.outputPath, preview.file),
    name:
      nameCounts.get(names[index]) === 1
        ? names[index]
        : safeScreenshotName(`${names[index]} - ${preview.id}`, preview.id),
    properties: {
      browser: 'SwiftUI Preview',
      device: manifest.simulator.name,
      osName: 'iOS',
      osVersion: runtimeVersion(manifest.simulator.runtime),
      platform: 'iOS',
      previewId: preview.id,
      scheme: manifest.scheme,
      viewType: preview.viewType,
      viewport: { width: preview.width, height: preview.height },
      xcodeVersion: manifest.xcodeVersion,
    },
  }));
}

export async function uploadCapturedPreviews({
  buildId,
  comparison = {},
  manifest,
  screenshots,
  serverUrl,
}) {
  if (!screenshots?.createClient) {
    throw new Error(
      'This Vizzly CLI does not provide screenshot uploads to plugins. Upgrade @vizzly-testing/cli.'
    );
  }

  let client = screenshots.createClient({
    failOnDiff: process.env.VIZZLY_FAIL_ON_DIFF === 'true',
    serverUrl,
  });
  let records = buildPreviewUploadRecords(manifest);

  for (let record of records) {
    let result = await client.screenshot(record.name, record.filePath, {
      buildId,
      minClusterSize: comparison.minClusterSize,
      properties: record.properties,
      threshold: comparison.threshold,
    });
    if (!result) {
      throw new Error(`Vizzly did not accept preview "${record.name}"`);
    }
  }

  let flush = await client.flush();
  if (!flush && buildId) {
    throw new Error('Vizzly did not finish processing the preview screenshots');
  }

  return { flush, uploaded: records.length };
}
