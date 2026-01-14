/**
 * Vizzly API Module
 *
 * Functional API for interacting with the Vizzly platform.
 *
 * Usage:
 *   import { createApiClient, getBuild, createBuild } from '../api/index.js';
 *
 *   let client = createApiClient({ token: 'xxx', command: 'run' });
 *   let build = await getBuild(client, buildId);
 */

// Client factory
export { createApiClient, DEFAULT_API_URL } from './client.js';
// Core pure functions
export {
  buildApiUrl,
  buildAuthHeader,
  buildBuildPayload,
  buildEndpointWithParams,
  buildQueryParams,
  buildRequestHeaders,
  buildScreenshotCheckObject,
  buildScreenshotPayload,
  buildShaCheckPayload,
  buildUserAgent,
  computeSha256,
  extractErrorBody,
  findScreenshotBySha,
  isAuthError,
  isRateLimited,
  parseApiError,
  partitionByShaExistence,
  shaExists,
  shouldRetryWithRefresh,
} from './core.js';

// Endpoint functions
export {
  checkShas,
  createBuild,
  finalizeBuild,
  finalizeParallelBuild,
  getBatchHotspots,
  getBuild,
  getBuilds,
  getComparison,
  getPreviewInfo,
  getScreenshotHotspots,
  getTddBaselines,
  getTokenContext,
  searchComparisons,
  updateBuildStatus,
  uploadPreviewZip,
  uploadScreenshot,
} from './endpoints.js';
