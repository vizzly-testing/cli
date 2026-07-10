/**
 * Logout command implementation
 * Clears stored authentication tokens
 */

import {
  createAuthClient as defaultCreateAuthClient,
  createTokenStore as defaultCreateTokenStore,
  getAuthTokens as defaultGetAuthTokens,
  logout as defaultLogout,
} from '../auth/index.js';
import { getApiUrl as defaultGetApiUrl } from '../utils/environment-config.js';
import * as defaultOutput from '../utils/output.js';

/**
 * Logout command implementation
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function logoutCommand(
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    createAuthClient = defaultCreateAuthClient,
    createTokenStore = defaultCreateTokenStore,
    getApiUrl = defaultGetApiUrl,
    getAuthTokens = defaultGetAuthTokens,
    logout = defaultLogout,
    output = defaultOutput,
    exit = code => process.exit(code),
  } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    // Check if user is logged in
    let auth = await getAuthTokens();

    if (!auth?.accessToken) {
      if (globalOptions.json) {
        output.data({ loggedOut: false, reason: 'not_logged_in' });
      } else {
        output.header('logout');
        output.print('  Not logged in');
      }
      output.cleanup();
      return;
    }

    // Logout
    output.startSpinner('Logging out...');

    let client = createAuthClient({
      baseUrl: options.apiUrl || auth.apiUrl || getApiUrl(),
    });
    let tokenStore = createTokenStore();

    await logout(client, tokenStore);

    output.stopSpinner();

    if (globalOptions.json) {
      output.data({ loggedOut: true });
    } else {
      output.header('logout');
      output.complete('Logged out');
      output.blank();
      output.hint('Run "vizzly login" to authenticate again');
    }

    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Logout failed', error);
    output.cleanup();
    exit(1);
  }
}

/**
 * Validate logout options
 * @param {Object} options - Command options
 */
export function validateLogoutOptions() {
  let errors = [];

  // No specific validation needed for logout command

  return errors;
}
