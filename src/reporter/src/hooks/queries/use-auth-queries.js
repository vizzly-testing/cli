import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auth } from '../../api/client.js';
import { queryKeys } from '../../lib/query-keys.js';

export function useAuthStatus() {
  return useQuery({
    queryKey: queryKeys.authStatus(),
    queryFn: auth.getStatus,
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useInitiateLogin() {
  return useMutation({
    mutationFn: auth.initiateLogin,
  });
}

export function usePollAuthorization() {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: deviceCode => auth.pollAuthorization(deviceCode),
    onSuccess: data => {
      if (data.status === 'complete') {
        queryClient.invalidateQueries({ queryKey: queryKeys.auth });
        queryClient.invalidateQueries({ queryKey: queryKeys.cloud });
      }
    },
  });
}

export function useLogout() {
  let queryClient = useQueryClient();
  return useMutation({
    mutationFn: auth.logout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth });
      queryClient.invalidateQueries({ queryKey: queryKeys.cloud });
    },
  });
}
