/**
 * Events Router
 * Server-Sent Events endpoint for real-time dashboard updates
 */

import { existsSync, readFileSync, watch } from 'node:fs';
import { join } from 'node:path';

/**
 * Create events router for SSE
 * @param {Object} context - Router context
 * @param {string} context.workingDir - Working directory for report data
 * @returns {Function} Route handler
 */
export function createEventsRouter(context) {
  const { workingDir = process.cwd() } = context || {};
  const reportDataPath = join(workingDir, '.vizzly', 'report-data.json');
  const baselineMetadataPath = join(
    workingDir,
    '.vizzly',
    'baselines',
    'metadata.json'
  );

  /**
   * Read and parse baseline metadata, returning null on error
   */
  const readBaselineMetadata = () => {
    if (!existsSync(baselineMetadataPath)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(baselineMetadataPath, 'utf8'));
    } catch {
      return null;
    }
  };

  /**
   * Read and parse report data with baseline metadata included
   */
  const readReportData = () => {
    if (!existsSync(reportDataPath)) {
      return null;
    }
    try {
      const data = JSON.parse(readFileSync(reportDataPath, 'utf8'));
      // Include baseline metadata for stats view
      data.baseline = readBaselineMetadata();
      return data;
    } catch {
      return null;
    }
  };

  /**
   * Send SSE event to response
   */
  const sendEvent = (res, eventType, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  /**
   * Build a lookup map from comparisons array keyed by id
   */
  const buildComparisonMap = comparisons => {
    let map = new Map();
    for (let c of comparisons) {
      map.set(c.id, c);
    }
    return map;
  };

  /**
   * Compare two comparison objects to detect meaningful changes.
   * Returns true if any tracked field differs.
   */
  const comparisonChanged = (oldComp, newComp) => {
    return (
      oldComp.status !== newComp.status ||
      oldComp.diffPercentage !== newComp.diffPercentage ||
      oldComp.userAction !== newComp.userAction ||
      oldComp.timestamp !== newComp.timestamp ||
      oldComp.name !== newComp.name
    );
  };

  /**
   * Extract summary fields (everything except comparisons) for diffing
   */
  const extractSummary = data => {
    let { comparisons: _c, ...summary } = data;
    return summary;
  };

  /**
   * Check if summary-level fields changed between old and new data
   */
  const summaryChanged = (oldData, newData) => {
    let oldSummary = extractSummary(oldData);
    let newSummary = extractSummary(newData);
    return JSON.stringify(oldSummary) !== JSON.stringify(newSummary);
  };

  /**
   * Send incremental updates by diffing old vs new report data.
   * Returns true if any events were sent.
   */
  const sendIncrementalUpdates = (res, oldData, newData) => {
    let sent = false;
    let oldComparisons = oldData.comparisons || [];
    let newComparisons = newData.comparisons || [];

    let oldMap = buildComparisonMap(oldComparisons);
    let newMap = buildComparisonMap(newComparisons);

    // New or changed comparisons
    for (let [id, newComp] of newMap) {
      let oldComp = oldMap.get(id);
      if (!oldComp || comparisonChanged(oldComp, newComp)) {
        sendEvent(res, 'comparisonUpdate', newComp);
        sent = true;
      }
    }

    // Removed comparisons
    for (let [id] of oldMap) {
      if (!newMap.has(id)) {
        sendEvent(res, 'comparisonRemoved', { id });
        sent = true;
      }
    }

    // Summary-level changes (total, passed, failed, etc.)
    if (summaryChanged(oldData, newData)) {
      sendEvent(res, 'summaryUpdate', extractSummary(newData));
      sent = true;
    }

    return sent;
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
    let lastSentData = readReportData();
    if (lastSentData) {
      sendEvent(res, 'reportData', lastSentData);
    }

    // Debounce file change events (fs.watch can fire multiple times)
    let debounceTimer = null;
    let watcher = null;

    const sendUpdate = () => {
      const newData = readReportData();
      if (!newData) return;

      if (!lastSentData) {
        // No previous data — send full payload
        sendEvent(res, 'reportData', newData);
      } else {
        // Diff and send incremental updates
        let sent = sendIncrementalUpdates(res, lastSentData, newData);
        // If nothing changed, skip (no event needed)
        if (!sent) return;
      }
      lastSentData = newData;
    };

    // Watch for file changes
    const vizzlyDir = join(workingDir, '.vizzly');
    if (existsSync(vizzlyDir)) {
      try {
        watcher = watch(
          vizzlyDir,
          { recursive: false },
          (_eventType, filename) => {
            // Only react to report-data.json changes
            if (filename === 'report-data.json') {
              // Debounce: wait 100ms after last change before sending
              if (debounceTimer) {
                clearTimeout(debounceTimer);
              }
              debounceTimer = setTimeout(sendUpdate, 100);
            }
          }
        );
      } catch {
        // File watching not available, client will fall back to polling
      }
    }

    // Heartbeat to keep connection alive (every 30 seconds)
    const heartbeatInterval = setInterval(() => {
      if (!res.writableEnded) {
        sendEvent(res, 'heartbeat', { timestamp: Date.now() });
      }
    }, 30000);

    // Cleanup on connection close
    const cleanup = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      clearInterval(heartbeatInterval);
      if (watcher) {
        watcher.close();
      }
    };

    req.on('close', cleanup);
    req.on('error', cleanup);

    return true;
  };
}
