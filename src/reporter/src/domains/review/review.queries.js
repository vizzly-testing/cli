import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../services/query-keys.js';
import { SSE_STATE, useSSEState } from '../../services/use-sse.js';
import {
  asIdList,
  restoreComparisonsFromPrevious,
  runBatchMutation,
  updateComparisonsUserAction,
} from './batch-mutations.js';
import { review } from './review.service.js';

function rollbackBatchMutationError(queryClient, context, error) {
  if (!context?.previousData) {
    return;
  }

  let failedIds = asIdList(error?.failedIds);
  let succeededIds = asIdList(error?.succeededIds);
  let hasPartialSuccess = failedIds.length > 0 && succeededIds.length > 0;

  if (hasPartialSuccess) {
    queryClient.setQueryData(queryKeys.reportData(), old =>
      restoreComparisonsFromPrevious(old, context.previousData, failedIds)
    );
    return;
  }

  queryClient.setQueryData(queryKeys.reportData(), context.previousData);
}

export function useComparison(id, options = {}) {
  return useQuery({
    queryKey: queryKeys.comparison(id),
    queryFn: () => review.getComparison(id),
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
    queryFn: review.getReportData,
    // Only poll as fallback when SSE is not connected
    refetchInterval: polling !== false && !sseConnected ? 2000 : false,
    ...queryOptions,
  });
}

export function useAcceptBaseline() {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: id => review.acceptBaseline(id),
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
    mutationFn: () => review.acceptAllBaselines(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useResetBaselines() {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => review.resetBaselines(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useRejectBaseline() {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: id => review.rejectBaseline(id),
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
    mutationFn: ids =>
      runBatchMutation(ids, id => review.acceptBaseline(id), 'accept'),
    onMutate: async ids => {
      let idList = asIdList(ids);

      await queryClient.cancelQueries({ queryKey: queryKeys.reportData() });

      let previousData = queryClient.getQueryData(queryKeys.reportData());
      queryClient.setQueryData(queryKeys.reportData(), old =>
        updateComparisonsUserAction(old, idList, 'accepted')
      );

      return { previousData };
    },
    onError: (error, _ids, context) => {
      rollbackBatchMutationError(queryClient, context, error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useRejectBaselinesBatch() {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: ids =>
      runBatchMutation(ids, id => review.rejectBaseline(id), 'reject'),
    onMutate: async ids => {
      let idList = asIdList(ids);

      await queryClient.cancelQueries({ queryKey: queryKeys.reportData() });

      let previousData = queryClient.getQueryData(queryKeys.reportData());
      queryClient.setQueryData(queryKeys.reportData(), old =>
        updateComparisonsUserAction(old, idList, 'rejected')
      );

      return { previousData };
    },
    onError: (error, _ids, context) => {
      rollbackBatchMutationError(queryClient, context, error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useDeleteComparison() {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: id => review.deleteComparison(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}
