import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projects, tdd } from '../../api/client.js';
import { queryKeys } from '../../lib/query-keys.js';

export function useProjects(options = {}) {
  return useQuery({
    queryKey: queryKeys.projects(),
    queryFn: projects.list,
    staleTime: 60 * 1000, // 1 minute
    ...options,
  });
}

export function useBuilds(orgSlug, projectSlug, options = {}) {
  return useQuery({
    queryKey: queryKeys.builds(orgSlug, projectSlug),
    queryFn: () => projects.getBuilds(orgSlug, projectSlug, { limit: 20 }),
    enabled: Boolean(orgSlug && projectSlug),
    staleTime: 30 * 1000,
    ...options,
  });
}

export function useDownloadBaselines() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ buildId, organizationSlug, projectSlug }) =>
      tdd.downloadBaselines(buildId, organizationSlug, projectSlug),
    onSuccess: () => {
      // Invalidate TDD data since baselines changed
      queryClient.invalidateQueries({ queryKey: queryKeys.tdd });
    },
  });
}
