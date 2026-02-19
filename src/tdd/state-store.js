/**
 * TDD State Store
 *
 * Public API facade for reporter state persistence.
 *
 * SQLite backend is the production default.
 * File backend exists for tests with mocked fs behavior.
 */

import { STATE_METADATA_KEYS } from './state-store/constants.js';
import { createFileStateStore } from './state-store/file-store.js';
import {
  createSqliteStateStore,
  getStateDbPath,
} from './state-store/sqlite-store.js';

export {
  STATE_METADATA_KEYS,
  createFileStateStore,
  createSqliteStateStore,
  getStateDbPath,
};

export function createStateStore(options = {}) {
  let { backend = 'sqlite' } = options;

  if (backend === 'file') {
    return createFileStateStore(options);
  }

  return createSqliteStateStore(options);
}
