import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tdd } from '../../api/client.js';
import { queryKeys } from '../../lib/query-keys.js';
import { SSE_STATE, useSSEState } from '../use-sse.js';

function asIdList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (value) {
    return [value];
  }

  return [];
}

function updateComparisonsUserAction(old, ids, userAction) {
  if (!old?.comparisons || ids.length === 0) {
    return old;
  }

  let idSet = new Set(ids);
  return {
    ...old,
    comparisons: old.comparisons.map(comparison => {
      let comparisonId = comparison.id;
      let signature = comparison.signature;
      let name = comparison.name;
      let matches =
        idSet.has(comparisonId) || idSet.has(signature) || idSet.has(name);

      return matches ? { ...comparison, userAction } : comparison;
    }),
  };
}

export function useComparison(id, options = {}) {
  return useQuery({
    queryKey: queryKeys.comparison(id),
    queryFn: () => tdd.getComparison(id),
    enabled: !!id,
    staleTime: 10_000,
    ...options,
  });
}

export function useReportData(options = {}) {
  let { polling = true, ...queryOptions } = options;

  // Read SSE state from the singleton provider
  let { state: sseState } = useSSEState();

  // SSE is connected - it updates the cache directly, no polling needed
  // Fall back to polling only when SSE is not connected
  let sseConnected = sseState === SSE_STATE.CONNECTED;

  return useQuery({
    queryKey: queryKeys.reportData(),
    queryFn: tdd.getReportData,
    // Only poll as fallback when SSE is not connected
    refetchInterval: polling !== false && !sseConnected ? 2000 : false,
    ...queryOptions,
  });
}

export function useAcceptBaseline() {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: id => tdd.acceptBaseline(id),
    onMutate: async id => {
      let ids = asIdList(id);

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.reportData() });

      // Optimistically update the comparison
      let previousData = queryClient.getQueryData(queryKeys.reportData());
      queryClient.setQueryData(queryKeys.reportData(), old =>
        updateComparisonsUserAction(old, ids, 'accepted')
      );
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
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tdd.acceptAllBaselines(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useResetBaselines() {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => tdd.resetBaselines(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useRejectBaseline() {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: id => tdd.rejectBaseline(id),
    onMutate: async id => {
      let ids = asIdList(id);

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.reportData() });

      // Optimistically update the comparison
      let previousData = queryClient.getQueryData(queryKeys.reportData());
      queryClient.setQueryData(queryKeys.reportData(), old =>
        updateComparisonsUserAction(old, ids, 'rejected')
      );
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

export function useAcceptBaselinesBatch() {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: ids => {
      let idList = asIdList(ids);
      return Promise.all(idList.map(id => tdd.acceptBaseline(id)));
    },
    onMutate: async ids => {
      let idList = asIdList(ids);

      await queryClient.cancelQueries({ queryKey: queryKeys.reportData() });

      let previousData = queryClient.getQueryData(queryKeys.reportData());
      queryClient.setQueryData(queryKeys.reportData(), old =>
        updateComparisonsUserAction(old, idList, 'accepted')
      );

      return { previousData };
    },
    onError: (_err, _ids, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.reportData(), context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useRejectBaselinesBatch() {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: ids => {
      let idList = asIdList(ids);
      return Promise.all(idList.map(id => tdd.rejectBaseline(id)));
    },
    onMutate: async ids => {
      let idList = asIdList(ids);

      await queryClient.cancelQueries({ queryKey: queryKeys.reportData() });

      let previousData = queryClient.getQueryData(queryKeys.reportData());
      queryClient.setQueryData(queryKeys.reportData(), old =>
        updateComparisonsUserAction(old, idList, 'rejected')
      );

      return { previousData };
    },
    onError: (_err, _ids, context) => {
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
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: id => tdd.deleteComparison(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}
