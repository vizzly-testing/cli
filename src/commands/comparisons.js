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
      let response = await getBuild(client, options.build, {
        include: 'comparisons',
      });
      output.stopSpinner();

      let build = response.build || response;
      let comparisons = build.comparisons || [];

      // Apply status filter if provided
      if (options.status) {
        comparisons = comparisons.filter(c => c.status === options.status);
      }

      // Apply name filter if provided
      if (options.name) {
        let pattern = options.name.replace(/\*/g, '.*');
        let regex = new RegExp(pattern, 'i');
        comparisons = comparisons.filter(c => regex.test(c.name));
      }

      if (globalOptions.json) {
        output.data({
          buildId: build.id,
          buildName: build.name,
          comparisons: comparisons.map(formatComparisonForJson),
          summary: {
            total: comparisons.length,
            passed: comparisons.filter(c => c.status === 'identical').length,
            failed: comparisons.filter(c => c.status === 'changed').length,
            new: comparisons.filter(c => c.status === 'new').length,
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
    exit(1);
  }
}

/**
 * Format a comparison for JSON output
 */
function formatComparisonForJson(comparison) {
  return {
    id: comparison.id,
    name: comparison.name,
    status: comparison.status,
    diffPercentage: comparison.diff_percentage ?? null,
    approvalStatus: comparison.approval_status,
    viewport: comparison.viewport_width
      ? { width: comparison.viewport_width, height: comparison.viewport_height }
      : null,
    browser: comparison.browser || null,
    urls: {
      baseline: comparison.baseline_screenshot?.original_url || null,
      current: comparison.current_screenshot?.original_url || null,
      diff: comparison.diff_image?.url || null,
    },
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
  let _colors = output.getColors();

  output.header('comparison', comparison.status);

  output.keyValue({
    Name: comparison.name,
    Status: comparison.status?.toUpperCase(),
    'Diff %':
      comparison.diff_percentage != null
        ? `${(comparison.diff_percentage * 100).toFixed(2)}%`
        : 'N/A',
    Approval: comparison.approval_status || 'pending',
  });

  output.blank();

  if (comparison.viewport_width) {
    output.labelValue(
      'Viewport',
      `${comparison.viewport_width}×${comparison.viewport_height}`
    );
  }
  if (comparison.browser) {
    output.labelValue('Browser', comparison.browser);
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

  // URLs in verbose mode
  if (verbose) {
    output.blank();
    output.labelValue('URLs', '');
    if (comparison.baseline_screenshot?.original_url) {
      output.print(
        `    Baseline: ${comparison.baseline_screenshot.original_url}`
      );
    }
    if (comparison.current_screenshot?.original_url) {
      output.print(
        `    Current: ${comparison.current_screenshot.original_url}`
      );
    }
    if (comparison.diff_image?.url) {
      output.print(`    Diff: ${comparison.diff_image.url}`);
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
  let passed = comparisons.filter(c => c.status === 'identical').length;
  let failed = comparisons.filter(c => c.status === 'changed').length;
  let newCount = comparisons.filter(c => c.status === 'new').length;

  let stats = [];
  if (passed > 0) stats.push(`${colors.brand.success(passed)} identical`);
  if (failed > 0) stats.push(`${colors.brand.warning(failed)} changed`);
  if (newCount > 0) stats.push(`${colors.brand.info(newCount)} new`);

  output.labelValue('Summary', stats.join(colors.dim(' · ')));
  output.blank();

  // List comparisons
  for (let comp of comparisons.slice(0, verbose ? 100 : 20)) {
    let icon = getStatusIcon(colors, comp.status);
    let diffInfo =
      comp.diff_percentage != null
        ? colors.dim(` (${(comp.diff_percentage * 100).toFixed(1)}%)`)
        : '';
    output.print(`  ${icon} ${comp.name}${diffInfo}`);
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
      let icon = getStatusIcon(colors, comp.status);
      output.print(`      ${icon} ${comp.name}`);
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
