import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../services/query-keys.js';
import { config } from './config.service.js';

export function useConfig(options = {}) {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: config.get,
    ...options,
  });
}

export function useUpdateProjectConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: config.updateProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config });
    },
  });
}
