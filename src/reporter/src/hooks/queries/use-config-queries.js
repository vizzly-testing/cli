import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { config } from '../../api/client.js';
import { queryKeys } from '../../lib/query-keys.js';

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
