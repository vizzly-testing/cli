function buildUploadMetadata(options) {
  let metadata = { ...(options.metadata || {}) };
  let comparison = { ...(metadata.comparison || {}) };

  if (options.threshold !== undefined) {
    comparison.threshold = options.threshold;
  }

  if (options.minClusterSize !== undefined) {
    comparison.minClusterSize = options.minClusterSize;
  }

  if (Object.keys(comparison).length > 0) {
    metadata.comparison = comparison;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Build API build info payload
 * @param {Object} options - Upload options
 * @param {string} [defaultBranch] - Default branch to use
 * @returns {Object} Build info payload
 */
export function buildBuildInfo(options, defaultBranch = 'main') {
  let buildInfo = {
    name: options.buildName || `Upload ${new Date().toISOString()}`,
    branch: options.branch || defaultBranch || 'main',
    commit_sha: options.commit,
    commit_message: options.message,
    commit_author_name: options.commitAuthorName,
    commit_author_email: options.commitAuthorEmail,
    environment: options.environment || 'production',
    threshold: options.threshold,
    github_pull_request_number: options.pullRequestNumber,
    parallel_id: options.parallelId,
  };

  let metadata = buildUploadMetadata(options);
  if (metadata) {
    buildInfo.metadata = metadata;
  }

  return buildInfo;
}

/**
 * Build scanning phase progress
 * @param {number} total - Total files found
 * @returns {Object} Progress object
 */
export function buildScanningProgress(total) {
  return {
    phase: 'scanning',
    message: `Found ${total} screenshots`,
    total,
  };
}

/**
 * Build processing phase progress
 * @param {number} current - Current file number
 * @param {number} total - Total files
 * @returns {Object} Progress object
 */
export function buildProcessingProgress(current, total) {
  return {
    phase: 'processing',
    message: 'Processing files',
    current,
    total,
  };
}

/**
 * Build deduplication phase progress
 * @param {number} toUpload - Files to upload
 * @param {number} existing - Existing files
 * @param {number} total - Total files
 * @returns {Object} Progress object
 */
export function buildDeduplicationProgress(toUpload, existing, total) {
  return {
    phase: 'deduplication',
    message: `Checking for duplicates (${toUpload} to upload, ${existing} existing)`,
    toUpload,
    existing,
    total,
  };
}

/**
 * Build uploading phase progress
 * @param {number} current - Current upload number
 * @param {number} total - Total to upload
 * @returns {Object} Progress object
 */
export function buildUploadingProgress(current, total) {
  return {
    phase: 'uploading',
    message: 'Uploading screenshots',
    current,
    total,
  };
}

/**
 * Build completed phase progress
 * @param {string} buildId - Build ID
 * @param {string|null} url - Build URL
 * @returns {Object} Progress object
 */
export function buildCompletedProgress(buildId, url) {
  return {
    phase: 'completed',
    message: 'Upload completed',
    buildId,
    url,
  };
}

/**
 * Build successful upload result
 * @param {Object} options - Options
 * @param {string} options.buildId - Build ID
 * @param {string|null} options.url - Build URL
 * @param {number} options.total - Total files
 * @param {number} options.uploaded - Files uploaded
 * @param {number} options.skipped - Files skipped
 * @returns {Object} Upload result
 */
export function buildUploadResult({ buildId, url, total, uploaded, skipped }) {
  return {
    success: true,
    buildId,
    url,
    stats: {
      total,
      uploaded,
      skipped,
    },
  };
}

/**
 * Build wait result from build response
 * @param {Object} build - Build object from API
 * @returns {Object} Wait result
 */
export function buildWaitResult(build) {
  let totalComparisons = build.total_comparisons;
  let passedComparisons = build.identical_comparisons;
  let failedComparisons = build.changed_comparisons;
  let newComparisons = build.new_comparisons;
  let identicalComparisons = build.identical_comparisons;
  let hasComparisonCounts =
    build.total_comparisons !== undefined ||
    build.new_comparisons !== undefined ||
    build.changed_comparisons !== undefined ||
    build.identical_comparisons !== undefined;

  let result = {
    status: build.status,
    build,
    passedComparisons,
    failedComparisons,
    newComparisons,
    identicalComparisons,
    visual_review: build.visual_review || null,
    totalComparisons,
  };

  if (hasComparisonCounts) {
    result.comparisons = totalComparisons;
  }

  if (build.url) {
    result.url = build.url;
  }

  return result;
}
