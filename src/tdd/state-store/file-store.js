import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { STATE_METADATA_KEYS } from './constants.js';
import { emitStateChanged, subscribeToStateChanges } from './events.js';
import {
  buildSummary,
  normalizeHotspotBundle,
  normalizeRegionBundle,
} from './utils.js';

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
