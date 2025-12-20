import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tdd } from '../../api/client.js';
import { queryKeys } from '../../lib/query-keys.js';
import { SSE_STATE, useReportDataSSE } from '../use-sse.js';

export function useReportData(options = {}) {
  // Use SSE for real-time updates (handles static mode internally)
  const { state: sseState } = useReportDataSSE({
    enabled: options.polling !== false,
  });

  // SSE is connected - it updates the cache directly, no polling needed
  // Fall back to polling only when SSE is not connected
  const sseConnected = sseState === SSE_STATE.CONNECTED;

  return useQuery({
    queryKey: queryKeys.reportData(),
    queryFn: tdd.getReportData,
    // Only poll as fallback when SSE is not connected
    refetchInterval: options.polling !== false && !sseConnected ? 2000 : false,
    ...options,
  });
}

export function useAcceptBaseline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: id => tdd.acceptBaseline(id),
    onMutate: async id => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.reportData() });
      // Optimistically update the comparison
      const previousData = queryClient.getQueryData(queryKeys.reportData());
      queryClient.setQueryData(queryKeys.reportData(), old => {
        if (!old?.comparisons) return old;
        return {
          ...old,
          comparisons: old.comparisons.map(c =>
            c.id === id || c.signature === id || c.name === id
              ? { ...c, userAction: 'accepted' }
              : c
          ),
        };
      });
      return { previousData };
    },
    onError: (_err, _id, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.reportData(), context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useAcceptAllBaselines() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tdd.acceptAllBaselines(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useResetBaselines() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tdd.resetBaselines(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useRejectBaseline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: id => tdd.rejectBaseline(id),
    onMutate: async id => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.reportData() });
      // Optimistically update the comparison
      const previousData = queryClient.getQueryData(queryKeys.reportData());
      queryClient.setQueryData(queryKeys.reportData(), old => {
        if (!old?.comparisons) return old;
        return {
          ...old,
          comparisons: old.comparisons.map(c =>
            c.id === id || c.signature === id || c.name === id
              ? { ...c, userAction: 'rejected' }
              : c
          ),
        };
      });
      return { previousData };
    },
    onError: (_err, _id, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.reportData(), context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useDeleteComparison() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: id => tdd.deleteComparison(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}
