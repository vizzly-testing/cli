/**
 * Whoami command implementation
 * Shows current user and authentication status
 */

import {
  createAuthClient,
  createTokenStore,
  getAuthTokens,
  whoami,
} from '../auth/index.js';
import { getApiUrl } from '../utils/environment-config.js';
import * as output from '../utils/output.js';

/**
 * Whoami command implementation
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function whoamiCommand(
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    createAuthClient: createAuthClientImpl = createAuthClient,
    createTokenStore: createTokenStoreImpl = createTokenStore,
    getAuthTokens: getAuthTokensImpl = getAuthTokens,
    whoami: whoamiImpl = whoami,
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
        outputImpl.data({ authenticated: false });
      } else {
        outputImpl.header('whoami');
        outputImpl.print('  Not logged in');
        outputImpl.blank();
        outputImpl.hint('Run "vizzly login" to authenticate');
      }
      outputImpl.cleanup();
      return;
    }

    // Get current user info
    outputImpl.startSpinner('Fetching user information...');

    let client = createAuthClientImpl({
      baseUrl: apiUrl,
    });
    let tokenStore = createTokenStoreImpl(apiUrl);

    let response = await whoamiImpl(client, tokenStore);

    outputImpl.stopSpinner();

    // Output in JSON mode
    if (globalOptions.json) {
      outputImpl.data({
        authenticated: true,
        user: response.user,
        organizations: response.organizations || [],
        tokenExpiresAt: auth.expiresAt,
      });
      outputImpl.cleanup();
      return;
    }

    // Human-readable output
    outputImpl.header('whoami');

    // Show user info using keyValue
    if (response.user) {
      let userInfo = {
        User: response.user.name || response.user.username,
        Email: response.user.email,
      };

      if (response.user.username) {
        userInfo.Username = response.user.username;
      }

      if (globalOptions.verbose && response.user.id) {
        userInfo['User ID'] = response.user.id;
      }

      outputImpl.keyValue(userInfo);
    }

    // Show organizations as a list
    if (response.organizations && response.organizations.length > 0) {
      outputImpl.blank();
      outputImpl.labelValue('Organizations', '');
      let orgItems = response.organizations.map(org => {
        let parts = [org.name];
        if (org.slug) parts.push(`@${org.slug}`);
        if (org.role) parts.push(`[${org.role}]`);
        return parts.join(' ');
      });
      outputImpl.list(orgItems);

      if (globalOptions.verbose) {
        for (let org of response.organizations) {
          if (org.id) {
            outputImpl.hint(`  ${org.name} ID: ${org.id}`);
          }
        }
      }
    }

    // Show token expiry info
    if (auth.expiresAt) {
      outputImpl.blank();
      let expiresAt = new Date(auth.expiresAt);
      let now = new Date();
      let msUntilExpiry = expiresAt.getTime() - now.getTime();
      let daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));
      let hoursUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60));
      let minutesUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60));

      if (msUntilExpiry <= 0) {
        outputImpl.warn('Token has expired');
        outputImpl.hint('Run "vizzly login" to refresh your authentication');
      } else if (daysUntilExpiry > 0) {
        outputImpl.hint(
          `Token expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''} (${expiresAt.toLocaleDateString()})`
        );
      } else if (hoursUntilExpiry > 0) {
        outputImpl.hint(
          `Token expires in ${hoursUntilExpiry} hour${hoursUntilExpiry !== 1 ? 's' : ''}`
        );
      } else if (minutesUntilExpiry > 0) {
        outputImpl.hint(
          `Token expires in ${minutesUntilExpiry} minute${minutesUntilExpiry !== 1 ? 's' : ''}`
        );
      } else {
        outputImpl.warn('Token expires in less than a minute');
        outputImpl.hint('Run "vizzly login" to refresh your authentication');
      }

      if (globalOptions.verbose) {
        outputImpl.hint(`Token expires at: ${expiresAt.toISOString()}`);
      }
    }

    outputImpl.cleanup();
  } catch (error) {
    outputImpl.stopSpinner();

    // Handle authentication errors with helpful messages
    if (error.name === 'AuthError') {
      if (globalOptions.json) {
        outputImpl.data({
          authenticated: false,
          error: error.message,
        });
      } else {
        outputImpl.error('Authentication token is invalid or expired', error);
        outputImpl.blank();
        outputImpl.hint('Run "vizzly login" to authenticate again');
      }
      outputImpl.cleanup();
      exit(1);
    } else {
      outputImpl.error('Failed to get user information', error);
      exit(1);
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
