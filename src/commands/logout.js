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
export async function logoutCommand(options = {}, globalOptions = {}) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    // Check if user is logged in
    const auth = await getAuthTokens();

    if (!auth || !auth.accessToken) {
      output.info('You are not logged in');
      output.cleanup();
      return;
    }

    // Logout
    output.startSpinner('Logging out...');

    let client = createAuthClient({
      baseUrl: options.apiUrl || getApiUrl(),
    });
    let tokenStore = createTokenStore();

    await logout(client, tokenStore);

    output.stopSpinner();
    output.success('Successfully logged out');

    if (globalOptions.json) {
      output.data({ loggedOut: true });
    } else {
      output.blank();
      output.info('Your authentication tokens have been cleared');
      output.info('Run "vizzly login" to authenticate again');
    }

    output.cleanup();
  } catch (error) {
    output.stopSpinner();
    output.error('Logout failed', error);
    process.exit(1);
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
