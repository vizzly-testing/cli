/**
 * Events Router
 * Server-Sent Events endpoint for real-time dashboard updates
 */

import { existsSync, readFileSync, statSync, watch } from 'node:fs';
import { join } from 'node:path';

let FILE_WATCH_DEBOUNCE_MS = 25;
let FILE_POLL_INTERVAL_MS = 50;
let REPORT_READ_RETRY_MS = 25;
let MAX_REPORT_READ_RETRIES = 3;

let defaultTimers = {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
};

/**
 * Read and parse JSON from disk, returning null on missing or invalid files.
 */
export function readJsonFile(path) {
  if (!existsSync(path)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Read report data and attach baseline metadata for the stats view.
 */
export function readReportDataFile({ reportDataPath, baselineMetadataPath }) {
  let data = readJsonFile(reportDataPath);
  if (!data) {
    return null;
  }

  return {
    ...data,
    baseline: readJsonFile(baselineMetadataPath),
  };
}

/**
 * Build a lookup map from comparisons array keyed by id
 */
function buildComparisonMap(comparisons) {
  let map = new Map();
  for (let c of comparisons) {
    map.set(c.id, c);
  }
  return map;
}

function comparisonChanged(oldComp, newComp) {
  return JSON.stringify(oldComp) !== JSON.stringify(newComp);
}

/**
 * Extract summary fields (everything except comparisons) for diffing
 */
function extractSummary(data) {
  let { comparisons: _c, ...summary } = data;
  return summary;
}

/**
 * Check if summary-level fields changed between old and new data
 */
function summaryChanged(oldData, newData) {
  let oldSummary = extractSummary(oldData);
  let newSummary = extractSummary(newData);
  return JSON.stringify(oldSummary) !== JSON.stringify(newSummary);
}

/**
 * Build incremental SSE events by diffing old vs new report data.
 */
export function buildReportDataEvents(oldData, newData) {
  if (!oldData) {
    return [{ type: 'reportData', data: newData }];
  }

  let events = [];
  let oldComparisons = oldData.comparisons || [];
  let newComparisons = newData.comparisons || [];

  let oldMap = buildComparisonMap(oldComparisons);
  let newMap = buildComparisonMap(newComparisons);

  // New or changed comparisons send the full comparison object, not a partial delta.
  for (let [id, newComp] of newMap) {
    let oldComp = oldMap.get(id);
    if (!oldComp || comparisonChanged(oldComp, newComp)) {
      events.push({ type: 'comparisonUpdate', data: newComp });
    }
  }

  for (let [id] of oldMap) {
    if (!newMap.has(id)) {
      events.push({ type: 'comparisonRemoved', data: { id } });
    }
  }

  if (summaryChanged(oldData, newData)) {
    events.push({ type: 'summaryUpdate', data: extractSummary(newData) });
  }

  return events;
}

/**
 * Watch report-data.json with fs.watch plus a lightweight mtime fallback.
 */
export function watchReportDataFile({
  workingDir,
  reportDataPath,
  onReportDataChanged,
  timers = defaultTimers,
}) {
  let watcher = null;
  let filePollInterval = null;
  let vizzlyDir = join(workingDir, '.vizzly');

  if (existsSync(vizzlyDir)) {
    try {
      watcher = watch(
        vizzlyDir,
        { recursive: false },
        (_eventType, filename) => {
          // Some platforms occasionally omit the filename for directory watch
          // events. In that case, fall back to re-reading report data.
          if (!filename || filename === 'report-data.json') {
            onReportDataChanged();
          }
        }
      );
      watcher.on('error', () => {
        if (watcher) {
          watcher.close();
          watcher = null;
        }
      });
    } catch {
      // File watching not available, mtime polling remains as fallback.
    }
  }

  let lastPolledMtime = existsSync(reportDataPath)
    ? statSync(reportDataPath).mtimeMs
    : null;

  filePollInterval = timers.setInterval(() => {
    let nextMtime = null;
    if (existsSync(reportDataPath)) {
      try {
        nextMtime = statSync(reportDataPath).mtimeMs;
      } catch {
        nextMtime = null;
      }
    }
    if (nextMtime !== lastPolledMtime) {
      lastPolledMtime = nextMtime;
      onReportDataChanged();
    }
  }, FILE_POLL_INTERVAL_MS);

  return () => {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    if (filePollInterval) {
      timers.clearInterval(filePollInterval);
      filePollInterval = null;
    }
  };
}

/**
 * Create events router for SSE
 * @param {Object} context - Router context
 * @param {string} context.workingDir - Working directory for report data
 * @returns {Function} Route handler
 */
export function createEventsRouter(context) {
  let {
    workingDir = process.cwd(),
    readReportData = readReportDataFile,
    watchReportData = watchReportDataFile,
    timers = defaultTimers,
  } = context || {};
  let reportDataPath = join(workingDir, '.vizzly', 'report-data.json');
  let baselineMetadataPath = join(
    workingDir,
    '.vizzly',
    'baselines',
    'metadata.json'
  );

  /**
   * Send SSE event to response
   */
  let sendEvent = (res, eventType, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  return async function handleEventsRoute(req, res, pathname) {
    if (req.method !== 'GET' || pathname !== '/api/events') {
      return false;
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial full data immediately
    let lastSentData = readReportData({ reportDataPath, baselineMetadataPath });
    if (lastSentData) {
      sendEvent(res, 'reportData', lastSentData);
    }

    // Debounce file change events (fs.watch can fire multiple times)
    let debounceTimer = null;

    let scheduleUpdate = () => {
      if (debounceTimer) {
        timers.clearTimeout(debounceTimer);
      }
      debounceTimer = timers.setTimeout(sendUpdate, FILE_WATCH_DEBOUNCE_MS);
    };
    let sendUpdate = (retryCount = 0) => {
      let newData = readReportData({ reportDataPath, baselineMetadataPath });
      if (!newData) {
        if (
          existsSync(reportDataPath) &&
          retryCount < MAX_REPORT_READ_RETRIES
        ) {
          debounceTimer = timers.setTimeout(
            () => sendUpdate(retryCount + 1),
            REPORT_READ_RETRY_MS
          );
        }
        return;
      }

      let events = buildReportDataEvents(lastSentData, newData);
      if (events.length === 0) {
        return;
      }

      for (let event of events) {
        sendEvent(res, event.type, event.data);
      }
      lastSentData = newData;
    };

    let cleanupReportWatcher = watchReportData({
      workingDir,
      reportDataPath,
      onReportDataChanged: scheduleUpdate,
      timers,
    });

    // Heartbeat to keep connection alive (every 30 seconds)
    let heartbeatInterval = timers.setInterval(() => {
      if (!res.writableEnded) {
        sendEvent(res, 'heartbeat', { timestamp: Date.now() });
      }
    }, 30000);

    // Cleanup on connection close
    let cleanup = () => {
      if (debounceTimer) {
        timers.clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      timers.clearInterval(heartbeatInterval);
      cleanupReportWatcher();
    };

    req.on('close', cleanup);
    req.on('error', cleanup);

    return true;
  };
}
