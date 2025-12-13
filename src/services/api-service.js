/**
 * API Service for Vizzly
 *
 * This class wraps the functional API module for backwards compatibility.
 * New code should use createApiClient() and endpoint functions directly.
 *
 * @example
 * // Functional style (preferred)
 * import { createApiClient, getBuild } from '../api/index.js';
 * let client = createApiClient({ token: 'xxx' });
 * let build = await getBuild(client, buildId);
 *
 * // Class style (backwards compat)
 * import { ApiService } from './api-service.js';
 * let api = new ApiService({ apiKey: 'xxx' });
 * let build = await api.getBuild(buildId);
 */

import {
  checkShas,
  createApiClient,
  createBuild,
  finalizeBuild,
  finalizeParallelBuild,
  getBatchHotspots,
  getBuild,
  getBuilds,
  getComparison,
  getScreenshotHotspots,
  getTddBaselines,
  getTokenContext,
  searchComparisons,
  updateBuildStatus,
  uploadScreenshot,
} from '../api/index.js';

/**
 * ApiService class - wraps functional API for backwards compatibility.
 */
export class ApiService {
  constructor(options = {}) {
    // Map old option names to new ones
    let clientOptions = {
      baseUrl: options.apiUrl || options.baseUrl,
      token: options.apiKey || options.token,
      command: options.command,
      sdkUserAgent: options.userAgent,
      allowNoToken: options.allowNoToken,
    };

    this.client = createApiClient(clientOptions);
    this.baseUrl = this.client.getBaseUrl();
    this.token = this.client.getToken();
    this.userAgent = this.client.getUserAgent();
    this.uploadAll = options.uploadAll || false;
  }

  // Direct request access (for custom endpoints)
  request(endpoint, options, isRetry) {
    return this.client.request(endpoint, options, isRetry);
  }

  // Build endpoints
  getBuild(buildId, include) {
    return getBuild(this.client, buildId, include);
  }

  getBuilds(filters) {
    return getBuilds(this.client, filters);
  }

  createBuild(metadata) {
    return createBuild(this.client, metadata);
  }

  updateBuildStatus(buildId, status, executionTimeMs) {
    return updateBuildStatus(this.client, buildId, status, executionTimeMs);
  }

  finalizeBuild(buildId, success, executionTimeMs) {
    return finalizeBuild(this.client, buildId, success, executionTimeMs);
  }

  getTddBaselines(buildId) {
    return getTddBaselines(this.client, buildId);
  }

  // Screenshot endpoints
  checkShas(screenshots, buildId) {
    return checkShas(this.client, screenshots, buildId);
  }

  uploadScreenshot(buildId, name, buffer, metadata) {
    return uploadScreenshot(
      this.client,
      buildId,
      name,
      buffer,
      metadata,
      this.uploadAll
    );
  }

  // Comparison endpoints
  getComparison(comparisonId) {
    return getComparison(this.client, comparisonId);
  }

  searchComparisons(name, filters) {
    return searchComparisons(this.client, name, filters);
  }

  // Hotspot endpoints
  getScreenshotHotspots(screenshotName, options) {
    return getScreenshotHotspots(this.client, screenshotName, options);
  }

  getBatchHotspots(screenshotNames, options) {
    return getBatchHotspots(this.client, screenshotNames, options);
  }

  // Token endpoints
  getTokenContext() {
    return getTokenContext(this.client);
  }

  // Parallel build endpoints
  finalizeParallelBuild(parallelId) {
    return finalizeParallelBuild(this.client, parallelId);
  }
}
