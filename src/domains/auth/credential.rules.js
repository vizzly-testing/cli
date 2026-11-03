import { VizzlyError } from '../../shared/vizzly-error.js';

export function selectCredential(config, options = {}) {
  let mode = options.auth || 'auto';
  if (!['auto', 'user', 'token'].includes(mode)) {
    throw new VizzlyError(
      '--auth must be auto, user, or token.',
      'INVALID_AUTH'
    );
  }
  if (
    mode === 'user' &&
    (options.token || config.credentialSource === 'flag')
  ) {
    throw new VizzlyError(
      'Use either --auth user or --token, not both.',
      'INVALID_AUTH'
    );
  }
  let source =
    config.credentialSource ||
    (config.linkedProject ? 'linked-project' : 'config');
  let useUser =
    mode === 'user' ||
    (mode === 'auto' &&
      config.userToken &&
      (!config.apiKey || source === 'linked-project'));
  let token = useUser ? config.userToken : config.apiKey;
  if (!token && (!options.allowNoToken || mode !== 'auto')) {
    throw new VizzlyError(
      mode === 'token'
        ? 'API token required. Set VIZZLY_TOKEN or link an upload project with vizzly project link <org>/<project>.'
        : 'Login required. Run vizzly login, then rerun this command.',
      'LOGIN_REQUIRED'
    );
  }
  return {
    token: token || null,
    source: token ? (useUser ? 'user' : source) : 'anonymous',
    kind: useUser ? 'user' : token?.startsWith('vzt_') ? 'project' : 'token',
  };
}

export function credentialInfo(credential) {
  return { source: credential.source, kind: credential.kind };
}
