import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { config } from '../../api/client.js';
import { queryKeys } from '../../lib/query-keys.js';

export function useConfig(options = {}) {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: config.get,
    ...options,
  });
}

export function useProjectConfig(options = {}) {
  return useQuery({
    queryKey: queryKeys.projectConfig(),
    queryFn: config.getProject,
    ...options,
  });
}

export function useGlobalConfig(options = {}) {
  return useQuery({
    queryKey: queryKeys.globalConfig(),
    queryFn: config.getGlobal,
    ...options,
  });
}

export function useUpdateProjectConfig() {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: config.updateProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config });
    },
  });
}

export function useUpdateGlobalConfig() {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: config.updateGlobal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config });
    },
  });
}

export function useValidateConfig() {
  return useMutation({
    mutationFn: config.validate,
  });
}
