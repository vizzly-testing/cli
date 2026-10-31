import { fetchJson } from '../../services/http-client.js';

export let auth = {
  /**
   * Get authentication status
   * @returns {Promise<{authenticated: boolean, user: Object|null}>}
   */
  async getStatus() {
    return fetchJson('/api/auth/status');
  },

  /**
   * Initiate device flow login
   * @returns {Promise<{deviceCode: string, userCode: string, verificationUri: string, expiresIn: number}>}
   */
  async initiateLogin() {
    return fetchJson('/api/auth/login', { method: 'POST' });
  },

  /**
   * Poll device authorization status
   * @param {string} deviceCode
   * @returns {Promise<{status: 'pending'|'complete', user?: Object}>}
   */
  async pollAuthorization(deviceCode) {
    return fetchJson('/api/auth/poll', {
      method: 'POST',
      body: JSON.stringify({ deviceCode }),
    });
  },

  /**
   * Logout user
   * @returns {Promise<Object>}
   */
  async logout() {
    return fetchJson('/api/auth/logout', { method: 'POST' });
  },
};
