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

function rollbackReviewMutation(queryClient, context) {
  if (context?.previousData) {
    queryClient.setQueryData(queryKeys.reportData(), context.previousData);
  }
}

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

  rollbackReviewMutation(queryClient, context);
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

function useReviewMutation({
  mutationFn,
  userAction,
  rollback = rollbackReviewMutation,
}) {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async value => {
      let ids = asIdList(value);
      await queryClient.cancelQueries({ queryKey: queryKeys.reportData() });
      let previousData = queryClient.getQueryData(queryKeys.reportData());
      queryClient.setQueryData(queryKeys.reportData(), old =>
        updateComparisonsUserAction(old, ids, userAction)
      );
      return { previousData };
    },
    onError: (error, _value, context) => {
      rollback(queryClient, context, error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}

export function useAcceptBaseline() {
  return useReviewMutation({
    mutationFn: id => review.acceptBaseline(id),
    userAction: 'accepted',
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
  return useReviewMutation({
    mutationFn: id => review.rejectBaseline(id),
    userAction: 'rejected',
  });
}

export function useAcceptBaselinesBatch() {
  return useReviewMutation({
    mutationFn: ids =>
      runBatchMutation(ids, id => review.acceptBaseline(id), 'accept'),
    userAction: 'accepted',
    rollback: rollbackBatchMutationError,
  });
}

export function useRejectBaselinesBatch() {
  return useReviewMutation({
    mutationFn: ids =>
      runBatchMutation(ids, id => review.rejectBaseline(id), 'reject'),
    userAction: 'rejected',
    rollback: rollbackBatchMutationError,
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
