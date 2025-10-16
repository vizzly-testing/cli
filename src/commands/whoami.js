/**
 * Whoami command implementation
 * Shows current user and authentication status
 */

import { ConsoleUI } from '../utils/console-ui.js';
import { AuthService } from '../services/auth-service.js';
import { getApiUrl } from '../utils/environment-config.js';
import { getAuthTokens } from '../utils/global-config.js';

/**
 * Whoami command implementation
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function whoamiCommand(options = {}, globalOptions = {}) {
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
      if (globalOptions.json) {
        ui.data({ authenticated: false });
      } else {
        ui.info('You are not logged in');
        console.log(''); // Empty line for spacing
        ui.info('Run "vizzly login" to authenticate');
      }
      ui.cleanup();
      return;
    }

    // Get current user info
    ui.startSpinner('Fetching user information...');

    let authService = new AuthService({
      baseUrl: options.apiUrl || getApiUrl(),
    });

    let response = await authService.whoami();

    ui.stopSpinner();

    // Output in JSON mode
    if (globalOptions.json) {
      ui.data({
        authenticated: true,
        user: response.user,
        organizations: response.organizations || [],
        tokenExpiresAt: auth.expiresAt,
      });
      ui.cleanup();
      return;
    }

    // Human-readable output
    ui.success('Authenticated');
    console.log(''); // Empty line for spacing

    // Show user info
    if (response.user) {
      ui.info(`User: ${response.user.name || response.user.username}`);
      ui.info(`Email: ${response.user.email}`);

      if (response.user.username) {
        ui.info(`Username: ${response.user.username}`);
      }

      if (globalOptions.verbose && response.user.id) {
        ui.info(`User ID: ${response.user.id}`);
      }
    }

    // Show organizations
    if (response.organizations && response.organizations.length > 0) {
      console.log(''); // Empty line for spacing
      ui.info('Organizations:');
      for (let org of response.organizations) {
        let orgInfo = `  - ${org.name}`;
        if (org.slug) {
          orgInfo += ` (@${org.slug})`;
        }
        if (org.role) {
          orgInfo += ` [${org.role}]`;
        }
        console.log(orgInfo);

        if (globalOptions.verbose && org.id) {
          console.log(`    ID: ${org.id}`);
        }
      }
    }

    // Show token expiry info
    if (auth.expiresAt) {
      console.log(''); // Empty line for spacing
      let expiresAt = new Date(auth.expiresAt);
      let now = new Date();
      let msUntilExpiry = expiresAt.getTime() - now.getTime();
      let daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));
      let hoursUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60));
      let minutesUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60));

      if (msUntilExpiry <= 0) {
        ui.warning('Token has expired');
        console.log(''); // Empty line for spacing
        ui.info('Run "vizzly login" to refresh your authentication');
      } else if (daysUntilExpiry > 0) {
        ui.info(
          `Token expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''} (${expiresAt.toLocaleDateString()})`
        );
      } else if (hoursUntilExpiry > 0) {
        ui.info(
          `Token expires in ${hoursUntilExpiry} hour${hoursUntilExpiry !== 1 ? 's' : ''} (${expiresAt.toLocaleString()})`
        );
      } else if (minutesUntilExpiry > 0) {
        ui.info(
          `Token expires in ${minutesUntilExpiry} minute${minutesUntilExpiry !== 1 ? 's' : ''}`
        );
      } else {
        ui.warning('Token expires in less than a minute');
        console.log(''); // Empty line for spacing
        ui.info('Run "vizzly login" to refresh your authentication');
      }

      if (globalOptions.verbose) {
        ui.info(`Token expires at: ${expiresAt.toISOString()}`);
      }
    }

    ui.cleanup();
  } catch (error) {
    ui.stopSpinner();

    // Handle authentication errors with helpful messages
    if (error.name === 'AuthError') {
      if (globalOptions.json) {
        ui.data({
          authenticated: false,
          error: error.message,
        });
      } else {
        ui.error('Authentication token is invalid or expired', error, 0);
        console.log(''); // Empty line for spacing
        ui.info('Run "vizzly login" to authenticate again');
      }
      ui.cleanup();
      process.exit(1);
    } else {
      ui.error('Failed to get user information', error, 0);

      if (globalOptions.verbose && error.stack) {
        console.error(''); // Empty line for spacing
        console.error(error.stack);
      }

      process.exit(1);
    }
  }
}

/**
 * Validate whoami options
 * @param {Object} options - Command options
 */
export function validateWhoamiOptions() {
  let errors = [];

  // No specific validation needed for whoami command

  return errors;
}
