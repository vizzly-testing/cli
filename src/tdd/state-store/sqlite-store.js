import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { STATE_METADATA_KEYS } from './constants.js';
import { emitStateChanged, subscribeToStateChanges } from './events.js';
import { applySchemaMigrations } from './migrations.js';
import {
  buildSummary,
  hasReportData,
  mapComparisonRow,
  normalizeComparison,
  normalizeHotspotBundle,
  normalizeRegionBundle,
  parseJson,
} from './utils.js';

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
