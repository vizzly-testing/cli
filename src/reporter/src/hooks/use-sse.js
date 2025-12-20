import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { isStaticMode } from '../api/client.js';
import { queryKeys } from '../lib/query-keys.js';

/**
 * SSE connection states
 */
export const SSE_STATE = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',
};

/**
 * Hook to manage SSE connection for real-time report data updates
 * @param {Object} options
 * @param {boolean} [options.enabled=true] - Whether SSE should be enabled
 * @returns {{ state: string, error: Error|null }}
 */
export function useReportDataSSE(options = {}) {
  // Compute enabled state once, accounting for static mode
  const shouldEnable = !isStaticMode() && (options.enabled ?? true);

  const queryClient = useQueryClient();
  const eventSourceRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);

  const [state, setState] = useState(SSE_STATE.DISCONNECTED);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!shouldEnable) {
      // Clean up if disabled
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setState(SSE_STATE.DISCONNECTED);
      return;
    }

    const connect = () => {
      // Don't reconnect if already connected or connecting
      // EventSource.CLOSED (2) is well-supported in all modern browsers
      if (eventSourceRef.current && eventSourceRef.current.readyState !== 2) {
        return;
      }

      setState(SSE_STATE.CONNECTING);
      setError(null);

      const eventSource = new EventSource('/api/events');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setState(SSE_STATE.CONNECTED);
        setError(null);
        reconnectAttemptRef.current = 0;
      };

      eventSource.addEventListener('reportData', event => {
        try {
          const data = JSON.parse(event.data);
          // Update React Query cache directly
          queryClient.setQueryData(queryKeys.reportData(), data);
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.addEventListener('heartbeat', () => {
        // Heartbeat received - connection is alive
      });

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        setState(SSE_STATE.ERROR);
        setError(new Error('SSE connection failed'));

        // Exponential backoff for reconnection (max 30 seconds)
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(1000 * 2 ** attempt, 30000);
        reconnectAttemptRef.current = attempt + 1;

        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setState(SSE_STATE.DISCONNECTED);
    };
  }, [shouldEnable, queryClient]);

  return { state, error };
}
