import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tdd } from '../../api/client.js';
import { queryKeys } from '../../lib/query-keys.js';

export function useReportData(options = {}) {
  return useQuery({
    queryKey: queryKeys.reportData(),
    queryFn: tdd.getReportData,
    // Poll every 2 seconds by default
    refetchInterval: options.polling !== false ? 2000 : false,
    ...options,
  });
}

export function useTddStatus(options = {}) {
  return useQuery({
    queryKey: queryKeys.status(),
    queryFn: tdd.getStatus,
    refetchInterval: options.polling !== false ? 1000 : false,
    ...options,
  });
}

export function useAcceptBaseline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: id => tdd.acceptBaseline(id),
    onSuccess: () => {
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
    onSuccess: () => {
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
