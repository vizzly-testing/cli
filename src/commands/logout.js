/**
 * Logout command implementation
 * Clears stored authentication tokens
 */

import {
  createAuthClient,
  createTokenStore,
  getAuthTokens,
  logout,
} from '../auth/index.js';
import { getApiUrl } from '../utils/environment-config.js';
import * as output from '../utils/output.js';

/**
 * Logout command implementation
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function logoutCommand(
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    createAuthClient: createAuthClientImpl = createAuthClient,
    createTokenStore: createTokenStoreImpl = createTokenStore,
    getAuthTokens: getAuthTokensImpl = getAuthTokens,
    logout: logoutImpl = logout,
    output: outputImpl = output,
    exit = code => process.exit(code),
  } = deps;

  outputImpl.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let apiUrl = globalOptions.apiUrl || options.apiUrl || getApiUrl();

    // Check if user is logged in
    let auth = await getAuthTokensImpl(apiUrl);

    if (!auth || !auth.accessToken) {
      if (globalOptions.json) {
        outputImpl.data({ loggedOut: false, reason: 'not_logged_in' });
      } else {
        outputImpl.header('logout');
        outputImpl.print('  Not logged in');
      }
      outputImpl.cleanup();
      return;
    }

    // Logout
    outputImpl.startSpinner('Logging out...');

    let client = createAuthClientImpl({
      baseUrl: apiUrl,
    });
    let tokenStore = createTokenStoreImpl(apiUrl);

    await logoutImpl(client, tokenStore);

    outputImpl.stopSpinner();

    if (globalOptions.json) {
      outputImpl.data({ loggedOut: true });
    } else {
      outputImpl.header('logout');
      outputImpl.complete('Logged out');
      outputImpl.blank();
      outputImpl.hint('Run "vizzly login" to authenticate again');
    }

    outputImpl.cleanup();
  } catch (error) {
    outputImpl.stopSpinner();
    outputImpl.error('Logout failed', error);
    exit(1);
  }
}

/**
 * Validate logout options
 * @param {Object} options - Command options
 */
export function validateLogoutOptions() {
  const errors = [];

  // No specific validation needed for logout command

  return errors;
}
