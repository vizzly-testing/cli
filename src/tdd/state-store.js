/**
 * TDD State Store
 *
 * Public API facade for reporter state persistence.
 *
 * SQLite is the only supported backend.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { STATE_METADATA_KEYS } from './state-store/constants.js';
import {
  createSqliteStateStore,
  getStateDbPath,
} from './state-store/sqlite-store.js';

export { STATE_METADATA_KEYS, createSqliteStateStore, getStateDbPath };

export function createStateStore(options = {}) {
  return createSqliteStateStore(options);
}

let LEGACY_STATE_FILES = [
  'report-data.json',
  'comparison-details.json',
  join('baselines', 'metadata.json'),
  'hotspots.json',
  'regions.json',
  'baseline-metadata.json',
];

/**
 * Bootstrap legacy JSON state into SQLite once, the first time CLI runs
 * in a project that has legacy files and no state.db yet.
 *
 * @returns {boolean} true when bootstrap migration was executed
 */
export function bootstrapLegacyStateIfNeeded(options = {}) {
  let {
    workingDir = process.cwd(),
    output = {},
    createStore = createStateStore,
    fs = {},
    joinPath = join,
  } = options;

  let { existsSync: existsSyncImpl = existsSync } = fs;
  let vizzlyDir = joinPath(workingDir, '.vizzly');
  let stateDbPath = joinPath(vizzlyDir, 'state.db');

  if (!existsSyncImpl(vizzlyDir) || existsSyncImpl(stateDbPath)) {
    return false;
  }

  let hasLegacyFiles = LEGACY_STATE_FILES.some(relativePath =>
    existsSyncImpl(joinPath(vizzlyDir, relativePath))
  );

  if (!hasLegacyFiles) {
    return false;
  }

  try {
    let store = createStore({ workingDir, output, mode: 'write' });
    store.close();
    output.debug?.('state', 'bootstrapped legacy JSON state to SQLite');
    return true;
  } catch (error) {
    output.debug?.(
      'state',
      `legacy bootstrap migration skipped: ${error.message}`
    );
    return false;
  }
}
