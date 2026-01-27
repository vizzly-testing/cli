/**
 * Regions command implementation
 *
 * Download and manage user-defined hotspot regions from the cloud.
 * Regions are 2D bounding boxes that users have confirmed as dynamic content areas.
 */

import {
  createApiClient as defaultCreateApiClient,
  getRegions as defaultGetRegions,
} from '../api/index.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import * as defaultOutput from '../utils/output.js';
import {
  loadBaselineMetadata as defaultLoadBaselineMetadata,
} from '../tdd/metadata/baseline-metadata.js';
import {
  saveRegionMetadata as defaultSaveRegionMetadata,
} from '../tdd/metadata/region-metadata.js';

/**
 * Regions sync command - download user-defined regions from cloud
 *
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function regionsSyncCommand(options = {}, globalOptions = {}, deps = {}) {
  let {
    loadConfig = defaultLoadConfig,
    createApiClient = defaultCreateApiClient,
    getRegions = defaultGetRegions,
    loadBaselineMetadata = defaultLoadBaselineMetadata,
    saveRegionMetadata = defaultSaveRegionMetadata,
    output = defaultOutput,
    exit = code => process.exit(code),
    cwd = process.cwd,
  } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    // Load configuration
    let allOptions = { ...globalOptions, ...options };
    let config = await loadConfig(globalOptions.config, allOptions);

    // Validate API token
    if (!config.apiKey) {
      output.error('API token required. Use --token or set VIZZLY_TOKEN environment variable');
      exit(1);
      return;
    }

    // Determine working directory
    let workingDir = cwd();

    // Get screenshot names from options or baselines
    let screenshotNames;

    if (options.screenshots) {
      // Parse comma-separated names
      screenshotNames = options.screenshots.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      // Get from baseline metadata
      let baselineData = loadBaselineMetadata(`${workingDir}/.vizzly/baselines`);

      if (!baselineData?.screenshots?.length) {
        output.error('No baselines found. Run "vizzly tdd start --sync" first or specify --screenshots');
        exit(1);
        return;
      }

      screenshotNames = [...new Set(baselineData.screenshots.map(s => s.name))];
    }

    if (screenshotNames.length === 0) {
      output.warn('No screenshot names to sync');
      output.cleanup();
      return;
    }

    // Create API client and fetch regions
    output.startSpinner(`Syncing regions for ${screenshotNames.length} screenshots...`);

    let client = createApiClient({
      baseUrl: config.apiUrl,
      token: config.apiKey,
      command: 'regions:sync',
    });

    let response = await getRegions(client, screenshotNames, {
      includeCandidates: options.includeCandidates || false,
    });

    output.stopSpinner();

    if (!response.regions || Object.keys(response.regions).length === 0) {
      if (globalOptions.json) {
        output.data({ synced: 0, regions: {} });
      } else {
        output.info('No user-defined regions found for these screenshots');
      }
      output.cleanup();
      return;
    }

    // Save regions to disk
    saveRegionMetadata(workingDir, response.regions, response.summary);

    let totalRegions = response.summary?.total_regions || 0;
    let screenshotCount = Object.keys(response.regions).length;

    if (globalOptions.json) {
      output.data({
        synced: screenshotCount,
        totalRegions,
        regions: response.regions,
      });
    } else {
      output.complete(`Synced ${totalRegions} regions for ${screenshotCount} screenshots`);

      if (globalOptions.verbose) {
        output.blank();
        for (let [name, data] of Object.entries(response.regions)) {
          let confirmedCount = data.confirmed?.length || 0;
          let candidateCount = data.candidates?.length || 0;
          output.labelValue(name, `${confirmedCount} confirmed, ${candidateCount} candidates`);
        }
      }
    }

    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to sync regions', error);
    exit(1);
  }
}

/**
 * Validate regions sync options
 */
export function validateRegionsSyncOptions() {
  return [];
}
