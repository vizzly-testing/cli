import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tdd } from '../../api/client.js';
import { queryKeys } from '../../lib/query-keys.js';

/**
 * Check if we're in static mode (data embedded in HTML)
 */
function isStaticMode() {
  return typeof window !== 'undefined' && window.VIZZLY_STATIC_MODE === true;
}

/**
 * Get initial data from window if available
 */
function getInitialData() {
  if (typeof window !== 'undefined' && window.VIZZLY_REPORTER_DATA) {
    return window.VIZZLY_REPORTER_DATA;
  }
  return null;
}

export function useReportData(options = {}) {
  const initialData = getInitialData();
  const staticMode = isStaticMode();

  return useQuery({
    queryKey: queryKeys.reportData(),
    queryFn: async () => {
      // In static mode, return embedded data
      if (staticMode && initialData) {
        return initialData;
      }
      return tdd.getReportData();
    },
    // Use initial data if available
    initialData: initialData || undefined,
    // Don't poll in static mode
    refetchInterval: staticMode
      ? false
      : options.polling !== false
        ? 2000
        : false,
    // Don't refetch on window focus in static mode
    refetchOnWindowFocus: !staticMode,
    ...options,
  });
}

export function useTddStatus(options = {}) {
  const staticMode = isStaticMode();

  return useQuery({
    queryKey: queryKeys.status(),
    queryFn: tdd.getStatus,
    refetchInterval: staticMode
      ? false
      : options.polling !== false
        ? 1000
        : false,
    enabled: !staticMode, // Disable in static mode
    ...options,
  });
}

export function useAcceptBaseline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: id => {
      if (isStaticMode()) {
        throw new Error(
          'Cannot accept baselines in static report mode. Use the live dev server.'
        );
      }
      return tdd.acceptBaseline(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useAcceptAllBaselines() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (isStaticMode()) {
        throw new Error(
          'Cannot accept baselines in static report mode. Use the live dev server.'
        );
      }
      return tdd.acceptAllBaselines();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useResetBaselines() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (isStaticMode()) {
        throw new Error(
          'Cannot reset baselines in static report mode. Use the live dev server.'
        );
      }
      return tdd.resetBaselines();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useRejectBaseline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: id => {
      if (isStaticMode()) {
        throw new Error(
          'Cannot reject baselines in static report mode. Use the live dev server.'
        );
      }
      return tdd.rejectBaseline(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}
