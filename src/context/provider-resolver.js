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
  let localSnapshot =
    typeof localProvider.loadSnapshot === 'function'
      ? localProvider.loadSnapshot()
      : null;
  let isLocalAvailable =
    localSnapshot == null
      ? localProvider.isAvailable()
      : localProvider.isAvailable(localSnapshot);

  if (requestedSource === 'local') {
    if (!isLocalAvailable) {
      let error = new Error(
        'No local workspace context found. Start a local TDD session or ensure .vizzly/ has report data.'
      );
      error.code = 'LOCAL_WORKSPACE_CONTEXT';
      throw error;
    }

    return 'local';
  }

  if (
    isLocalAvailable &&
    (localSnapshot == null
      ? localProvider.canHandle(command, target)
      : localProvider.canHandle(command, target, localSnapshot))
  ) {
    return 'local';
  }

  return 'cloud';
}
