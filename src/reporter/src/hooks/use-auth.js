import { useState, useEffect, useCallback } from 'react';

export default function useAuth() {
  let [user, setUser] = useState(null);
  let [authenticated, setAuthenticated] = useState(false);
  let [loading, setLoading] = useState(true);
  let [error, setError] = useState(null);

  let fetchAuthStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let response = await fetch('/api/auth/status');
      if (!response.ok) {
        throw new Error('Failed to fetch auth status');
      }
      let data = await response.json();
      setAuthenticated(data.authenticated);
      setUser(data.user);
    } catch (err) {
      setError(err.message);
      setAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  let initiateLogin = useCallback(async () => {
    try {
      let response = await fetch('/api/auth/login', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to initiate login');
      }
      return await response.json();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  let pollAuthorization = useCallback(async deviceCode => {
    try {
      let response = await fetch('/api/auth/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceCode }),
      });

      if (!response.ok) {
        throw new Error('Failed to poll authorization');
      }

      return await response.json();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  let logout = useCallback(async () => {
    try {
      let response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to logout');
      }
      setAuthenticated(false);
      setUser(null);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchAuthStatus();
  }, [fetchAuthStatus]);

  return {
    user,
    authenticated,
    loading,
    error,
    refetch: fetchAuthStatus,
    initiateLogin,
    pollAuthorization,
    logout,
  };
}
