/** Context command orchestration and provider selection. */

import * as defaultOutput from '../../shared/output.js';
import { createApiClient as defaultCreateApiClient } from '../auth/cloud-client.js';
import { resolveCredential } from '../auth/credential.service.js';
import { showCredential } from '../auth/credential-presentation.js';
import { loadConfig as defaultLoadConfig } from '../config/config-loader.js';
import { showProjectSelection } from '../projects/project-presentation.js';
import {
  isProjectSelectionInteractive,
  resolveProjectSelection,
} from '../projects/project-selection.service.js';
import { readSession as defaultReadSession } from '../runs/session-store.js';
import {
  validateCompactContext,
  validateCompactOutputSize,
} from './compact-context.validations.js';
import {
  buildCompactBuildPayload,
  buildCompactComparisonPayload,
  buildCompactContextRequest,
  buildScopeQuery,
} from './context.serializers.js';
import {
  getBuildContext as defaultGetBuildContext,
  getComparisonContext as defaultGetComparisonContext,
  getReviewQueueContext as defaultGetReviewQueueContext,
  getScreenshotContext as defaultGetScreenshotContext,
  getSimilarFingerprintContext as defaultGetSimilarFingerprintContext,
} from './context.service.js';
import {
  displayBuildContext,
  displayCompactBuildContext,
  displayCompactComparisonContext,
  displayComparisonContext,
  displayFingerprintContext,
  displayReviewQueueContext,
  displayScreenshotContext,
} from './context-presentation.js';
import { createLocalWorkspaceContextProvider as defaultCreateLocalWorkspaceContextProvider } from './local-workspace-provider.js';
import { resolveContextSource as defaultResolveContextSource } from './provider-resolver.js';

function hasExplicitCloudScope(options = {}, config = {}) {
  return Boolean(
    options.org ||
      options.project ||
      config.project ||
      config.linkedProject?.organizationSlug ||
      config.linkedProject?.projectSlug
  );
}

function createClient(config, createApiClient) {
  return createApiClient({
    baseUrl: config.apiUrl,
    token: config.readCredential.token,
    credential: config.readCredential,
    command: 'context',
  });
}

/**
 * Attach the provider that produced a context payload.
 *
 * Context endpoints return API-owned evidence, while source selection belongs
 * to the CLI. Keeping both in one payload prevents follow-up agent commands
 * from silently crossing between cloud and local evidence.
 *
 * @param {Object} context - Context payload returned by a provider.
 * @param {string} source - Provider source selected by the CLI.
 * @returns {Object} Context payload with explicit source provenance.
 */
function attachContextSource(context, source, projectSelection) {
  return {
    ...context,
    source,
    ...(projectSelection ? { projectSelection } : {}),
  };
}

function createCloudContextProvider(config, deps = {}, selectedClient = null) {
  let {
    createApiClient = defaultCreateApiClient,
    getBuildContext = defaultGetBuildContext,
    getComparisonContext = defaultGetComparisonContext,
    getScreenshotContext = defaultGetScreenshotContext,
    getSimilarFingerprintContext = defaultGetSimilarFingerprintContext,
    getReviewQueueContext = defaultGetReviewQueueContext,
  } = deps;
  let client = selectedClient || createClient(config, createApiClient);

  return {
    source: 'cloud',
    async getBuildContext(buildId, query) {
      return attachContextSource(
        await getBuildContext(client, buildId, query),
        'cloud'
      );
    },
    async getComparisonContext(comparisonId, query) {
      return attachContextSource(
        await getComparisonContext(client, comparisonId, query),
        'cloud'
      );
    },
    async getScreenshotContext(screenshotName, query) {
      return attachContextSource(
        await getScreenshotContext(client, screenshotName, {
          ...config.projectSelection?.projectQuery,
          ...query,
        }),
        'cloud',
        config.projectSelection
      );
    },
    async getSimilarFingerprintContext(fingerprintHash, query) {
      return attachContextSource(
        await getSimilarFingerprintContext(client, fingerprintHash, {
          ...config.projectSelection?.projectQuery,
          ...query,
        }),
        'cloud',
        config.projectSelection
      );
    },
    async getReviewQueueContext(query) {
      return attachContextSource(
        await getReviewQueueContext(client, {
          ...config.projectSelection?.projectQuery,
          ...query,
        }),
        'cloud',
        config.projectSelection
      );
    },
  };
}

function buildLocalFingerprintCapabilityError() {
  let error = new Error(
    'Local workspace context does not support fingerprint similarity yet. Use --source cloud for this query.'
  );
  error.code = 'LOCAL_WORKSPACE_CONTEXT';
  return error;
}

function resolveBuildContextId(buildId, runtime, deps = {}) {
  let { readSession = defaultReadSession } = deps;

  if (buildId !== 'current' || runtime.source !== 'cloud') {
    return buildId;
  }

  let session = readSession({ cwd: runtime.projectRoot });

  if (session?.buildId && !session.expired) {
    return session.buildId;
  }

  let error = new Error(
    'No current cloud build found. Run "vizzly run" first, or pass a build ID.'
  );
  error.code = 'NO_CURRENT_CLOUD_BUILD';
  throw error;
}

function shouldExplainLocalSimilarityGap(
  requestedSource,
  command,
  localProvider
) {
  return (
    requestedSource === 'auto' &&
    command === 'similar' &&
    localProvider.isAvailable()
  );
}

async function loadContextRuntime(
  command,
  target,
  globalOptions,
  options,
  deps = {}
) {
  let {
    createLocalWorkspaceContextProvider = defaultCreateLocalWorkspaceContextProvider,
    resolveContextSource = defaultResolveContextSource,
    output = defaultOutput,
    loadConfig = defaultLoadConfig,
  } = deps;

  let config = await loadConfig(globalOptions.config, {
    ...globalOptions,
    ...options,
  });
  let requestedSource = options.source || 'auto';
  let projectRoot = deps.projectRoot || process.cwd();
  let localProvider = createLocalWorkspaceContextProvider({ projectRoot });
  let source = resolveContextSource(
    {
      requestedSource,
      command,
      target,
      projectRoot,
      hasCloudScope: hasExplicitCloudScope(options, config),
    },
    {
      createLocalWorkspaceContextProvider,
    }
  );

  let cloudClient;
  if (source === 'cloud') {
    if (
      !config.apiKey &&
      !config.userToken &&
      shouldExplainLocalSimilarityGap(requestedSource, command, localProvider)
    ) {
      throw buildLocalFingerprintCapabilityError();
    }
    config.readCredential = resolveCredential(config, {
      ...globalOptions,
      ...options,
      command: 'context',
    });
    if (!globalOptions.json) showCredential(output, config.readCredential);
    cloudClient = createClient(
      config,
      deps.createApiClient || defaultCreateApiClient
    );
    if (['screenshot', 'similar', 'review-queue'].includes(command)) {
      config.projectSelection = await resolveProjectSelection(config, {
        credential: config.readCredential,
        client: cloudClient,
        cwd: projectRoot,
        project: options.project,
        org: options.org,
        interactive: isProjectSelectionInteractive(),
      });
      if (!globalOptions.json)
        showProjectSelection(output, config.projectSelection);
    }
  }

  let provider =
    source === 'local'
      ? localProvider
      : createCloudContextProvider(config, deps, cloudClient);

  return {
    config,
    source,
    provider,
  };
}

export async function contextBuildCommand(
  buildId,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let { output = defaultOutput, exit = code => process.exit(code) } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let runtime = await loadContextRuntime(
      'build',
      buildId,
      globalOptions,
      options,
      {
        ...deps,
        output,
        exit,
      }
    );
    if (!runtime) {
      return;
    }

    let resolvedBuildId = resolveBuildContextId(buildId, runtime, deps);
    let { compact, details, include, query } = buildCompactContextRequest(
      options,
      globalOptions
    );

    output.startSpinner('Fetching build context...');
    let context = await runtime.provider.getBuildContext(
      resolvedBuildId,
      query
    );
    output.stopSpinner();

    if (compact) {
      let compactContext = validateCompactContext(context, 'build');
      let payload = validateCompactOutputSize(
        buildCompactBuildPayload(compactContext, include, options.cursor),
        'build',
        details
      );

      if (globalOptions.json) {
        output.data(payload);
      } else {
        displayCompactBuildContext(output, payload);
      }
      output.cleanup();
      return;
    }

    if (globalOptions.json) {
      output.data(context);
      output.cleanup();
      return;
    }

    displayBuildContext(output, context);
    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch build context', error);
    output.cleanup();
    exit(1);
  }
}

export async function contextComparisonCommand(
  comparisonId,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let { output = defaultOutput, exit = code => process.exit(code) } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let runtime = await loadContextRuntime(
      'comparison',
      comparisonId,
      globalOptions,
      options,
      {
        ...deps,
        output,
        exit,
      }
    );
    if (!runtime) {
      return;
    }
    let { compact, details, include, query } = buildCompactContextRequest(
      options,
      globalOptions
    );

    output.startSpinner('Fetching comparison context...');
    let context = await runtime.provider.getComparisonContext(
      comparisonId,
      query
    );
    output.stopSpinner();

    if (compact) {
      let compactContext = validateCompactContext(context, 'comparison');
      let payload = validateCompactOutputSize(
        buildCompactComparisonPayload(compactContext, include),
        'comparison',
        details
      );

      if (globalOptions.json) {
        output.data(payload);
      } else {
        displayCompactComparisonContext(output, payload);
      }
      output.cleanup();
      return;
    }

    if (globalOptions.json) {
      output.data(context);
      output.cleanup();
      return;
    }

    displayComparisonContext(output, context);
    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch comparison context', error);
    output.cleanup();
    exit(1);
  }
}

export async function contextScreenshotCommand(
  screenshotName,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let { output = defaultOutput, exit = code => process.exit(code) } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let runtime = await loadContextRuntime(
      'screenshot',
      screenshotName,
      globalOptions,
      options,
      {
        ...deps,
        output,
        exit,
      }
    );
    if (!runtime) {
      return;
    }
    let query = buildScopeQuery(options, {
      recentLimit: options.recentLimit,
    });

    output.startSpinner('Fetching screenshot context...');
    let context = await runtime.provider.getScreenshotContext(
      screenshotName,
      query
    );
    output.stopSpinner();

    if (globalOptions.json) {
      output.data(context);
      output.cleanup();
      return;
    }

    displayScreenshotContext(output, context);
    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch screenshot context', error);
    output.cleanup();
    exit(1);
  }
}

export async function contextSimilarCommand(
  fingerprintHash,
  options = {},
  globalOptions = {},
  deps = {}
) {
  let { output = defaultOutput, exit = code => process.exit(code) } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let runtime = await loadContextRuntime(
      'similar',
      fingerprintHash,
      globalOptions,
      options,
      {
        ...deps,
        output,
        exit,
      }
    );
    if (!runtime) {
      return;
    }
    let query = buildScopeQuery(options, {
      limit: options.limit,
    });

    output.startSpinner('Fetching similar visual context...');
    let context = await runtime.provider.getSimilarFingerprintContext(
      fingerprintHash,
      query
    );
    output.stopSpinner();

    if (globalOptions.json) {
      output.data(context);
      output.cleanup();
      return;
    }

    displayFingerprintContext(output, context);
    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch similar visual context', error);
    output.cleanup();
    exit(1);
  }
}

export async function contextReviewQueueCommand(
  options = {},
  globalOptions = {},
  deps = {}
) {
  let { output = defaultOutput, exit = code => process.exit(code) } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let runtime = await loadContextRuntime(
      'review-queue',
      null,
      globalOptions,
      options,
      {
        ...deps,
        output,
        exit,
      }
    );
    if (!runtime) {
      return;
    }
    let query = buildScopeQuery(options, {
      limit: options.limit,
      offset: options.offset,
    });

    output.startSpinner('Fetching review queue context...');
    let context = await runtime.provider.getReviewQueueContext(query);
    output.stopSpinner();

    if (globalOptions.json) {
      output.data(context);
      output.cleanup();
      return;
    }

    displayReviewQueueContext(output, context);
    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Failed to fetch review queue context', error);
    output.cleanup();
    exit(1);
  }
}
