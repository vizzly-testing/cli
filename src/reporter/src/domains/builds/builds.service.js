import { fetchJson } from '../../services/http-client.js';

export let projects = {
  /**
   * List projects from API
   * @returns {Promise<Object>}
   */
  async list() {
    return fetchJson('/api/projects');
  },

  /**
   * Get builds for a specific project
   * @param {string} organizationSlug
   * @param {string} projectSlug
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async getBuilds(organizationSlug, projectSlug, options = {}) {
    let params = new URLSearchParams();
    if (options.limit) params.append('limit', String(options.limit));
    if (options.branch) params.append('branch', options.branch);

    let query = params.toString();
    let url = `/api/projects/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(projectSlug)}/builds${query ? `?${query}` : ''}`;

    return fetchJson(url);
  },
};

export async function downloadBaselines(
  buildId,
  organizationSlug,
  projectSlug
) {
  return fetchJson('/api/baselines/download', {
    method: 'POST',
    body: JSON.stringify({ buildId, organizationSlug, projectSlug }),
  });
}

export let cloud = {
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
    let params = new URLSearchParams();
    if (options.limit) params.append('limit', String(options.limit));
    if (options.branch) params.append('branch', options.branch);

    let query = params.toString();
    let url = `/api/cloud/organizations/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectSlug)}/builds${query ? `?${query}` : ''}`;

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
