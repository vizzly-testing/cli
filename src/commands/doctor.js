import { URL } from 'node:url';
import {
  createApiClient as defaultCreateApiClient,
  getBuilds as defaultGetBuilds,
} from '../api/index.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import { getContext as defaultGetContext } from '../utils/context.js';
import { getApiToken as defaultGetApiToken } from '../utils/environment-config.js';
import * as defaultOutput from '../utils/output.js';

export let MIN_NODE_MAJOR = 22;

export function createDoctorDiagnostics() {
  return {
    environment: {
      nodeVersion: null,
      nodeVersionValid: null,
    },
    configuration: {
      apiUrl: null,
      apiUrlValid: null,
      threshold: null,
      thresholdValid: null,
      port: null,
    },
    connectivity: {
      checked: false,
      ok: null,
      error: null,
    },
  };
}

export function getNodeVersionCheck(
  nodeVersion = process.version,
  minMajor = MIN_NODE_MAJOR
) {
  let nodeMajor = parseNodeMajorVersion(nodeVersion);
  let ok = nodeMajor !== null && nodeMajor >= minMajor;
  let value = ok
    ? `${nodeVersion} (supported)`
    : nodeMajor === null
      ? `${nodeVersion} (unrecognized Node.js version)`
      : `${nodeVersion} (requires >= ${minMajor})`;

  return {
    diagnostic: {
      nodeVersion,
      nodeVersionValid: ok,
    },
    check: {
      name: 'Node.js',
      value,
      ok,
    },
  };
}

function parseNodeMajorVersion(nodeVersion) {
  let match = /^v?(\d+)\.\d+\.\d+$/.exec(nodeVersion);
  return match ? Number(match[1]) : null;
}

export function getApiUrlCheck(apiUrl) {
  try {
    let url = new URL(apiUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('URL must use http or https');
    }

    return {
      apiUrl,
      apiUrlValid: true,
      check: { name: 'API URL', value: apiUrl, ok: true },
    };
  } catch {
    return {
      apiUrl,
      apiUrlValid: false,
      check: {
        name: 'API URL',
        value: 'invalid (check VIZZLY_API_URL)',
        ok: false,
      },
    };
  }
}

export function getThresholdCheck(thresholdValue) {
  let threshold = Number(thresholdValue);
  // CIEDE2000 threshold: 0 = exact, 1 = JND, 2 = recommended, 3+ = permissive
  let thresholdValid = Number.isFinite(threshold) && threshold >= 0;

  return {
    threshold,
    thresholdValid,
    check: thresholdValid
      ? {
          name: 'Threshold',
          value: `${threshold} (CIEDE2000)`,
          ok: true,
        }
      : { name: 'Threshold', value: 'invalid', ok: false },
  };
}

/**
 * Doctor command implementation - Run diagnostics to check environment
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function doctorCommand(
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    createApiClient = defaultCreateApiClient,
    getApiToken = defaultGetApiToken,
    getBuilds = defaultGetBuilds,
    getContext = defaultGetContext,
    loadConfig = defaultLoadConfig,
    nodeVersion = process.version,
    output = defaultOutput,
    exit = code => process.exit(code),
  } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let diagnostics = createDoctorDiagnostics();
  let hasErrors = false;
  let checks = [];

  try {
    // Determine if we'll attempt remote checks (API connectivity)
    let hasApiToken = Boolean(getApiToken());
    let willCheckConnectivity = Boolean(options.api || hasApiToken);

    // Show header
    output.header('doctor', willCheckConnectivity ? 'full' : 'local');

    let nodeCheck = getNodeVersionCheck(nodeVersion);
    diagnostics.environment = nodeCheck.diagnostic;
    checks.push(nodeCheck.check);
    if (!nodeCheck.check.ok) {
      hasErrors = true;
    }

    // Load configuration (apply global CLI overrides like --config only)
    let config = await loadConfig(globalOptions.config);

    let apiUrlCheck = getApiUrlCheck(config.apiUrl);
    diagnostics.configuration.apiUrl = apiUrlCheck.apiUrl;
    diagnostics.configuration.apiUrlValid = apiUrlCheck.apiUrlValid;
    checks.push(apiUrlCheck.check);
    if (!apiUrlCheck.check.ok) {
      hasErrors = true;
    }

    let thresholdCheck = getThresholdCheck(config?.comparison?.threshold);
    diagnostics.configuration.threshold = thresholdCheck.threshold;
    diagnostics.configuration.thresholdValid = thresholdCheck.thresholdValid;
    checks.push(thresholdCheck.check);
    if (!thresholdCheck.check.ok) {
      hasErrors = true;
    }

    // Report effective port without binding
    let port = config?.server?.port ?? 47392;
    diagnostics.configuration.port = port;
    checks.push({ name: 'Port', value: String(port), ok: true });

    // Optional: API connectivity check when --api is provided or VIZZLY_TOKEN is present
    if (willCheckConnectivity) {
      diagnostics.connectivity.checked = true;
      if (!config.apiKey) {
        diagnostics.connectivity.ok = false;
        diagnostics.connectivity.error = 'Missing API token (VIZZLY_TOKEN)';
        checks.push({ name: 'API Token', value: 'missing', ok: false });
        hasErrors = true;
      } else {
        output.startSpinner('Checking API connectivity...');
        try {
          let client = createApiClient({
            baseUrl: config.apiUrl,
            token: config.apiKey,
            command: 'doctor',
          });
          // Minimal, read-only call
          await getBuilds(client, { limit: 1 });
          output.stopSpinner();
          diagnostics.connectivity.ok = true;
          checks.push({ name: 'API', value: 'connected', ok: true });
        } catch (err) {
          output.stopSpinner();
          diagnostics.connectivity.ok = false;
          diagnostics.connectivity.error = err?.message || String(err);
          checks.push({ name: 'API', value: 'connection failed', ok: false });
          hasErrors = true;
        }
      }
    }

    // Output results
    if (globalOptions.json) {
      // JSON mode - structured output only
      output.data({
        passed: !hasErrors,
        diagnostics,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Human-readable output - display results as a checklist
      // Use printErr to match header (both on stderr for consistent ordering)
      let colors = output.getColors();
      for (let check of checks) {
        let icon = check.ok
          ? colors.brand.success('✓')
          : colors.brand.danger('✗');
        let label = colors.brand.textTertiary(check.name.padEnd(12));
        output.printErr(`  ${icon} ${label} ${check.value}`);
      }
      output.printErr('');

      // Summary
      if (hasErrors) {
        output.warn('Preflight completed with issues');
      } else {
        output.printErr(`  ${colors.brand.success('✓')} Preflight passed`);
      }

      // Dynamic context section (same as help output)
      let contextItems = getContext();
      if (contextItems.length > 0) {
        output.printErr('');
        output.printErr(`  ${colors.dim('─'.repeat(52))}`);
        for (let item of contextItems) {
          if (item.type === 'success') {
            output.printErr(
              `  ${colors.green('✓')} ${colors.gray(item.label)}  ${colors.white(item.value)}`
            );
          } else if (item.type === 'warning') {
            output.printErr(
              `  ${colors.yellow('!')} ${colors.gray(item.label)}  ${colors.yellow(item.value)}`
            );
          } else {
            output.printErr(
              `  ${colors.dim('○')} ${colors.gray(item.label)}  ${colors.dim(item.value)}`
            );
          }
        }
      }

      // Footer with links
      output.printErr('');
      output.printErr(`  ${colors.dim('─'.repeat(52))}`);
      output.printErr(
        `  ${colors.dim('Docs')} ${colors.cyan(colors.underline('docs.vizzly.dev'))}  ${colors.dim('GitHub')} ${colors.cyan(colors.underline('github.com/vizzly-testing/cli'))}`
      );

      // Emit structured data in verbose mode (in addition to visual output)
      if (globalOptions.verbose) {
        output.data({
          passed: !hasErrors,
          diagnostics,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    hasErrors = true;
    output.error('Failed to run preflight', error);
  } finally {
    output.cleanup();
    if (hasErrors) exit(1);
  }
}

/**
 * Validate doctor options (no specific validation needed)
 * @param {Object} options - Command options
 */
export function validateDoctorOptions() {
  return []; // No specific validation for now
}
