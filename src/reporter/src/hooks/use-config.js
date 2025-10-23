import { useState, useEffect, useCallback } from 'react';

export default function useConfig() {
  let [config, setConfig] = useState(null);
  let [loading, setLoading] = useState(true);
  let [error, setError] = useState(null);
  let [saving, setSaving] = useState(false);

  let fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let response = await fetch('/api/config');
      if (!response.ok) {
        throw new Error('Failed to fetch config');
      }
      let data = await response.json();
      setConfig(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  let updateConfig = useCallback(async (scope, updates) => {
    setSaving(true);
    setError(null);
    try {
      let response = await fetch(`/api/config/${scope}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        let errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update config');
      }

      let data = await response.json();

      // Refetch the full config to get updated merged view
      await fetchConfig();

      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [fetchConfig]);

  let validateConfig = useCallback(async (configData) => {
    try {
      let response = await fetch('/api/config/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData),
      });

      if (!response.ok) {
        throw new Error('Failed to validate config');
      }

      return await response.json();
    } catch (err) {
      console.error('Validation error:', err);
      return { valid: false, errors: [{ message: err.message }] };
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return {
    config,
    loading,
    error,
    saving,
    refetch: fetchConfig,
    updateConfig,
    validateConfig,
  };
}
