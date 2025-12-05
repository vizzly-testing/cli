/**
 * Whoami command implementation
 * Shows current user and authentication status
 */

import { AuthService } from '../services/auth-service.js';
import { getApiUrl } from '../utils/environment-config.js';
import { getAuthTokens } from '../utils/global-config.js';
import * as output from '../utils/output.js';

/**
 * Whoami command implementation
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function whoamiCommand(options = {}, globalOptions = {}) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    // Check if user is logged in
    const auth = await getAuthTokens();

    if (!auth || !auth.accessToken) {
      if (globalOptions.json) {
        output.data({ authenticated: false });
      } else {
        output.info('You are not logged in');
        output.blank();
        output.info('Run "vizzly login" to authenticate');
      }
      output.cleanup();
      return;
    }

    // Get current user info
    output.startSpinner('Fetching user information...');

    const authService = new AuthService({
      baseUrl: options.apiUrl || getApiUrl(),
    });

    const response = await authService.whoami();

    output.stopSpinner();

    // Output in JSON mode
    if (globalOptions.json) {
      output.data({
        authenticated: true,
        user: response.user,
        organizations: response.organizations || [],
        tokenExpiresAt: auth.expiresAt,
      });
      output.cleanup();
      return;
    }

    // Human-readable output
    output.success('Authenticated');
    output.blank();

    // Show user info
    if (response.user) {
      output.info(`User: ${response.user.name || response.user.username}`);
      output.info(`Email: ${response.user.email}`);

      if (response.user.username) {
        output.info(`Username: ${response.user.username}`);
      }

      if (globalOptions.verbose && response.user.id) {
        output.info(`User ID: ${response.user.id}`);
      }
    }

    // Show organizations
    if (response.organizations && response.organizations.length > 0) {
      output.blank();
      output.info('Organizations:');
      for (const org of response.organizations) {
        let orgInfo = `  - ${org.name}`;
        if (org.slug) {
          orgInfo += ` (@${org.slug})`;
        }
        if (org.role) {
          orgInfo += ` [${org.role}]`;
        }
        output.print(orgInfo);

        if (globalOptions.verbose && org.id) {
          output.print(`    ID: ${org.id}`);
        }
      }
    }

    // Show token expiry info
    if (auth.expiresAt) {
      output.blank();
      const expiresAt = new Date(auth.expiresAt);
      const now = new Date();
      const msUntilExpiry = expiresAt.getTime() - now.getTime();
      const daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));
      const hoursUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60));
      const minutesUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60));

      if (msUntilExpiry <= 0) {
        output.warn('Token has expired');
        output.blank();
        output.info('Run "vizzly login" to refresh your authentication');
      } else if (daysUntilExpiry > 0) {
        output.info(
          `Token expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''} (${expiresAt.toLocaleDateString()})`
        );
      } else if (hoursUntilExpiry > 0) {
        output.info(
          `Token expires in ${hoursUntilExpiry} hour${hoursUntilExpiry !== 1 ? 's' : ''} (${expiresAt.toLocaleString()})`
        );
      } else if (minutesUntilExpiry > 0) {
        output.info(
          `Token expires in ${minutesUntilExpiry} minute${minutesUntilExpiry !== 1 ? 's' : ''}`
        );
      } else {
        output.warn('Token expires in less than a minute');
        output.blank();
        output.info('Run "vizzly login" to refresh your authentication');
      }

      if (globalOptions.verbose) {
        output.info(`Token expires at: ${expiresAt.toISOString()}`);
      }
    }

    output.cleanup();
  } catch (error) {
    output.stopSpinner();

    // Handle authentication errors with helpful messages
    if (error.name === 'AuthError') {
      if (globalOptions.json) {
        output.data({
          authenticated: false,
          error: error.message,
        });
      } else {
        output.error('Authentication token is invalid or expired', error);
        output.blank();
        output.info('Run "vizzly login" to authenticate again');
      }
      output.cleanup();
      process.exit(1);
    } else {
      output.error('Failed to get user information', error);
      process.exit(1);
    }
  }
}

/**
 * Validate whoami options
 * @param {Object} options - Command options
 */
export function validateWhoamiOptions() {
  const errors = [];

  // No specific validation needed for whoami command

  return errors;
}
