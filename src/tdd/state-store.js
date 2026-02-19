/**
 * TDD State Store
 *
 * Public API facade for reporter state persistence.
 *
 * SQLite is the only supported backend.
 */

import { STATE_METADATA_KEYS } from './state-store/constants.js';
import {
  createSqliteStateStore,
  getStateDbPath,
} from './state-store/sqlite-store.js';

export { STATE_METADATA_KEYS, createSqliteStateStore, getStateDbPath };

export function createStateStore(options) {
  return createSqliteStateStore(options);
}
