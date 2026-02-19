/**
 * Events Router
 * Server-Sent Events endpoint for real-time dashboard updates
 */

import { createStateStore } from '../../tdd/state-store.js';

/**
 * Create events router for SSE
 * @param {Object} context - Router context
 * @param {string} context.workingDir - Working directory for report data
 * @returns {Function} Route handler
 */
export function createEventsRouter(context) {
  let { workingDir = process.cwd() } = context || {};

  /**
   * Read and parse report data with baseline metadata included
   */
  let readReportData = stateStore => {
    let data = stateStore.readReportData();
    if (!data) {
      return null;
    }

    data.baseline = stateStore.getBaselineMetadata();
    return data;
  };

  /**
   * Send SSE event to response
   */
  let sendEvent = (res, eventType, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  /**
   * Build a lookup map from comparisons array keyed by id
   */
  let buildComparisonMap = comparisons => {
    let map = new Map();
    for (let c of comparisons) {
      map.set(c.id, c);
    }
    return map;
  };

  let comparisonChanged = (oldComp, newComp) => {
    return JSON.stringify(oldComp) !== JSON.stringify(newComp);
  };

  /**
   * Extract summary fields (everything except comparisons) for diffing
   */
  let extractSummary = data => {
    let { comparisons: _c, ...summary } = data;
    return summary;
  };

  /**
   * Check if summary-level fields changed between old and new data
   */
  let summaryChanged = (oldData, newData) => {
    let oldSummary = extractSummary(oldData);
    let newSummary = extractSummary(newData);
    return JSON.stringify(oldSummary) !== JSON.stringify(newSummary);
  };

  /**
   * Send incremental updates by diffing old vs new report data.
   * Returns true if any events were sent.
   */
  let sendIncrementalUpdates = (res, oldData, newData) => {
    let sent = false;
    let oldComparisons = oldData.comparisons || [];
    let newComparisons = newData.comparisons || [];

    let oldMap = buildComparisonMap(oldComparisons);
    let newMap = buildComparisonMap(newComparisons);

    // New or changed comparisons — sends the full comparison object, not a partial delta
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

    let stateStore = createStateStore({ workingDir });

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial full data immediately
    let lastSentData = readReportData(stateStore);
    if (lastSentData) {
      sendEvent(res, 'reportData', lastSentData);
    }

    let closed = false;
    let updateQueued = false;

    let sendUpdate = () => {
      let newData = readReportData(stateStore);
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

    let queueUpdate = () => {
      if (closed || updateQueued) {
        return;
      }

      updateQueued = true;
      queueMicrotask(() => {
        updateQueued = false;
        if (closed) return;
        sendUpdate();
      });
    };

    let unsubscribe = stateStore.subscribe(queueUpdate);

    // Heartbeat to keep connection alive (every 30 seconds)
    let heartbeatInterval = setInterval(() => {
      if (!res.writableEnded) {
        sendEvent(res, 'heartbeat', { timestamp: Date.now() });
      }
    }, 30000);

    // Cleanup on connection close
    let cleanup = () => {
      closed = true;
      clearInterval(heartbeatInterval);
      unsubscribe();
      stateStore.close();
    };

    req.on('close', cleanup);
    req.on('error', cleanup);

    return true;
  };
}
