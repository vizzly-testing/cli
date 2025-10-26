import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchReportData, isStaticMode } from '../services/api-client.js';

export default function useReportData(initialData) {
  let [reportData, setReportData] = useState(initialData);
  let [loading, setLoading] = useState(!initialData);
  let [error, setError] = useState(null);
  let pollingIntervalRef = useRef(null);

  let refetch = useCallback(
    async (silent = false) => {
      // In static mode, data never changes - no need to refetch
      if (isStaticMode()) {
        return;
      }

      try {
        if (!silent) setLoading(true);
        let data = await fetchReportData();

        if (JSON.stringify(data) !== JSON.stringify(reportData)) {
          setReportData(data);
        }
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [reportData]
  );

  // Fetch initial data if not provided
  useEffect(() => {
    if (!initialData) {
      refetch();
    }
  }, [initialData, refetch]);

  // Simple polling every 2 seconds (only in live mode)
  useEffect(() => {
    if (!reportData || isStaticMode()) return;

    pollingIntervalRef.current = setInterval(() => {
      refetch(true); // Silent refetch
    }, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [reportData, refetch]);

  return {
    reportData,
    setReportData,
    loading,
    error,
    refetch,
  };
}
