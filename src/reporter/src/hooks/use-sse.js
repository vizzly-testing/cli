import { useContext } from 'react';
import { SSE_STATE, SSEContext } from '../providers/sse-provider.jsx';

// Re-export for consumers that import SSE_STATE from here
export { SSE_STATE };

/**
 * Read SSE connection state from the singleton provider.
 * @returns {{ state: string, error: Error|null }}
 */
export function useSSEState() {
  return useContext(SSEContext);
}
