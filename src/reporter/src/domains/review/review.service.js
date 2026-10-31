import { normalizeReportData } from '../../../../domains/reports/report.normalizers.js';
import { fetchJson } from '../../services/http-client.js';

export let review = {
  /**
   * Get current report data with comparisons
   * @returns {Promise<Object|null>}
   */
  async getReportData() {
    let data = await fetchJson('/api/report-data');
    return normalizeReportData(data);
  },

  /**
   * Get full comparison details (lightweight + heavy fields)
   * @param {string} id - Comparison ID, signature, or name
   * @returns {Promise<Object>}
   */
  async getComparison(id) {
    return fetchJson(`/api/comparison/${encodeURIComponent(id)}`);
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
};
