import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  cosmiconfigSync,
  defaultLoadersSync,
  getDefaultSearchPlacesSync,
} from 'cosmiconfig';

let searchPlaces = getDefaultSearchPlacesSync('vizzly');

export function createConfigExplorer() {
  return cosmiconfigSync('vizzly', {
    searchPlaces,
    searchStrategy: 'none',
  });
}

export async function readOptionalFile(filename) {
  try {
    return await readFile(filename, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function configFormat(filename) {
  if (path.basename(filename) === 'package.json') return 'package';
  let extension = path.extname(filename);
  if (extension === '.json') return 'json';
  if (extension === '.ts') return 'typescript';
  if (extension === '.js') return 'javascript';
  if (extension === '.cjs') return 'commonjs';
  if (['.yaml', '.yml', ''].includes(extension)) return 'yaml';
  return 'unknown';
}

async function inspectConfig(filename, allowInvalid) {
  let source = await readOptionalFile(filename);
  let result = {
    configPath: filename,
    exists: source !== null,
    format: configFormat(filename),
    source,
  };
  if (source === null) return result;
  try {
    if (result.format === 'package') {
      result.packageConfig = JSON.parse(source);
      result.parsedConfig = result.packageConfig.vizzly;
    } else if (result.format === 'json') {
      result.parsedConfig = JSON.parse(source);
    } else if (result.format === 'yaml') {
      result.parsedConfig = defaultLoadersSync.noExt(filename, source);
    }
  } catch (error) {
    // Replacing a standalone file does not need its old values. Package config
    // still needs valid JSON so unrelated scripts and dependencies survive.
    if (!allowInvalid || result.format === 'package') throw error;
    result.parseError = error.message;
  }
  return result;
}

// Setup discovers source files without evaluating executable configuration or
// reading credentials. Runtime loading remains the explorer's responsibility.
export async function discoverConfig({
  cwd = process.cwd(),
  configPath = null,
  allowInvalid = false,
} = {}) {
  if (configPath)
    return inspectConfig(path.resolve(cwd, configPath), allowInvalid);
  for (let place of searchPlaces) {
    let candidate = await inspectConfig(path.resolve(cwd, place), allowInvalid);
    if (!candidate.exists || !candidate.source.trim()) continue;
    if (
      ['package', 'json', 'yaml'].includes(candidate.format) &&
      candidate.parsedConfig == null &&
      !candidate.parseError
    ) {
      continue;
    }
    return candidate;
  }
  return inspectConfig(path.resolve(cwd, 'vizzly.config.js'), allowInvalid);
}
