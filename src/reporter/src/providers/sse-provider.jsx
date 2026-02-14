import { useQueryClient } from '@tanstack/react-query';
import { createContext, useEffect, useRef, useState } from 'react';
import { queryKeys } from '../lib/query-keys.js';

export let SSE_STATE = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',
};

export let SSEContext = createContext({
  state: SSE_STATE.DISCONNECTED,
  error: null,
});

/**
 * Singleton SSE provider — manages one EventSource connection for the entire app.
 * Updates React Query cache on reportData, comparisonUpdate, comparisonRemoved,
 * and summaryUpdate events.
 */
export function SSEProvider({ enabled = true, children }) {
  let queryClient = useQueryClient();
  let eventSourceRef = useRef(null);
  let reconnectAttemptRef = useRef(0);
  let reconnectTimerRef = useRef(null);

  let [state, setState] = useState(SSE_STATE.DISCONNECTED);
  let [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setState(SSE_STATE.DISCONNECTED);
      return;
    }

    let connect = () => {
      // EventSource.CLOSED === 2
      if (eventSourceRef.current && eventSourceRef.current.readyState !== 2) {
        return;
      }

      setState(SSE_STATE.CONNECTING);
      setError(null);

      let eventSource = new EventSource('/api/events');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setState(SSE_STATE.CONNECTED);
        setError(null);
        reconnectAttemptRef.current = 0;
      };

      // Full report data — sent on initial connection
      eventSource.addEventListener('reportData', event => {
        try {
          let data = JSON.parse(event.data);
          queryClient.setQueryData(queryKeys.reportData(), data);
        } catch {
          // Ignore parse errors
        }
      });

      // Incremental: single comparison added or changed
      eventSource.addEventListener('comparisonUpdate', event => {
        try {
          let comparison = JSON.parse(event.data);
          queryClient.setQueryData(queryKeys.reportData(), old => {
            if (!old) return old;
            let comparisons = old.comparisons || [];
            let idx = comparisons.findIndex(c => c.id === comparison.id);
            if (idx >= 0) {
              comparisons = comparisons.map((c, i) =>
                i === idx ? { ...c, ...comparison } : c
              );
            } else {
              comparisons = [...comparisons, comparison];
            }
            return { ...old, comparisons };
          });
        } catch {
          // Ignore parse errors
        }
      });

      // Incremental: comparison removed
      eventSource.addEventListener('comparisonRemoved', event => {
        try {
          let { id } = JSON.parse(event.data);
          queryClient.setQueryData(queryKeys.reportData(), old => {
            if (!old?.comparisons) return old;
            return {
              ...old,
              comparisons: old.comparisons.filter(c => c.id !== id),
            };
          });
        } catch {
          // Ignore parse errors
        }
      });

      // Incremental: summary fields changed
      eventSource.addEventListener('summaryUpdate', event => {
        try {
          let summary = JSON.parse(event.data);
          queryClient.setQueryData(queryKeys.reportData(), old => {
            if (!old) return old;
            return { ...old, ...summary, comparisons: old.comparisons };
          });
        } catch {
          // Ignore parse errors
        }
      });

      eventSource.addEventListener('heartbeat', () => {
        // Connection alive
      });

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        setState(SSE_STATE.ERROR);
        setError(new Error('SSE connection failed'));

        let attempt = reconnectAttemptRef.current;
        let delay = Math.min(1000 * 2 ** attempt, 30000);
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
  }, [enabled, queryClient]);

  return (
    <SSEContext.Provider value={{ state, error }}>
      {children}
    </SSEContext.Provider>
  );
}
