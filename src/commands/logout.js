/**
 * Logout command implementation
 * Clears stored authentication tokens
 */

import { ConsoleUI } from '../utils/console-ui.js';
import { AuthService } from '../services/auth-service.js';
import { getApiUrl } from '../utils/environment-config.js';
import { getAuthTokens } from '../utils/global-config.js';

/**
 * Logout command implementation
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function logoutCommand(options = {}, globalOptions = {}) {
  // Create UI handler
  let ui = new ConsoleUI({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    // Check if user is logged in
    let auth = await getAuthTokens();

    if (!auth || !auth.accessToken) {
      ui.info('You are not logged in');
      ui.cleanup();
      return;
    }

    // Logout
    ui.startSpinner('Logging out...');

    let authService = new AuthService({
      baseUrl: options.apiUrl || getApiUrl(),
    });

    await authService.logout();

    ui.stopSpinner();
    ui.success('Successfully logged out');

    if (globalOptions.json) {
      ui.data({ loggedOut: true });
    } else {
      console.log(''); // Empty line for spacing
      ui.info('Your authentication tokens have been cleared');
      ui.info('Run "vizzly login" to authenticate again');
    }

    ui.cleanup();
  } catch (error) {
    ui.stopSpinner();
    ui.error('Logout failed', error, 0);

    if (globalOptions.verbose && error.stack) {
      console.error(''); // Empty line for spacing
      console.error(error.stack);
    }

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
