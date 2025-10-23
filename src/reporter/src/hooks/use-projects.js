import { useState, useEffect, useCallback } from 'react';

export default function useProjects() {
  let [projects, setProjects] = useState([]);
  let [mappings, setMappings] = useState([]);
  let [recentBuilds, setRecentBuilds] = useState([]);
  let [loading, setLoading] = useState(true);
  let [error, setError] = useState(null);

  let fetchProjects = useCallback(async () => {
    try {
      let response = await fetch('/api/projects');
      if (!response.ok) {
        // Silently fail if not authenticated - this is expected
        if (response.status === 503 || response.status === 400) {
          return;
        }
        throw new Error('Failed to fetch projects');
      }
      let data = await response.json();
      setProjects(data.projects || []);
    } catch (err) {
      // Don't log errors for unauthenticated users
      if (!err.message.includes('503')) {
        console.error('Error fetching projects:', err);
      }
    }
  }, []);

  let fetchMappings = useCallback(async () => {
    try {
      let response = await fetch('/api/projects/mappings');
      if (!response.ok) {
        // Silently fail if service unavailable
        if (response.status === 503) {
          return;
        }
        throw new Error('Failed to fetch mappings');
      }
      let data = await response.json();
      setMappings(data.mappings || []);
    } catch (err) {
      // Silently handle - mappings work without auth
    }
  }, []);

  let fetchRecentBuilds = useCallback(async (limit = 10) => {
    try {
      let response = await fetch(`/api/builds/recent?limit=${limit}`);
      if (!response.ok) {
        // Silently fail - recent builds require project config
        return;
      }
      let data = await response.json();
      setRecentBuilds(data.builds || []);
    } catch (err) {
      // Silently handle - builds are optional
    }
  }, []);

  let createMapping = useCallback(async (directory, projectSlug, organizationSlug, token, projectName) => {
    try {
      let response = await fetch('/api/projects/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory, projectSlug, organizationSlug, token, projectName }),
      });

      if (!response.ok) {
        let errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create mapping');
      }

      let data = await response.json();
      await fetchMappings(); // Refresh mappings
      return data.mapping;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchMappings]);

  let deleteMapping = useCallback(async (directory) => {
    try {
      let response = await fetch(`/api/projects/mappings/${encodeURIComponent(directory)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        let errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete mapping');
      }

      await fetchMappings(); // Refresh mappings
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchMappings]);

  let fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([
      fetchProjects(),
      fetchMappings(),
      fetchRecentBuilds(),
    ]);
    setLoading(false);
  }, [fetchProjects, fetchMappings, fetchRecentBuilds]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    projects,
    mappings,
    recentBuilds,
    loading,
    error,
    refetch: fetchAll,
    createMapping,
    deleteMapping,
  };
}
