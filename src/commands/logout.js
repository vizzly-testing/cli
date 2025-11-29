/**
 * Logout command implementation
 * Clears stored authentication tokens
 */

import * as output from '../utils/output.js';
import { AuthService } from '../services/auth-service.js';
import { getApiUrl } from '../utils/environment-config.js';
import { getAuthTokens } from '../utils/global-config.js';

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
    let auth = await getAuthTokens();

    if (!auth || !auth.accessToken) {
      output.info('You are not logged in');
      output.cleanup();
      return;
    }

    // Logout
    output.startSpinner('Logging out...');

    let authService = new AuthService({
      baseUrl: options.apiUrl || getApiUrl(),
    });

    await authService.logout();

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
  let errors = [];

  // No specific validation needed for logout command

  return errors;
}
