import { URL } from 'url';
import { loadConfig } from '../utils/config-loader.js';
import * as output from '../utils/output.js';
import { ApiService } from '../services/api-service.js';
import { ConfigError } from '../errors/vizzly-error.js';
import { getApiToken } from '../utils/environment-config.js';

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

  try {
    // Determine if we'll attempt remote checks (API connectivity)
    let willCheckConnectivity = Boolean(options.api || getApiToken());

    // Announce preflight, indicating local-only when no token/connectivity is planned
    output.info(
      `Running Vizzly preflight${willCheckConnectivity ? '' : ' (local checks only)'}...`
    );

    // Node.js version check (require >= 20)
    let nodeVersion = process.version;
    let nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    diagnostics.environment.nodeVersion = nodeVersion;
    diagnostics.environment.nodeVersionValid = nodeMajor >= 20;
    if (nodeMajor >= 20) {
      output.success(`Node.js version: ${nodeVersion} (supported)`);
    } else {
      hasErrors = true;
      output.error('Node.js version must be >= 20');
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
      output.success(`API URL: ${config.apiUrl}`);
    } catch (e) {
      diagnostics.configuration.apiUrlValid = false;
      hasErrors = true;
      output.error(
        'Invalid apiUrl in configuration (set VIZZLY_API_URL or config file)',
        e
      );
    }

    // Validate threshold (0..1 inclusive)
    let threshold = Number(config?.comparison?.threshold);
    diagnostics.configuration.threshold = threshold;
    let thresholdValid =
      Number.isFinite(threshold) && threshold >= 0 && threshold <= 1;
    diagnostics.configuration.thresholdValid = thresholdValid;
    if (thresholdValid) {
      output.success(`Threshold: ${threshold}`);
    } else {
      hasErrors = true;
      output.error('Invalid threshold (expected number between 0 and 1)');
    }

    // Report effective port without binding
    let port = config?.server?.port ?? 47392;
    diagnostics.configuration.port = port;
    output.info(`Effective port: ${port}`);

    // Optional: API connectivity check when --api is provided or VIZZLY_TOKEN is present
    let autoApi = Boolean(getApiToken());
    if (options.api || autoApi) {
      diagnostics.connectivity.checked = true;
      if (!config.apiKey) {
        diagnostics.connectivity.ok = false;
        diagnostics.connectivity.error = 'Missing API token (VIZZLY_TOKEN)';
        hasErrors = true;
        output.error('Missing API token for connectivity check');
      } else {
        output.progress('Checking API connectivity...');
        try {
          let api = new ApiService({
            baseUrl: config.apiUrl,
            token: config.apiKey,
            command: 'doctor',
          });
          // Minimal, read-only call
          await api.getBuilds({ limit: 1 });
          diagnostics.connectivity.ok = true;
          output.success('API connectivity OK');
        } catch (err) {
          diagnostics.connectivity.ok = false;
          diagnostics.connectivity.error = err?.message || String(err);
          hasErrors = true;
          output.error('API connectivity failed', err);
        }
      }
    }

    // Summary
    if (hasErrors) {
      output.warn('Preflight completed with issues.');
    } else {
      output.success('Preflight passed.');
    }

    // Emit structured data in json/verbose modes
    if (globalOptions.json || globalOptions.verbose) {
      output.data({
        passed: !hasErrors,
        diagnostics,
        timestamp: new Date().toISOString(),
      });
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
