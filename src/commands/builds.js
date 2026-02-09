/**
 * Builds command - list and query builds
 */

import {
  createApiClient as defaultCreateApiClient,
  getBuild as defaultGetBuild,
  getBuilds as defaultGetBuilds,
} from '../api/index.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import * as defaultOutput from '../utils/output.js';

/**
 * Builds list command - list builds with optional filters
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function buildsCommand(
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    loadConfig = defaultLoadConfig,
    createApiClient = defaultCreateApiClient,
    getBuilds = defaultGetBuilds,
    getBuild = defaultGetBuild,
    output = defaultOutput,
    exit = code => process.exit(code),
  } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    // Load configuration with CLI overrides
    let allOptions = { ...globalOptions, ...options };
    let config = await loadConfig(globalOptions.config, allOptions);

    // Validate API token
    if (!config.apiKey) {
      output.error(
        'API token required. Use --token or set VIZZLY_TOKEN environment variable'
      );
      exit(1);
      return;
    }

    let client = createApiClient({
      baseUrl: config.apiUrl,
      token: config.apiKey,
      command: 'builds',
    });

    // If a specific build ID is provided, get that build
    if (options.build) {
      output.startSpinner('Fetching build...');
      let include = options.comparisons ? 'comparisons' : undefined;
      let response = await getBuild(client, options.build, include);
      output.stopSpinner();

      let build = response.build || response;

      if (globalOptions.json) {
        output.data(formatBuildForJson(build, options.comparisons));
        output.cleanup();
        return;
      }

      displayBuild(output, build, globalOptions.verbose);
      output.cleanup();
      return;
    }

    // List builds with filters
    output.startSpinner('Fetching builds...');
    let filters = {
      limit: options.limit || 20,
      offset: options.offset || 0,
    };
    if (options.branch) filters.branch = options.branch;
    if (options.status) filters.status = options.status;
    if (options.environment) filters.environment = options.environment;
    if (options.project) filters.project = options.project;

    let response = await getBuilds(client, filters);
    output.stopSpinner();

    let builds = response.builds || [];
    let pagination = response.pagination || {
      total: builds.length,
      hasMore: false,
    };

    // JSON output
    if (globalOptions.json) {
      output.data({
        builds: builds.map(b => formatBuildForJson(b)),
        pagination: {
          total: pagination.total,
          limit: filters.limit,
          offset: filters.offset,
          hasMore: pagination.hasMore,
        },
      });
      output.cleanup();
      return;
    }

    // Human-readable output
    output.header('builds');

    if (builds.length === 0) {
      output.print('  No builds found');
      if (options.branch || options.status) {
        output.hint('Try removing filters to see more results');
      }
      output.cleanup();
      return;
    }

    let colors = output.getColors();

    for (let build of builds) {
      let statusColor = getStatusColor(colors, build.status);
      let statusBadge = statusColor(build.status.toUpperCase());

      output.print(`  ${colors.bold(build.name || build.id)} ${statusBadge}`);

      let details = [];
      if (build.branch) details.push(build.branch);
      if (build.commit_sha) details.push(build.commit_sha.substring(0, 7));
      if (build.screenshot_count)
        details.push(`${build.screenshot_count} screenshots`);

      if (details.length > 0) {
        output.print(`    ${colors.dim(details.join(' · '))}`);
      }

      if (build.created_at) {
        output.print(
          `    ${colors.dim(new Date(build.created_at).toLocaleString())}`
        );
      }

      output.blank();
    }

    // Pagination info
    if (pagination.total > builds.length) {
      output.hint(
        `Showing ${builds.length} of ${pagination.total} builds. ` +
          `Use --offset ${filters.offset + filters.limit} to see more.`
      );
    }

    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch builds', error);
    output.cleanup();
    exit(1);
  }
}

/**
 * Format a build for JSON output
 */
function formatBuildForJson(build, includeComparisons = false) {
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
    approvalStatus: build.approval_status,
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
        name: c.name,
        status: c.status,
        diffPercentage: c.diff_percentage,
        approvalStatus: c.approval_status,
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
 * Display a single build in human-readable format
 */
function displayBuild(output, build, verbose) {
  let colors = output.getColors();

  output.header('build', build.status);

  output.keyValue({
    Name: build.name || build.id,
    Status: build.status?.toUpperCase(),
    Branch: build.branch,
    Commit: build.commit_sha
      ? `${build.commit_sha.substring(0, 8)} - ${build.commit_message || 'No message'}`
      : 'N/A',
  });

  output.blank();

  // Stats
  let newCount = build.new_comparisons || 0;
  let changedCount = build.changed_comparisons || 0;
  let identicalCount = build.identical_comparisons || 0;

  output.labelValue('Screenshots', String(build.screenshot_count || 0));

  let stats = [];
  if (newCount > 0) stats.push(`${colors.brand.info(newCount)} new`);
  if (changedCount > 0)
    stats.push(`${colors.brand.warning(changedCount)} changed`);
  if (identicalCount > 0)
    stats.push(`${colors.brand.success(identicalCount)} identical`);

  if (stats.length > 0) {
    output.labelValue('Comparisons', stats.join(colors.dim(' · ')));
  }

  if (build.approval_status) {
    output.labelValue('Approval', build.approval_status);
  }

  output.blank();

  if (build.created_at) {
    output.hint(`Created ${new Date(build.created_at).toLocaleString()}`);
  }
  if (build.completed_at) {
    output.hint(`Completed ${new Date(build.completed_at).toLocaleString()}`);
  }

  // Show comparisons if included
  if (build.comparisons && build.comparisons.length > 0) {
    output.blank();
    output.labelValue('Comparisons', '');

    for (let comp of build.comparisons.slice(0, verbose ? 50 : 10)) {
      let statusIcon = getComparisonStatusIcon(colors, comp.status);
      output.print(`    ${statusIcon} ${comp.name}`);
    }

    if (build.comparisons.length > (verbose ? 50 : 10)) {
      output.hint(
        `  ... and ${build.comparisons.length - (verbose ? 50 : 10)} more`
      );
    }
  }
}

/**
 * Get color function for build status
 */
function getStatusColor(colors, status) {
  switch (status) {
    case 'completed':
      return colors.brand.success;
    case 'failed':
      return colors.brand.error;
    case 'processing':
    case 'pending':
      return colors.brand.warning;
    default:
      return colors.dim;
  }
}

/**
 * Get icon for comparison status
 */
function getComparisonStatusIcon(colors, status) {
  switch (status) {
    case 'identical':
      return colors.brand.success('✓');
    case 'new':
      return colors.brand.info('●');
    case 'changed':
      return colors.brand.warning('◐');
    case 'failed':
      return colors.brand.error('✗');
    default:
      return colors.dim('○');
  }
}

/**
 * Validate builds command options
 */
export function validateBuildsOptions(options = {}) {
  let errors = [];

  if (
    options.limit &&
    (Number.isNaN(options.limit) || options.limit < 1 || options.limit > 250)
  ) {
    errors.push('--limit must be a number between 1 and 250');
  }

  if (options.offset && (Number.isNaN(options.offset) || options.offset < 0)) {
    errors.push('--offset must be a non-negative number');
  }

  return errors;
}
