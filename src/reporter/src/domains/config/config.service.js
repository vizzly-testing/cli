import { fetchJson } from '../../services/http-client.js';

export let config = {
  /**
   * Get merged configuration
   * @returns {Promise<Object>}
   */
  async get() {
    return fetchJson('/api/config');
  },

  /**
   * Get project-level configuration
   * @returns {Promise<Object>}
   */
  async getProject() {
    return fetchJson('/api/config/project');
  },

  /**
   * Get global configuration
   * @returns {Promise<Object>}
   */
  async getGlobal() {
    return fetchJson('/api/config/global');
  },

  /**
   * Update project configuration
   * @param {Object} data - Config data to update
   * @returns {Promise<Object>}
   */
  async updateProject(data) {
    return fetchJson('/api/config/project', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update global configuration
   * @param {Object} data - Config data to update
   * @returns {Promise<Object>}
   */
  async updateGlobal(data) {
    return fetchJson('/api/config/global', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Validate configuration
   * @param {Object} data - Config to validate
   * @returns {Promise<Object>}
   */
  async validate(data) {
    return fetchJson('/api/config/validate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
