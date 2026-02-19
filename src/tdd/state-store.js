/**
 * TDD State Store
 *
 * Stores volatile TDD reporter state in SQLite.
 *
 * SQLite backend is the production default.
 * The file backend exists for tests that inject mocked fs behavior.
 */

import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

let stateEmitters = new Map();

function getStateEmitter(workingDir) {
  let emitter = stateEmitters.get(workingDir);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(100);
    stateEmitters.set(workingDir, emitter);
  }
  return emitter;
}

function emitStateChanged(workingDir) {
  getStateEmitter(workingDir).emit('changed');
}

function subscribeToStateChanges(workingDir, listener) {
  let emitter = getStateEmitter(workingDir);
  emitter.on('changed', listener);
  return () => emitter.off('changed', listener);
}

function parseJson(value, fallback = null) {
  if (value == null || value === '') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toIntegerBool(value) {
  return value ? 1 : 0;
}

function fromIntegerBool(value) {
  return value === 1;
}

function hasReportData(reportData) {
  if (!reportData || typeof reportData !== 'object') {
    return false;
  }
  if (!Array.isArray(reportData.comparisons)) {
    return false;
  }
  return true;
}

function buildSummary(comparisons) {
  return {
    total: comparisons.length,
    passed: comparisons.filter(
      comparison =>
        comparison.status === 'passed' ||
        comparison.status === 'baseline-created' ||
        comparison.status === 'new'
    ).length,
    failed: comparisons.filter(comparison => comparison.status === 'failed')
      .length,
    rejected: comparisons.filter(comparison => comparison.status === 'rejected')
      .length,
    errors: comparisons.filter(comparison => comparison.status === 'error')
      .length,
  };
}

function mapComparisonRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    status: row.status,
    initialStatus: row.initial_status,
    signature: row.signature,
    baseline: row.baseline,
    current: row.current,
    diff: row.diff,
    properties: parseJson(row.properties_json, {}),
    threshold: row.threshold,
    minClusterSize: row.min_cluster_size,
    diffPercentage: row.diff_percentage,
    diffCount: row.diff_count,
    reason: row.reason,
    totalPixels: row.total_pixels,
    aaPixelsIgnored: row.aa_pixels_ignored,
    aaPercentage: row.aa_percentage,
    heightDiff: row.height_diff,
    error: row.error,
    originalName: row.original_name,
    timestamp: row.timestamp,
    hasDiffClusters: fromIntegerBool(row.has_diff_clusters),
    hasConfirmedRegions: fromIntegerBool(row.has_confirmed_regions),
  };
}

function normalizeComparison(comparison, initialStatus) {
  let normalized = comparison || {};
  let now = Date.now();

  return {
    id: normalized.id,
    name: normalized.name,
    status: normalized.status,
    initial_status:
      initialStatus ||
      normalized.initialStatus ||
      normalized.initial_status ||
      normalized.status ||
      null,
    signature: normalized.signature ?? null,
    baseline: normalized.baseline ?? null,
    current: normalized.current ?? null,
    diff: normalized.diff ?? null,
    properties_json: JSON.stringify(normalized.properties || {}),
    threshold:
      normalized.threshold == null ? null : Number(normalized.threshold),
    min_cluster_size:
      normalized.minClusterSize == null
        ? null
        : Number(normalized.minClusterSize),
    diff_percentage:
      normalized.diffPercentage == null
        ? null
        : Number(normalized.diffPercentage),
    diff_count:
      normalized.diffCount == null ? null : Number(normalized.diffCount),
    reason: normalized.reason ?? null,
    total_pixels:
      normalized.totalPixels == null ? null : Number(normalized.totalPixels),
    aa_pixels_ignored:
      normalized.aaPixelsIgnored == null
        ? null
        : Number(normalized.aaPixelsIgnored),
    aa_percentage:
      normalized.aaPercentage == null ? null : Number(normalized.aaPercentage),
    height_diff:
      normalized.heightDiff == null ? null : Number(normalized.heightDiff),
    error: normalized.error ?? null,
    original_name: normalized.originalName ?? null,
    has_diff_clusters: toIntegerBool(normalized.hasDiffClusters),
    has_confirmed_regions: toIntegerBool(normalized.hasConfirmedRegions),
    timestamp:
      normalized.timestamp == null ? now : Number(normalized.timestamp),
    updated_at: now,
  };
}

function normalizeHotspotBundle(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (value.hotspots && typeof value.hotspots === 'object') {
    return {
      downloadedAt: value.downloadedAt || new Date().toISOString(),
      summary: value.summary || {},
      hotspots: value.hotspots,
    };
  }

  return {
    downloadedAt: new Date().toISOString(),
    summary: {},
    hotspots: value,
  };
}

function normalizeRegionBundle(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (value.regions && typeof value.regions === 'object') {
    return {
      downloadedAt: value.downloadedAt || new Date().toISOString(),
      summary: value.summary || {},
      regions: value.regions,
    };
  }

  return {
    downloadedAt: new Date().toISOString(),
    summary: {},
    regions: value,
  };
}

export let STATE_METADATA_KEYS = {
  baseline: 'baseline_metadata',
  hotspot: 'hotspot_metadata',
  region: 'region_metadata',
  baselineBuild: 'baseline_build_metadata',
};

let STATE_SCHEMA_MIGRATIONS = [
  {
    version: 1,
    name: 'core_report_state',
    sql: `
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS comparisons (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        initial_status TEXT,
        signature TEXT,
        baseline TEXT,
        current TEXT,
        diff TEXT,
        properties_json TEXT NOT NULL,
        threshold REAL,
        min_cluster_size INTEGER,
        diff_percentage REAL,
        diff_count INTEGER,
        reason TEXT,
        total_pixels INTEGER,
        aa_pixels_ignored INTEGER,
        aa_percentage REAL,
        height_diff INTEGER,
        error TEXT,
        original_name TEXT,
        has_diff_clusters INTEGER NOT NULL DEFAULT 0,
        has_confirmed_regions INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_comparisons_status
        ON comparisons(status);

      CREATE INDEX IF NOT EXISTS idx_comparisons_signature
        ON comparisons(signature);

      CREATE TABLE IF NOT EXISTS comparison_details (
        id TEXT PRIMARY KEY REFERENCES comparisons(id) ON DELETE CASCADE,
        details_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'metadata_state',
    sql: `
      CREATE TABLE IF NOT EXISTS state_metadata (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
  },
];

function applySchemaMigrations(db, output = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  let applied = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all();
  let appliedVersions = new Set(applied.map(row => Number(row.version)));

  for (let migration of STATE_SCHEMA_MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    let transaction = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare(
        `
          INSERT INTO schema_migrations (version, name, applied_at)
          VALUES (?, ?, ?)
        `
      ).run(migration.version, migration.name, Date.now());
    });

    transaction();
    output.debug?.(
      'state',
      `applied migration v${migration.version}: ${migration.name}`
    );
  }
}

export function getStateDbPath(workingDir) {
  return join(workingDir, '.vizzly', 'state.db');
}

export function createSqliteStateStore(options = {}) {
  let {
    workingDir = process.cwd(),
    output = {},
    Database,
    fs = {},
    joinPath = join,
    dbPath = null,
  } = options;

  let {
    existsSync: existsSyncImpl = existsSync,
    mkdirSync: mkdirSyncImpl = mkdirSync,
    readFileSync: readFileSyncImpl = readFileSync,
  } = fs;

  let vizzlyDir = joinPath(workingDir, '.vizzly');
  if (!existsSyncImpl(vizzlyDir)) {
    mkdirSyncImpl(vizzlyDir, { recursive: true });
  }

  let resolvedDbPath = dbPath || joinPath(vizzlyDir, 'state.db');
  let dbDirectory = dirname(resolvedDbPath);
  if (!existsSyncImpl(dbDirectory)) {
    mkdirSyncImpl(dbDirectory, { recursive: true });
  }

  let DatabaseImpl = Database || BetterSqlite3;
  let db = new DatabaseImpl(resolvedDbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  applySchemaMigrations(db, output);

  let getKvStmt = db.prepare('SELECT value FROM kv WHERE key = ?');
  let setKvStmt = db.prepare(`
    INSERT INTO kv (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  let listComparisonsStmt = db.prepare(`
    SELECT * FROM comparisons
    ORDER BY timestamp ASC, updated_at ASC, id ASC
  `);

  let getComparisonByIdStmt = db.prepare(
    'SELECT * FROM comparisons WHERE id = ?'
  );
  let getComparisonBySignatureStmt = db.prepare(
    'SELECT * FROM comparisons WHERE signature = ? LIMIT 1'
  );
  let getComparisonByNameStmt = db.prepare(
    'SELECT * FROM comparisons WHERE name = ? LIMIT 1'
  );

  let upsertComparisonStmt = db.prepare(`
    INSERT INTO comparisons (
      id, name, status, initial_status, signature, baseline, current, diff,
      properties_json, threshold, min_cluster_size, diff_percentage, diff_count,
      reason, total_pixels, aa_pixels_ignored, aa_percentage, height_diff, error,
      original_name, has_diff_clusters, has_confirmed_regions, timestamp, updated_at
    ) VALUES (
      @id, @name, @status, @initial_status, @signature, @baseline, @current, @diff,
      @properties_json, @threshold, @min_cluster_size, @diff_percentage, @diff_count,
      @reason, @total_pixels, @aa_pixels_ignored, @aa_percentage, @height_diff, @error,
      @original_name, @has_diff_clusters, @has_confirmed_regions, @timestamp, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      status = excluded.status,
      initial_status = excluded.initial_status,
      signature = excluded.signature,
      baseline = excluded.baseline,
      current = excluded.current,
      diff = excluded.diff,
      properties_json = excluded.properties_json,
      threshold = excluded.threshold,
      min_cluster_size = excluded.min_cluster_size,
      diff_percentage = excluded.diff_percentage,
      diff_count = excluded.diff_count,
      reason = excluded.reason,
      total_pixels = excluded.total_pixels,
      aa_pixels_ignored = excluded.aa_pixels_ignored,
      aa_percentage = excluded.aa_percentage,
      height_diff = excluded.height_diff,
      error = excluded.error,
      original_name = excluded.original_name,
      has_diff_clusters = excluded.has_diff_clusters,
      has_confirmed_regions = excluded.has_confirmed_regions,
      timestamp = excluded.timestamp,
      updated_at = excluded.updated_at
  `);

  let clearComparisonsStmt = db.prepare('DELETE FROM comparisons');
  let deleteComparisonStmt = db.prepare('DELETE FROM comparisons WHERE id = ?');

  let getDetailsStmt = db.prepare(
    'SELECT details_json FROM comparison_details WHERE id = ?'
  );
  let upsertDetailsStmt = db.prepare(`
    INSERT INTO comparison_details (id, details_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      details_json = excluded.details_json,
      updated_at = excluded.updated_at
  `);
  let deleteDetailsStmt = db.prepare(
    'DELETE FROM comparison_details WHERE id = ?'
  );
  let clearDetailsStmt = db.prepare('DELETE FROM comparison_details');

  let countComparisonsStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM comparisons'
  );

  let getMetadataStmt = db.prepare(
    'SELECT value_json FROM state_metadata WHERE key = ?'
  );
  let setMetadataStmt = db.prepare(`
    INSERT INTO state_metadata (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `);
  let removeMetadataStmt = db.prepare(
    'DELETE FROM state_metadata WHERE key = ?'
  );
  let getSchemaVersionStmt = db.prepare(`
    SELECT COALESCE(MAX(version), 0) AS version
    FROM schema_migrations
  `);

  function getKey(key) {
    let row = getKvStmt.get(key);
    return row?.value ?? null;
  }

  function setKey(key, value) {
    setKvStmt.run(key, String(value), Date.now());
  }

  function setReportInitialized(timestamp = Date.now()) {
    setKey('report_initialized', '1');
    setKey('report_timestamp', String(timestamp));
  }

  function getMetadataInternal(key, fallback = null) {
    let row = getMetadataStmt.get(key);
    if (!row) {
      return fallback;
    }

    return parseJson(row.value_json, fallback);
  }

  function setMetadataInternal(key, value, emit = true) {
    let serialized = JSON.stringify(value == null ? null : value);
    setMetadataStmt.run(key, serialized, Date.now());
    if (emit) {
      emitStateChanged(workingDir);
    }
  }

  function removeMetadataInternal(key, emit = true) {
    let result = removeMetadataStmt.run(key);
    if (emit && result.changes > 0) {
      emitStateChanged(workingDir);
    }
    return result.changes > 0;
  }

  function getBaselineMetadata() {
    return getMetadataInternal(STATE_METADATA_KEYS.baseline, null);
  }

  function setBaselineMetadata(metadata, emit = true) {
    setMetadataInternal(STATE_METADATA_KEYS.baseline, metadata, emit);
  }

  function clearBaselineMetadata(emit = true) {
    return removeMetadataInternal(STATE_METADATA_KEYS.baseline, emit);
  }

  function removeBaselineScreenshot(signature) {
    if (!signature) {
      return false;
    }

    let metadata = getBaselineMetadata();
    if (!metadata || !Array.isArray(metadata.screenshots)) {
      return false;
    }

    let originalLength = metadata.screenshots.length;
    metadata.screenshots = metadata.screenshots.filter(
      screenshot => screenshot.signature !== signature
    );

    if (metadata.screenshots.length === originalLength) {
      return false;
    }

    setBaselineMetadata(metadata, true);
    return true;
  }

  function getHotspotBundle() {
    return getMetadataInternal(STATE_METADATA_KEYS.hotspot, null);
  }

  function getHotspotMetadata() {
    let bundle = getHotspotBundle();
    return bundle?.hotspots || null;
  }

  function setHotspotMetadata(hotspotData, summary = {}, emit = true) {
    setMetadataInternal(
      STATE_METADATA_KEYS.hotspot,
      {
        downloadedAt: new Date().toISOString(),
        summary,
        hotspots: hotspotData || {},
      },
      emit
    );
  }

  function clearHotspotMetadata(emit = true) {
    return removeMetadataInternal(STATE_METADATA_KEYS.hotspot, emit);
  }

  function getRegionBundle() {
    return getMetadataInternal(STATE_METADATA_KEYS.region, null);
  }

  function getRegionMetadata() {
    let bundle = getRegionBundle();
    return bundle?.regions || null;
  }

  function setRegionMetadata(regionData, summary = {}, emit = true) {
    setMetadataInternal(
      STATE_METADATA_KEYS.region,
      {
        downloadedAt: new Date().toISOString(),
        summary,
        regions: regionData || {},
      },
      emit
    );
  }

  function clearRegionMetadata(emit = true) {
    return removeMetadataInternal(STATE_METADATA_KEYS.region, emit);
  }

  function getBaselineBuildMetadata() {
    return getMetadataInternal(STATE_METADATA_KEYS.baselineBuild, null);
  }

  function setBaselineBuildMetadata(metadata, emit = true) {
    setMetadataInternal(STATE_METADATA_KEYS.baselineBuild, metadata, emit);
  }

  function clearBaselineBuildMetadata(emit = true) {
    return removeMetadataInternal(STATE_METADATA_KEYS.baselineBuild, emit);
  }

  function replaceReportDataInternal(
    reportData,
    detailsById = null,
    emit = true
  ) {
    let comparisons = Array.isArray(reportData?.comparisons)
      ? reportData.comparisons
      : [];
    let timestamp = Number(reportData?.timestamp) || Date.now();

    let transaction = db.transaction(() => {
      clearDetailsStmt.run();
      clearComparisonsStmt.run();

      for (let comparison of comparisons) {
        if (!comparison?.id || !comparison?.name || !comparison?.status) {
          continue;
        }

        let normalized = normalizeComparison(
          comparison,
          comparison.initialStatus || comparison.status
        );
        upsertComparisonStmt.run(normalized);
      }

      if (detailsById && typeof detailsById === 'object') {
        for (let [id, details] of Object.entries(detailsById)) {
          upsertDetailsStmt.run(id, JSON.stringify(details || {}), Date.now());
        }
      }

      setReportInitialized(timestamp);
    });

    transaction();

    if (emit) {
      emitStateChanged(workingDir);
    }
  }

  function maybeMigrateLegacyJson() {
    let legacyMigrated = getKey('legacy_json_migrated');
    if (legacyMigrated === '1') {
      return;
    }

    let hasRows = countComparisonsStmt.get().count > 0;
    let initialized = getKey('report_initialized') === '1';
    if (hasRows || initialized) {
      setKey('legacy_json_migrated', '1');
      return;
    }

    let reportPath = joinPath(vizzlyDir, 'report-data.json');
    let detailsPath = joinPath(vizzlyDir, 'comparison-details.json');

    if (!existsSyncImpl(reportPath)) {
      setKey('legacy_json_migrated', '1');
      return;
    }

    try {
      let reportData = parseJson(readFileSyncImpl(reportPath, 'utf8'), null);
      if (!hasReportData(reportData)) {
        setKey('legacy_json_migrated', '1');
        return;
      }

      let details = {};
      if (existsSyncImpl(detailsPath)) {
        details = parseJson(readFileSyncImpl(detailsPath, 'utf8'), {});
      }

      replaceReportDataInternal(reportData, details, false);
      output.debug?.('state', 'migrated legacy report state JSON to SQLite');
    } catch (error) {
      output.debug?.(
        'state',
        `legacy report JSON migration skipped: ${error.message}`
      );
    } finally {
      setKey('legacy_json_migrated', '1');
    }
  }

  function maybeMigrateLegacyMetadataJson() {
    let legacyMigrated = getKey('legacy_metadata_json_migrated');
    if (legacyMigrated === '1') {
      return;
    }

    let baselineMetadataPath = joinPath(
      vizzlyDir,
      'baselines',
      'metadata.json'
    );
    let hotspotMetadataPath = joinPath(vizzlyDir, 'hotspots.json');
    let regionMetadataPath = joinPath(vizzlyDir, 'regions.json');
    let baselineBuildMetadataPath = joinPath(
      vizzlyDir,
      'baseline-metadata.json'
    );

    try {
      if (existsSyncImpl(baselineMetadataPath) && !getBaselineMetadata()) {
        let baselineMetadata = parseJson(
          readFileSyncImpl(baselineMetadataPath, 'utf8'),
          null
        );
        if (baselineMetadata) {
          setBaselineMetadata(baselineMetadata, false);
          output.debug?.(
            'state',
            'migrated baselines/metadata.json to SQLite metadata state'
          );
        }
      }

      if (existsSyncImpl(hotspotMetadataPath) && !getHotspotBundle()) {
        let rawHotspots = parseJson(
          readFileSyncImpl(hotspotMetadataPath, 'utf8'),
          null
        );
        let hotspotBundle = normalizeHotspotBundle(rawHotspots);
        if (hotspotBundle) {
          setMetadataInternal(
            STATE_METADATA_KEYS.hotspot,
            hotspotBundle,
            false
          );
          output.debug?.(
            'state',
            'migrated hotspots.json to SQLite metadata state'
          );
        }
      }

      if (existsSyncImpl(regionMetadataPath) && !getRegionBundle()) {
        let rawRegions = parseJson(
          readFileSyncImpl(regionMetadataPath, 'utf8'),
          null
        );
        let regionBundle = normalizeRegionBundle(rawRegions);
        if (regionBundle) {
          setMetadataInternal(STATE_METADATA_KEYS.region, regionBundle, false);
          output.debug?.(
            'state',
            'migrated regions.json to SQLite metadata state'
          );
        }
      }

      if (
        existsSyncImpl(baselineBuildMetadataPath) &&
        !getBaselineBuildMetadata()
      ) {
        let baselineBuildMetadata = parseJson(
          readFileSyncImpl(baselineBuildMetadataPath, 'utf8'),
          null
        );
        if (baselineBuildMetadata) {
          setBaselineBuildMetadata(baselineBuildMetadata, false);
          output.debug?.(
            'state',
            'migrated baseline-metadata.json to SQLite metadata state'
          );
        }
      }
    } catch (error) {
      output.debug?.(
        'state',
        `legacy metadata JSON migration skipped: ${error.message}`
      );
    } finally {
      setKey('legacy_metadata_json_migrated', '1');
    }
  }

  maybeMigrateLegacyJson();
  maybeMigrateLegacyMetadataJson();

  return {
    backend: 'sqlite',

    readReportData() {
      let comparisons = listComparisonsStmt.all().map(mapComparisonRow);
      let initialized = getKey('report_initialized') === '1';

      if (!initialized && comparisons.length === 0) {
        return null;
      }

      let timestamp = Number(getKey('report_timestamp')) || Date.now();

      return {
        timestamp,
        comparisons,
        summary: buildSummary(comparisons),
      };
    },

    replaceReportData(reportData, detailsById = null) {
      replaceReportDataInternal(reportData, detailsById, true);
    },

    upsertComparison(comparison) {
      if (!comparison?.id || !comparison?.name || !comparison?.status) {
        throw new Error('Comparison must include id, name, and status');
      }

      let transaction = db.transaction(() => {
        let existing = getComparisonByIdStmt.get(comparison.id);
        let normalized = normalizeComparison(
          comparison,
          existing?.initial_status || comparison.initialStatus
        );
        upsertComparisonStmt.run(normalized);
        setReportInitialized(Date.now());
      });

      transaction();
      emitStateChanged(workingDir);
    },

    getComparisonByIdOrSignatureOrName(value) {
      let row = getComparisonByIdStmt.get(value);
      if (!row) {
        row = getComparisonBySignatureStmt.get(value);
      }
      if (!row) {
        row = getComparisonByNameStmt.get(value);
      }
      return mapComparisonRow(row);
    },

    upsertComparisonDetails(id, details) {
      upsertDetailsStmt.run(id, JSON.stringify(details || {}), Date.now());
    },

    getComparisonDetails(id) {
      let row = getDetailsStmt.get(id);
      if (!row) return null;
      return parseJson(row.details_json, null);
    },

    removeComparisonDetails(id) {
      deleteDetailsStmt.run(id);
    },

    deleteComparison(id) {
      let transaction = db.transaction(() => {
        deleteDetailsStmt.run(id);
        deleteComparisonStmt.run(id);
        setReportInitialized(Date.now());
      });

      transaction();
      emitStateChanged(workingDir);
    },

    resetReportData() {
      let transaction = db.transaction(() => {
        clearDetailsStmt.run();
        clearComparisonsStmt.run();
        setReportInitialized(Date.now());
      });

      transaction();
      emitStateChanged(workingDir);
    },

    getMetadata(key, fallback = null) {
      return getMetadataInternal(key, fallback);
    },

    getSchemaVersion() {
      return Number(getSchemaVersionStmt.get().version) || 0;
    },

    setMetadata(key, value) {
      setMetadataInternal(key, value, true);
    },

    removeMetadata(key) {
      return removeMetadataInternal(key, true);
    },

    getBaselineMetadata() {
      return getBaselineMetadata();
    },

    setBaselineMetadata(metadata) {
      setBaselineMetadata(metadata, true);
    },

    clearBaselineMetadata() {
      return clearBaselineMetadata(true);
    },

    removeBaselineScreenshot(signature) {
      return removeBaselineScreenshot(signature);
    },

    getHotspotBundle() {
      return getHotspotBundle();
    },

    getHotspotMetadata() {
      return getHotspotMetadata();
    },

    setHotspotMetadata(hotspotData, summary = {}) {
      setHotspotMetadata(hotspotData, summary, true);
    },

    clearHotspotMetadata() {
      return clearHotspotMetadata(true);
    },

    getRegionBundle() {
      return getRegionBundle();
    },

    getRegionMetadata() {
      return getRegionMetadata();
    },

    setRegionMetadata(regionData, summary = {}) {
      setRegionMetadata(regionData, summary, true);
    },

    clearRegionMetadata() {
      return clearRegionMetadata(true);
    },

    getBaselineBuildMetadata() {
      return getBaselineBuildMetadata();
    },

    setBaselineBuildMetadata(metadata) {
      setBaselineBuildMetadata(metadata, true);
    },

    clearBaselineBuildMetadata() {
      return clearBaselineBuildMetadata(true);
    },

    subscribe(listener) {
      return subscribeToStateChanges(workingDir, listener);
    },

    close() {
      try {
        db.close();
      } catch {
        // Ignore close errors
      }
    },
  };
}

export function createFileStateStore(options = {}) {
  let {
    workingDir = process.cwd(),
    existsSync: existsSyncImpl = existsSync,
    mkdirSync: mkdirSyncImpl = mkdirSync,
    readFileSync: readFileSyncImpl = readFileSync,
    writeFileSync: writeFileSyncImpl = writeFileSync,
    unlinkSync: unlinkSyncImpl = unlinkSync,
    joinPath = join,
  } = options;

  let reportPath = joinPath(workingDir, '.vizzly', 'report-data.json');
  let detailsPath = joinPath(workingDir, '.vizzly', 'comparison-details.json');
  let baselineMetadataPath = joinPath(
    workingDir,
    '.vizzly',
    'baselines',
    'metadata.json'
  );
  let hotspotMetadataPath = joinPath(workingDir, '.vizzly', 'hotspots.json');
  let regionMetadataPath = joinPath(workingDir, '.vizzly', 'regions.json');
  let baselineBuildMetadataPath = joinPath(
    workingDir,
    '.vizzly',
    'baseline-metadata.json'
  );

  function ensureDirectoryForFile(filePath) {
    let pathDirectory = dirname(filePath);
    if (!existsSyncImpl(pathDirectory)) {
      mkdirSyncImpl(pathDirectory, { recursive: true });
    }
  }

  function readJsonFile(filePath, fallback = null) {
    try {
      if (!existsSyncImpl(filePath)) {
        return fallback;
      }
      return JSON.parse(readFileSyncImpl(filePath, 'utf8'));
    } catch {
      return fallback;
    }
  }

  function writeJsonFile(filePath, value, pretty = false) {
    ensureDirectoryForFile(filePath);
    if (pretty) {
      writeFileSyncImpl(filePath, JSON.stringify(value, null, 2));
      return;
    }

    writeFileSyncImpl(filePath, JSON.stringify(value));
  }

  function removeFile(filePath) {
    try {
      if (!existsSyncImpl(filePath)) {
        return false;
      }
      unlinkSyncImpl(filePath);
      return true;
    } catch {
      return false;
    }
  }

  function readReportData() {
    if (!existsSyncImpl(reportPath)) {
      return null;
    }

    let data = readFileSyncImpl(reportPath, 'utf8');
    return JSON.parse(data);
  }

  function writeReportData(reportData) {
    ensureDirectoryForFile(reportPath);
    writeFileSyncImpl(reportPath, JSON.stringify(reportData));
    emitStateChanged(workingDir);
  }

  function readComparisonDetails() {
    return readJsonFile(detailsPath, {});
  }

  function writeComparisonDetails(details) {
    writeJsonFile(detailsPath, details, false);
  }

  function withSummary(reportData) {
    if (!reportData) return null;

    let comparisons = reportData.comparisons || [];
    return {
      ...reportData,
      comparisons,
      summary: buildSummary(comparisons),
      timestamp: reportData.timestamp || Date.now(),
    };
  }

  function getBaselineMetadata() {
    return readJsonFile(baselineMetadataPath, null);
  }

  function setBaselineMetadata(metadata) {
    writeJsonFile(baselineMetadataPath, metadata, true);
    emitStateChanged(workingDir);
  }

  function clearBaselineMetadata() {
    let removed = removeFile(baselineMetadataPath);
    if (removed) {
      emitStateChanged(workingDir);
    }
    return removed;
  }

  function removeBaselineScreenshot(signature) {
    if (!signature) {
      return false;
    }

    let metadata = getBaselineMetadata();
    if (!metadata || !Array.isArray(metadata.screenshots)) {
      return false;
    }

    let originalLength = metadata.screenshots.length;
    metadata.screenshots = metadata.screenshots.filter(
      screenshot => screenshot.signature !== signature
    );

    if (metadata.screenshots.length === originalLength) {
      return false;
    }

    setBaselineMetadata(metadata);
    return true;
  }

  function getHotspotBundle() {
    return normalizeHotspotBundle(readJsonFile(hotspotMetadataPath, null));
  }

  function getHotspotMetadata() {
    let bundle = getHotspotBundle();
    return bundle?.hotspots || null;
  }

  function setHotspotMetadata(hotspotData, summary = {}) {
    writeJsonFile(
      hotspotMetadataPath,
      {
        downloadedAt: new Date().toISOString(),
        summary,
        hotspots: hotspotData || {},
      },
      true
    );
    emitStateChanged(workingDir);
  }

  function clearHotspotMetadata() {
    let removed = removeFile(hotspotMetadataPath);
    if (removed) {
      emitStateChanged(workingDir);
    }
    return removed;
  }

  function getRegionBundle() {
    return normalizeRegionBundle(readJsonFile(regionMetadataPath, null));
  }

  function getRegionMetadata() {
    let bundle = getRegionBundle();
    return bundle?.regions || null;
  }

  function setRegionMetadata(regionData, summary = {}) {
    writeJsonFile(
      regionMetadataPath,
      {
        downloadedAt: new Date().toISOString(),
        summary,
        regions: regionData || {},
      },
      true
    );
    emitStateChanged(workingDir);
  }

  function clearRegionMetadata() {
    let removed = removeFile(regionMetadataPath);
    if (removed) {
      emitStateChanged(workingDir);
    }
    return removed;
  }

  function getBaselineBuildMetadata() {
    return readJsonFile(baselineBuildMetadataPath, null);
  }

  function setBaselineBuildMetadata(metadata) {
    writeJsonFile(baselineBuildMetadataPath, metadata, true);
    emitStateChanged(workingDir);
  }

  function clearBaselineBuildMetadata() {
    let removed = removeFile(baselineBuildMetadataPath);
    if (removed) {
      emitStateChanged(workingDir);
    }
    return removed;
  }

  function getMetadata(key, fallback = null) {
    switch (key) {
      case STATE_METADATA_KEYS.baseline:
        return getBaselineMetadata() ?? fallback;
      case STATE_METADATA_KEYS.hotspot:
        return getHotspotBundle() ?? fallback;
      case STATE_METADATA_KEYS.region:
        return getRegionBundle() ?? fallback;
      case STATE_METADATA_KEYS.baselineBuild:
        return getBaselineBuildMetadata() ?? fallback;
      default:
        return fallback;
    }
  }

  function setMetadata(key, value) {
    switch (key) {
      case STATE_METADATA_KEYS.baseline:
        setBaselineMetadata(value);
        return;
      case STATE_METADATA_KEYS.hotspot:
        setHotspotMetadata(value?.hotspots || value, value?.summary || {});
        return;
      case STATE_METADATA_KEYS.region:
        setRegionMetadata(value?.regions || value, value?.summary || {});
        return;
      case STATE_METADATA_KEYS.baselineBuild:
        setBaselineBuildMetadata(value);
        return;
      default:
        throw new Error(`Unknown metadata key: ${key}`);
    }
  }

  function removeMetadata(key) {
    switch (key) {
      case STATE_METADATA_KEYS.baseline:
        return clearBaselineMetadata();
      case STATE_METADATA_KEYS.hotspot:
        return clearHotspotMetadata();
      case STATE_METADATA_KEYS.region:
        return clearRegionMetadata();
      case STATE_METADATA_KEYS.baselineBuild:
        return clearBaselineBuildMetadata();
      default:
        return false;
    }
  }

  return {
    backend: 'file',

    readReportData() {
      return withSummary(readReportData());
    },

    replaceReportData(reportData, detailsById = null) {
      let normalized = withSummary({
        timestamp: reportData?.timestamp || Date.now(),
        comparisons: reportData?.comparisons || [],
      });

      writeReportData(normalized);

      if (detailsById && typeof detailsById === 'object') {
        writeComparisonDetails(detailsById);
      } else {
        writeComparisonDetails({});
      }
    },

    upsertComparison(comparison) {
      let reportData = readReportData() || {
        timestamp: Date.now(),
        comparisons: [],
        summary: { total: 0, passed: 0, failed: 0, errors: 0 },
      };

      if (!reportData.comparisons) {
        reportData.comparisons = [];
      }

      let existingIndex = reportData.comparisons.findIndex(
        item => item.id === comparison.id
      );

      if (existingIndex >= 0) {
        let initialStatus = reportData.comparisons[existingIndex].initialStatus;
        reportData.comparisons[existingIndex] = {
          ...comparison,
          initialStatus: initialStatus || comparison.status,
        };
      } else {
        reportData.comparisons.push({
          ...comparison,
          initialStatus: comparison.status,
        });
      }

      reportData.timestamp = Date.now();
      reportData.summary = buildSummary(reportData.comparisons);
      writeReportData(reportData);
    },

    getComparisonByIdOrSignatureOrName(value) {
      let reportData = readReportData();
      if (!reportData) return null;

      return (
        (reportData.comparisons || []).find(
          comparison =>
            comparison.id === value ||
            comparison.signature === value ||
            comparison.name === value
        ) || null
      );
    },

    upsertComparisonDetails(id, details) {
      let allDetails = readComparisonDetails();
      allDetails[id] = details;
      writeComparisonDetails(allDetails);
    },

    getComparisonDetails(id) {
      let allDetails = readComparisonDetails();
      return allDetails[id] || null;
    },

    removeComparisonDetails(id) {
      let allDetails = readComparisonDetails();
      delete allDetails[id];
      writeComparisonDetails(allDetails);
    },

    deleteComparison(id) {
      let reportData = readReportData();
      if (!reportData) {
        return;
      }

      reportData.comparisons = (reportData.comparisons || []).filter(
        comparison => comparison.id !== id
      );
      reportData.timestamp = Date.now();
      reportData.summary = buildSummary(reportData.comparisons);
      writeReportData(reportData);

      let allDetails = readComparisonDetails();
      delete allDetails[id];
      writeComparisonDetails(allDetails);
    },

    resetReportData() {
      writeReportData({
        timestamp: Date.now(),
        comparisons: [],
        summary: { total: 0, passed: 0, failed: 0, errors: 0 },
      });
      writeComparisonDetails({});
    },

    getMetadata,

    getSchemaVersion() {
      return 0;
    },
    setMetadata,
    removeMetadata,
    getBaselineMetadata,
    setBaselineMetadata,
    clearBaselineMetadata,
    removeBaselineScreenshot,
    getHotspotBundle,
    getHotspotMetadata,
    setHotspotMetadata,
    clearHotspotMetadata,
    getRegionBundle,
    getRegionMetadata,
    setRegionMetadata,
    clearRegionMetadata,
    getBaselineBuildMetadata,
    setBaselineBuildMetadata,
    clearBaselineBuildMetadata,

    subscribe(listener) {
      return subscribeToStateChanges(workingDir, listener);
    },

    close() {
      // No-op for file backend
    },
  };
}

export function createStateStore(options = {}) {
  let { backend = 'sqlite' } = options;

  if (backend === 'file') {
    return createFileStateStore(options);
  }

  return createSqliteStateStore(options);
}
