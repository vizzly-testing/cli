import { URL } from 'node:url';
import { createApiClient, getBuilds } from '../api/index.js';
import { ConfigError } from '../errors/vizzly-error.js';
import { loadConfig } from '../utils/config-loader.js';
import { getApiToken } from '../utils/environment-config.js';
import * as output from '../utils/output.js';

/**
 * Doctor command implementation - Run diagnostics to check environment
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function doctorCommand(options = {}, globalOptions = {}) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let diagnostics = {
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

  let hasErrors = false;
  let checks = [];

  try {
    // Determine if we'll attempt remote checks (API connectivity)
    let willCheckConnectivity = Boolean(options.api || getApiToken());

    // Show header
    output.header('doctor', willCheckConnectivity ? 'full' : 'local');

    // Node.js version check (require >= 20)
    let nodeVersion = process.version;
    let nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    diagnostics.environment.nodeVersion = nodeVersion;
    diagnostics.environment.nodeVersionValid = nodeMajor >= 20;
    if (nodeMajor >= 20) {
      checks.push({
        name: 'Node.js',
        value: `${nodeVersion} (supported)`,
        ok: true,
      });
    } else {
      checks.push({
        name: 'Node.js',
        value: `${nodeVersion} (requires >= 20)`,
        ok: false,
      });
      hasErrors = true;
    }

    // Load configuration (apply global CLI overrides like --config only)
    let config = await loadConfig(globalOptions.config);

    // Validate apiUrl
    diagnostics.configuration.apiUrl = config.apiUrl;
    try {
      let url = new URL(config.apiUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new ConfigError('URL must use http or https');
      }
      diagnostics.configuration.apiUrlValid = true;
      checks.push({ name: 'API URL', value: config.apiUrl, ok: true });
    } catch (_e) {
      diagnostics.configuration.apiUrlValid = false;
      checks.push({
        name: 'API URL',
        value: 'invalid (check VIZZLY_API_URL)',
        ok: false,
      });
      hasErrors = true;
    }

    // Validate threshold (0..1 inclusive)
    let threshold = Number(config?.comparison?.threshold);
    diagnostics.configuration.threshold = threshold;
    // CIEDE2000 threshold: 0 = exact, 1 = JND, 2 = recommended, 3+ = permissive
    let thresholdValid = Number.isFinite(threshold) && threshold >= 0;
    diagnostics.configuration.thresholdValid = thresholdValid;
    if (thresholdValid) {
      checks.push({
        name: 'Threshold',
        value: `${threshold} (CIEDE2000)`,
        ok: true,
      });
    } else {
      checks.push({ name: 'Threshold', value: 'invalid', ok: false });
      hasErrors = true;
    }

    // Report effective port without binding
    let port = config?.server?.port ?? 47392;
    diagnostics.configuration.port = port;
    checks.push({ name: 'Port', value: String(port), ok: true });

    // Optional: API connectivity check when --api is provided or VIZZLY_TOKEN is present
    let autoApi = Boolean(getApiToken());
    if (options.api || autoApi) {
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
      let colors = output.getColors();
      for (let check of checks) {
        let icon = check.ok
          ? colors.brand.success('✓')
          : colors.brand.danger('✗');
        let label = colors.brand.textTertiary(check.name.padEnd(12));
        output.print(`  ${icon} ${label} ${check.value}`);
      }
      output.blank();

      // Summary
      if (hasErrors) {
        output.warn('Preflight completed with issues');
      } else {
        output.complete('Preflight passed');
      }

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
    if (hasErrors) process.exit(1);
  }
}

/**
 * Validate doctor options (no specific validation needed)
 * @param {Object} options - Command options
 */
export function validateDoctorOptions() {
  return []; // No specific validation for now
}
