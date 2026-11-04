import { createUserSession } from './auth.service.js';
import { selectCredential } from './credential.rules.js';

/** Select one identity without refreshing during configuration discovery. */
export function resolveCredential(config, options = {}) {
  let credential = selectCredential(config, options);
  if (credential.source === 'user') {
    credential.session = createUserSession({
      baseUrl: config.apiUrl,
      command: options.command,
    });
  }
  return credential;
}
