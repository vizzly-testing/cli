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

    // Send initial data immediately
    const initialData = readReportData();
    if (initialData) {
      sendEvent(res, 'reportData', initialData);
    }

    // Debounce file change events (fs.watch can fire multiple times)
    let debounceTimer = null;
    let watcher = null;

    const sendUpdate = () => {
      const data = readReportData();
      if (data) {
        sendEvent(res, 'reportData', data);
      }
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
