/**
 * Vizzly API Client
 * Unified API for all frontend data fetching
 *
 * Namespaced endpoints:
 * - api.tdd.*    - Local TDD endpoints
 * - api.cloud.*  - Cloud API (via proxy)
 * - api.config.* - Configuration management
 * - api.auth.*   - Authentication
 */

/**
 * Check if we're in static mode (data embedded in HTML)
 * Static mode is used for self-contained HTML reports
 */
export function isStaticMode() {
  return typeof window !== 'undefined' && window.VIZZLY_STATIC_MODE === true;
}

/**
 * Make a JSON API request
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Parsed JSON response
 */
async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

/**
 * TDD API - Local screenshot management
 */
export const tdd = {
  /**
   * Get current report data with comparisons
   * @returns {Promise<Object|null>}
   */
  async getReportData() {
    return fetchJson('/api/report-data');
  },

  /**
   * Accept a single baseline
   * @param {string} id - Comparison ID
   * @returns {Promise<Object>}
   */
  async acceptBaseline(id) {
    return fetchJson('/api/baseline/accept', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },

  /**
   * Accept all baselines
   * @returns {Promise<Object>}
   */
  async acceptAllBaselines() {
    return fetchJson('/api/baseline/accept-all', {
      method: 'POST',
    });
  },

  /**
   * Reject a single comparison (keep current baseline)
   * @param {string} id - Comparison ID
   * @returns {Promise<Object>}
   */
  async rejectBaseline(id) {
    return fetchJson('/api/baseline/reject', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },

  /**
   * Reset baselines to previous state
   * @returns {Promise<Object>}
   */
  async resetBaselines() {
    return fetchJson('/api/baseline/reset', {
      method: 'POST',
    });
  },

  /**
   * Delete a comparison entirely (removes from report and deletes files)
   * @param {string} id - Comparison ID
   * @returns {Promise<Object>}
   */
  async deleteComparison(id) {
    return fetchJson('/api/baseline/delete', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  },

  /**
   * Download baselines from a remote build
   * @param {string} buildId - Build ID to download from
   * @param {string} [organizationSlug] - Organization slug for OAuth auth
   * @param {string} [projectSlug] - Project slug for OAuth auth
   * @returns {Promise<Object>}
   */
  async downloadBaselines(buildId, organizationSlug, projectSlug) {
    return fetchJson('/api/baselines/download', {
      method: 'POST',
      body: JSON.stringify({ buildId, organizationSlug, projectSlug }),
    });
  },
};

/**
 * Cloud API - Remote Vizzly operations (via proxy)
 */
export const cloud = {
  /**
   * List all user's projects
   * @returns {Promise<Object>}
   */
  async listProjects() {
    return fetchJson('/api/cloud/projects');
  },

  /**
   * Get builds for a specific project
   * @param {string} organizationSlug
   * @param {string} projectSlug
   * @param {Object} options
   * @param {number} [options.limit=20]
   * @param {string} [options.branch]
   * @returns {Promise<Object>}
   */
  async getBuilds(organizationSlug, projectSlug, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', String(options.limit));
    if (options.branch) params.append('branch', options.branch);

    const query = params.toString();
    const url = `/api/cloud/organizations/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectSlug)}/builds${query ? `?${query}` : ''}`;

    return fetchJson(url);
  },

  /**
   * Download baselines from cloud build
   * @param {string} buildId
   * @param {string[]} [screenshotNames] - Optional specific screenshots
   * @returns {Promise<Object>}
   */
  async downloadBaselines(buildId, screenshotNames) {
    return fetchJson('/api/cloud/baselines/download', {
      method: 'POST',
      body: JSON.stringify({ buildId, screenshotNames }),
    });
  },
};

/**
 * Config API - Configuration management
 */
export const config = {
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

/**
 * Auth API - Authentication management
 */
export const auth = {
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

/**
 * Projects API - Project mappings (local storage)
 */
export const projects = {
  /**
   * List projects from API
   * @returns {Promise<Object>}
   */
  async list() {
    return fetchJson('/api/projects');
  },

  /**
   * List project directory mappings
   * @returns {Promise<Object>}
   */
  async listMappings() {
    return fetchJson('/api/projects/mappings');
  },

  /**
   * Create or update project mapping
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async createMapping(data) {
    return fetchJson('/api/projects/mappings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete project mapping
   * @param {string} directory
   * @returns {Promise<Object>}
   */
  async deleteMapping(directory) {
    return fetchJson(
      `/api/projects/mappings/${encodeURIComponent(directory)}`,
      {
        method: 'DELETE',
      }
    );
  },

  /**
   * Get recent builds for current project
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async getRecentBuilds(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', String(options.limit));
    if (options.branch) params.append('branch', options.branch);

    const query = params.toString();
    return fetchJson(`/api/builds/recent${query ? `?${query}` : ''}`);
  },

  /**
   * Get builds for a specific project
   * @param {string} organizationSlug
   * @param {string} projectSlug
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async getBuilds(organizationSlug, projectSlug, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', String(options.limit));
    if (options.branch) params.append('branch', options.branch);

    const query = params.toString();
    const url = `/api/projects/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(projectSlug)}/builds${query ? `?${query}` : ''}`;

    return fetchJson(url);
  },
};

/**
 * Combined API object for convenience
 */
export const api = {
  tdd,
  cloud,
  config,
  auth,
  projects,
};

export default api;
