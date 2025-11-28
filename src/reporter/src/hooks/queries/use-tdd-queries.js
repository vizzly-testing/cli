import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  let initialData = getInitialData();
  let staticMode = isStaticMode();

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
  let staticMode = isStaticMode();

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
  let queryClient = useQueryClient();
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
  let queryClient = useQueryClient();
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
  let queryClient = useQueryClient();
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
  // Rejection in TDD mode is essentially "don't accept" - the default state
  // This is a no-op mutation that could be extended for logging or future features
  return useMutation({
    mutationFn: async id => {
      if (isStaticMode()) {
        throw new Error(
          'Cannot reject baselines in static report mode. Use the live dev server.'
        );
      }
      // Rejection is a no-op in TDD mode - it just means "keep the current baseline"
      console.log(`Rejected comparison: ${id}`);
      return { success: true, id };
    },
  });
}
