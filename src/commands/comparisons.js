/**
 * Comparisons command - query and search comparisons
 */

import {
  createApiClient as defaultCreateApiClient,
  getBuild as defaultGetBuild,
  getComparison as defaultGetComparison,
  searchComparisons as defaultSearchComparisons,
} from '../api/index.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import * as defaultOutput from '../utils/output.js';
import { createWildcardMatcher } from '../utils/patterns.js';
import {
  getComparisonBrowser,
  getComparisonName,
  getComparisonResult,
  getComparisonViewport,
  getVisualReviewState,
} from '../utils/visual-context-normalizers.js';

/**
 * Comparisons command - query comparisons with various filters
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function comparisonsCommand(
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    loadConfig = defaultLoadConfig,
    createApiClient = defaultCreateApiClient,
    getBuild = defaultGetBuild,
    getComparison = defaultGetComparison,
    searchComparisons = defaultSearchComparisons,
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
      command: 'comparisons',
    });

    // Get a specific comparison by ID
    if (options.id) {
      output.startSpinner('Fetching comparison...');
      let comparison = await getComparison(client, options.id);
      output.stopSpinner();

      if (globalOptions.json) {
        output.data(formatComparisonForJson(comparison));
        output.cleanup();
        return;
      }

      displayComparison(output, comparison, globalOptions.verbose);
      output.cleanup();
      return;
    }

    // Get comparisons for a specific build
    if (options.build) {
      output.startSpinner('Fetching comparisons for build...');
      let response = await getBuild(client, options.build, 'comparisons');
      output.stopSpinner();

      let build = response.build || response;
      let comparisons = build.comparisons || [];

      // Apply status filter if provided
      if (options.status) {
        comparisons = comparisons.filter(
          comparison => getComparisonResult(comparison) === options.status
        );
      }

      // Apply name filter if provided
      if (options.name) {
        let matchesName = createWildcardMatcher(options.name);
        comparisons = comparisons.filter(comparison =>
          matchesName(getComparisonName(comparison))
        );
      }

      if (globalOptions.json) {
        output.data({
          buildId: build.id,
          buildName: build.name,
          comparisons: comparisons.map(formatComparisonForJson),
          summary: {
            total: comparisons.length,
            passed: comparisons.filter(
              comparison => getComparisonResult(comparison) === 'identical'
            ).length,
            failed: comparisons.filter(
              comparison => getComparisonResult(comparison) === 'changed'
            ).length,
            new: comparisons.filter(
              comparison => getComparisonResult(comparison) === 'new'
            ).length,
          },
        });
        output.cleanup();
        return;
      }

      displayBuildComparisons(
        output,
        build,
        comparisons,
        globalOptions.verbose
      );
      output.cleanup();
      return;
    }

    // Search comparisons by name across builds
    if (options.name) {
      output.startSpinner('Searching comparisons...');
      let filters = {
        branch: options.branch,
        project: options.project,
        organization: options.org,
        limit: options.limit || 50,
        offset: options.offset || 0,
      };
      let response = await searchComparisons(client, options.name, filters);
      output.stopSpinner();

      let comparisons = response.comparisons || [];
      let pagination = response.pagination || {
        total: comparisons.length,
        hasMore: false,
      };

      if (globalOptions.json) {
        output.data({
          comparisons: comparisons.map(formatComparisonForJson),
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

      displaySearchResults(
        output,
        comparisons,
        options.name,
        pagination,
        globalOptions.verbose
      );
      output.cleanup();
      return;
    }

    // No valid query provided
    output.error(
      'Specify --build <id>, --id <comparison-id>, or --name <pattern> to query comparisons'
    );
    output.hint('Examples:');
    output.hint('  vizzly comparisons --build <build-id>');
    output.hint('  vizzly comparisons --name "button-*"');
    output.hint('  vizzly comparisons --id <comparison-id>');
    exit(1);
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch comparisons', error);
    output.cleanup();
    exit(1);
  }
}

/**
 * Format a comparison for JSON output
 */
function formatComparisonForJson(comparison) {
  // API endpoints return different shapes:
  // - Single comparison: nested baseline_screenshot/current_screenshot + flat diff_url, honeydiff at top level
  // - Build comparisons: flat diff_url/diff_image_url, no storage URLs, limited honeydiff
  // - Search: nested diff_image with honeydiff, no current/baseline URLs
  let diffImage = comparison.diff_image || {};
  let clusterMetadata =
    comparison.cluster_metadata || diffImage.cluster_metadata || null;
  let ssimScore = comparison.ssim_score ?? diffImage.ssim_score ?? null;
  let gmsdScore = comparison.gmsd_score ?? diffImage.gmsd_score ?? null;
  let fingerprintHash =
    comparison.fingerprint_hash || diffImage.fingerprint_hash || null;
  let projection =
    comparison.analysis_projection ||
    comparison.projection ||
    diffImage.analysis_projection ||
    diffImage.projection ||
    null;
  let diffRegions = comparison.diff_regions ?? diffImage.diff_regions ?? null;
  let regionCount =
    comparison.region_count ??
    diffImage.region_count ??
    projection?.clusters?.count ??
    (Array.isArray(diffRegions) ? diffRegions.length : null);

  let hasHoneydiff =
    clusterMetadata ||
    ssimScore != null ||
    gmsdScore != null ||
    fingerprintHash ||
    projection ||
    regionCount != null;

  return {
    id: comparison.id,
    name: getComparisonName(comparison),
    status: comparison.status,
    result: getComparisonResult(comparison),
    diffPercentage: comparison.diff_percentage ?? null,
    approvalStatus: comparison.approval_status,
    reviewState: getVisualReviewState(comparison),
    visualReview: comparison.visual_review || null,
    viewport: getComparisonViewport(comparison),
    browser: getComparisonBrowser(comparison),
    urls: {
      baseline:
        comparison.baseline_screenshot?.original_url ||
        comparison.baseline_original_url ||
        comparison.baseline_screenshot_url ||
        null,
      current:
        comparison.current_screenshot?.original_url ||
        comparison.current_original_url ||
        comparison.current_screenshot_url ||
        null,
      diff:
        comparison.diff_image?.url ||
        comparison.diff_image_url ||
        comparison.diff_url ||
        null,
    },
    honeydiff: hasHoneydiff
      ? {
          ssimScore,
          gmsdScore,
          clusterClassification: clusterMetadata?.classification || null,
          clusterMetadata,
          fingerprintHash,
          regionCount,
          projection,
          diffRegions,
          diffLines: comparison.diff_lines ?? diffImage.diff_lines ?? null,
          fingerprintData:
            comparison.fingerprint_data ?? diffImage.fingerprint_data ?? null,
        }
      : null,
    buildId: comparison.build_id,
    buildName: comparison.build_name,
    buildBranch: comparison.build_branch,
    createdAt: comparison.created_at,
  };
}

/**
 * Display a single comparison in detail
 */
function displayComparison(output, comparison, verbose) {
  let formatted = formatComparisonForJson(comparison);
  output.header('comparison', formatted.result);

  output.keyValue({
    Name: formatted.name,
    Status: formatted.result?.toUpperCase(),
    'Diff %':
      comparison.diff_percentage != null
        ? `${(comparison.diff_percentage * 100).toFixed(2)}%`
        : 'N/A',
    Review: formatted.reviewState || 'unknown',
  });

  output.blank();

  if (formatted.viewport) {
    output.labelValue(
      'Viewport',
      `${formatted.viewport.width ?? '?'}×${formatted.viewport.height ?? '?'}`
    );
  }
  if (formatted.browser) {
    output.labelValue('Browser', formatted.browser);
  }

  output.blank();

  // Build context
  if (comparison.build_name || comparison.build_id) {
    output.labelValue('Build', comparison.build_name || comparison.build_id);
  }
  if (comparison.build_branch) {
    output.labelValue('Branch', comparison.build_branch);
  }
  if (comparison.build_commit_sha) {
    output.labelValue('Commit', comparison.build_commit_sha.substring(0, 8));
  }

  // Honeydiff analysis in verbose mode
  if (verbose && formatted.honeydiff) {
    let honeydiff = formatted.honeydiff;
    if (
      honeydiff.clusterMetadata ||
      honeydiff.ssimScore != null ||
      honeydiff.gmsdScore != null ||
      honeydiff.fingerprintHash ||
      honeydiff.regionCount != null
    ) {
      output.blank();
      if (honeydiff.clusterClassification) {
        output.labelValue('Classification', honeydiff.clusterClassification);
      }
      if (honeydiff.ssimScore != null) {
        output.labelValue('SSIM', honeydiff.ssimScore.toFixed(4));
      }
      if (honeydiff.gmsdScore != null) {
        output.labelValue('GMSD', honeydiff.gmsdScore.toFixed(4));
      }
      if (honeydiff.fingerprintHash) {
        output.labelValue('Fingerprint', honeydiff.fingerprintHash);
      }
      if (honeydiff.regionCount != null) {
        output.labelValue('Regions', String(honeydiff.regionCount));
      }
    }
  }

  // URLs in verbose mode
  if (verbose) {
    let baselineUrl = formatted.urls.baseline;
    let currentUrl = formatted.urls.current;
    let diffUrl = formatted.urls.diff;

    if (baselineUrl || currentUrl || diffUrl) {
      output.blank();
      output.labelValue('URLs', '');
      if (baselineUrl) output.print(`    Baseline: ${baselineUrl}`);
      if (currentUrl) output.print(`    Current: ${currentUrl}`);
      if (diffUrl) output.print(`    Diff: ${diffUrl}`);
    }
  }

  if (comparison.created_at) {
    output.blank();
    output.hint(`Created ${new Date(comparison.created_at).toLocaleString()}`);
  }
}

/**
 * Display comparisons for a build
 */
function displayBuildComparisons(output, build, comparisons, verbose) {
  let colors = output.getColors();

  output.header('comparisons');
  output.labelValue('Build', build.name || build.id);
  output.blank();

  if (comparisons.length === 0) {
    output.print('  No comparisons found');
    output.cleanup();
    return;
  }

  // Summary
  let passed = comparisons.filter(
    comparison => getComparisonResult(comparison) === 'identical'
  ).length;
  let failed = comparisons.filter(
    comparison => getComparisonResult(comparison) === 'changed'
  ).length;
  let newCount = comparisons.filter(
    comparison => getComparisonResult(comparison) === 'new'
  ).length;

  let stats = [];
  if (passed > 0) stats.push(`${colors.brand.success(passed)} identical`);
  if (failed > 0) stats.push(`${colors.brand.warning(failed)} changed`);
  if (newCount > 0) stats.push(`${colors.brand.info(newCount)} new`);

  output.labelValue('Summary', stats.join(colors.dim(' · ')));
  output.blank();

  // List comparisons
  for (let comp of comparisons.slice(0, verbose ? 100 : 20)) {
    let icon = getStatusIcon(colors, getComparisonResult(comp));
    let diffInfo =
      comp.diff_percentage != null
        ? colors.dim(` (${(comp.diff_percentage * 100).toFixed(1)}%)`)
        : '';
    let classification = verbose
      ? getClassificationLabel(colors, comp.cluster_metadata)
      : '';
    output.print(
      `  ${icon} ${getComparisonName(comp)}${diffInfo}${classification}`
    );
  }

  if (comparisons.length > (verbose ? 100 : 20)) {
    output.blank();
    output.hint(
      `... and ${comparisons.length - (verbose ? 100 : 20)} more. Use --verbose to see all.`
    );
  }
}

/**
 * Display search results
 */
function displaySearchResults(
  output,
  comparisons,
  searchPattern,
  pagination,
  verbose
) {
  let colors = output.getColors();

  output.header('comparisons');
  output.labelValue('Search', searchPattern);
  output.blank();

  if (comparisons.length === 0) {
    output.print('  No comparisons found');
    return;
  }

  // Group by build for better display
  let byBuild = new Map();
  for (let comp of comparisons) {
    let key = comp.build_id;
    if (!byBuild.has(key)) {
      byBuild.set(key, {
        buildName: comp.build_name,
        buildBranch: comp.build_branch,
        comparisons: [],
      });
    }
    byBuild.get(key).comparisons.push(comp);
  }

  for (let [buildId, group] of byBuild) {
    output.print(`  ${colors.bold(group.buildName || buildId)}`);
    if (group.buildBranch) {
      output.print(`    ${colors.dim(group.buildBranch)}`);
    }

    for (let comp of group.comparisons.slice(0, verbose ? 10 : 3)) {
      let icon = getStatusIcon(colors, getComparisonResult(comp));
      let classification = verbose
        ? getClassificationLabel(
            colors,
            comp.cluster_metadata || comp.diff_image?.cluster_metadata
          )
        : '';
      output.print(`      ${icon} ${getComparisonName(comp)}${classification}`);
    }

    if (group.comparisons.length > (verbose ? 10 : 3)) {
      output.print(
        `      ${colors.dim(`... and ${group.comparisons.length - (verbose ? 10 : 3)} more`)}`
      );
    }

    output.blank();
  }

  if (pagination.hasMore) {
    output.hint(
      `Showing ${comparisons.length} of ${pagination.total}. ` +
        `Use --offset ${pagination.offset + pagination.limit} to see more.`
    );
  }
}

/**
 * Get a classification label for verbose display
 */
function getClassificationLabel(colors, clusterMetadata) {
  let classification = clusterMetadata?.classification;
  if (!classification) return '';
  return colors.dim(` [${classification}]`);
}

/**
 * Get icon for comparison status
 */
function getStatusIcon(colors, status) {
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
 * Validate comparisons command options
 */
export function validateComparisonsOptions(options = {}) {
  let errors = [];

  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > 250)
  ) {
    errors.push('--limit must be an integer between 1 and 250');
  }

  if (
    options.offset !== undefined &&
    (!Number.isInteger(options.offset) || options.offset < 0)
  ) {
    errors.push('--offset must be a non-negative integer');
  }

  return errors;
}
