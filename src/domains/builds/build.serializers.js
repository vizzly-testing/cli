import {
  getComparisonStatus,
  getProcessingStatus,
  normalizeBuildStatus,
} from './build.normalizers.js';

/**
 * Build payload for build creation
 * @param {Object} options - Build options
 * @returns {Object} Build creation payload
 */
export function buildBuildPayload(options) {
  let payload = {
    name: options.name || options.buildName,
    branch: options.branch,
    environment: options.environment,
  };

  if (options.commit || options.commit_sha) {
    payload.commit_sha = options.commit || options.commit_sha;
  }

  if (options.message || options.commit_message) {
    payload.commit_message = options.message || options.commit_message;
  }

  if (options.commit_author_name) {
    payload.commit_author_name = options.commit_author_name;
  }

  if (options.commit_author_email) {
    payload.commit_author_email = options.commit_author_email;
  }

  if (options.pullRequestNumber || options.github_pull_request_number) {
    payload.github_pull_request_number =
      options.pullRequestNumber || options.github_pull_request_number;
  }

  if (options.parallelId || options.parallel_id) {
    payload.parallel_id = options.parallelId || options.parallel_id;
  }

  if (options.threshold != null) {
    payload.threshold = options.threshold;
  }

  if (options.metadata) {
    payload.metadata = options.metadata;
  }

  return payload;
}

/**
 * Format a build for JSON output
 */
export function formatBuildForJson(build, includeComparisons = false) {
  let result = {
    id: build.id,
    name: build.name,
    status: build.status,
    branch: build.branch,
    commit: build.commit_sha,
    commitMessage: build.commit_message,
    environment: build.environment,
    screenshotCount: build.screenshot_count || 0,
    comparisons: {
      total: build.total_comparisons || 0,
      new: build.new_comparisons || 0,
      changed: build.changed_comparisons || 0,
      identical: build.identical_comparisons || 0,
    },
    visual_review: build.visual_review || null,
    createdAt: build.created_at,
    completedAt: build.completed_at,
  };

  if (includeComparisons && build.comparisons) {
    result.comparisonDetails = build.comparisons.map(c => {
      let diffUrl = c.diff_image?.url || c.diff_image_url || c.diff_url || null;
      let diffImage = c.diff_image || {};
      let clusterMetadata =
        c.cluster_metadata || diffImage.cluster_metadata || null;
      let ssimScore = c.ssim_score ?? diffImage.ssim_score ?? null;
      let gmsdScore = c.gmsd_score ?? diffImage.gmsd_score ?? null;
      let fingerprintHash =
        c.fingerprint_hash || diffImage.fingerprint_hash || null;
      let hasHoneydiff =
        clusterMetadata ||
        ssimScore != null ||
        gmsdScore != null ||
        fingerprintHash;

      return {
        id: c.id,
        name: c.name || c.current_name,
        status: c.status,
        diffPercentage: c.diff_percentage,
        visual_review: c.visual_review || null,
        urls: {
          baseline:
            c.baseline_screenshot?.original_url ||
            c.baseline_original_url ||
            c.baseline_screenshot_url ||
            null,
          current:
            c.current_screenshot?.original_url ||
            c.current_original_url ||
            c.current_screenshot_url ||
            null,
          diff: diffUrl,
        },
        honeydiff: hasHoneydiff
          ? {
              ssimScore,
              gmsdScore,
              clusterClassification: clusterMetadata?.classification || null,
              clusterMetadata,
              fingerprintHash,
              diffRegions: c.diff_regions ?? diffImage.diff_regions ?? null,
            }
          : null,
      };
    });
  }

  return result;
}

/**
 * Give agents concrete paths from lifecycle status into visual evidence.
 *
 * @param {Object} build - Build record from the status response.
 * @returns {{label: string, command: string}[]} Executable CLI commands.
 */
export function createStatusSuggestedCommands(build = {}) {
  if (!build.id) {
    return [];
  }

  return [
    {
      label: 'Discover build context API',
      command: 'vizzly api schema sdk.getBuildContext --json',
    },
    {
      label: 'List comparisons',
      command: `vizzly --json comparisons --build ${build.id}`,
    },
  ];
}

/**
 * Every lifecycle, processing, comparison, and review value comes directly
 * from the API.
 *
 * @param {Object} status - Status response.
 * @param {Object|null} previewInfo - Optional preview response.
 * @returns {Object} Machine-readable status payload.
 */
export function createStatusData(status, previewInfo = null) {
  let build = normalizeBuildStatus(status);
  let processing = getProcessingStatus(status);
  let comparisons = getComparisonStatus(status);

  return {
    resource: status.resource,
    schemaVersion: status.schema_version,
    buildId: build.id,
    status: build.status,
    conclusion: status.conclusion,
    name: build.name,
    createdAt: build.created_at,
    updatedAt: build.updated_at,
    completedAt: build.completed_at,
    environment: build.environment,
    branch: build.branch,
    commit: build.commit_sha,
    commitMessage: build.commit_message,
    screenshotsTotal: processing.total,
    processing,
    comparisonsTotal: comparisons.total,
    comparisons,
    newComparisons: comparisons.new,
    changedComparisons: comparisons.changed,
    identicalComparisons: comparisons.identical,
    visual_review: build.visual_review || null,
    executionTime: build.execution_time_ms,
    isBaseline: build.is_baseline,
    userAgent: build.user_agent,
    scope: status.scope,
    links: status.links,
    suggestedCommands: createStatusSuggestedCommands(build),
    preview: previewInfo
      ? {
          url: previewInfo.preview_url,
          status: previewInfo.status,
          fileCount: previewInfo.file_count,
          expiresAt: previewInfo.expires_at,
        }
      : null,
  };
}
