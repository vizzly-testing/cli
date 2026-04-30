import { createLocalWorkspaceContextProvider as defaultCreateLocalWorkspaceContextProvider } from './local-workspace-provider.js';

export function resolveContextSource(options = {}, deps = {}) {
  let {
    requestedSource = 'auto',
    command,
    target = null,
    projectRoot = process.cwd(),
  } = options;
  let {
    createLocalWorkspaceContextProvider = defaultCreateLocalWorkspaceContextProvider,
  } = deps;

  if (requestedSource === 'cloud') {
    return 'cloud';
  }

  let localProvider = createLocalWorkspaceContextProvider({ projectRoot });

  if (requestedSource === 'local') {
    if (!localProvider.isAvailable()) {
      let error = new Error(
        'No local workspace context found. Start a local TDD session or ensure .vizzly/ has report data.'
      );
      error.code = 'LOCAL_WORKSPACE_CONTEXT';
      throw error;
    }

    return 'local';
  }

  if (localProvider.isAvailable() && localProvider.canHandle(command, target)) {
    return 'local';
  }

  return 'cloud';
}
