import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 1000, // 5 seconds for TDD data
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
