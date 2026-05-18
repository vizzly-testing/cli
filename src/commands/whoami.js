/**
 * Whoami command implementation
 * Shows current user and authentication status
 */

import {
  createAuthClient as defaultCreateAuthClient,
  createTokenStore as defaultCreateTokenStore,
  getAuthTokens as defaultGetAuthTokens,
  whoami as defaultWhoami,
} from '../auth/index.js';
import { getApiUrl as defaultGetApiUrl } from '../utils/environment-config.js';
import * as defaultOutput from '../utils/output.js';

export function getTokenExpiryStatus(expiresAt, now = new Date()) {
  let expiresDate = new Date(expiresAt);
  let msUntilExpiry = expiresDate.getTime() - now.getTime();
  let daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));
  let hoursUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60));
  let minutesUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60));

  if (msUntilExpiry <= 0) {
    return {
      level: 'warn',
      message: 'Token has expired',
      refreshHint: 'Run "vizzly login" to refresh your authentication',
    };
  }

  if (daysUntilExpiry > 0) {
    return {
      level: 'hint',
      message: `Token expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''} (${expiresDate.toLocaleDateString()})`,
    };
  }

  if (hoursUntilExpiry > 0) {
    return {
      level: 'hint',
      message: `Token expires in ${hoursUntilExpiry} hour${hoursUntilExpiry !== 1 ? 's' : ''}`,
    };
  }

  if (minutesUntilExpiry > 0) {
    return {
      level: 'hint',
      message: `Token expires in ${minutesUntilExpiry} minute${minutesUntilExpiry !== 1 ? 's' : ''}`,
    };
  }

  return {
    level: 'warn',
    message: 'Token expires in less than a minute',
    refreshHint: 'Run "vizzly login" to refresh your authentication',
  };
}

/**
 * Whoami command implementation
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function whoamiCommand(
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    createAuthClient = defaultCreateAuthClient,
    createTokenStore = defaultCreateTokenStore,
    getApiUrl = defaultGetApiUrl,
    getAuthTokens = defaultGetAuthTokens,
    output = defaultOutput,
    whoami = defaultWhoami,
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
        output.data({ authenticated: false });
      } else {
        output.header('whoami');
        output.print('  Not logged in');
        output.blank();
        output.hint('Run "vizzly login" to authenticate');
      }
      output.cleanup();
      return;
    }

    // Get current user info
    output.startSpinner('Fetching user information...');

    let client = createAuthClient({
      baseUrl: options.apiUrl || getApiUrl(),
    });
    let tokenStore = createTokenStore();

    let response = await whoami(client, tokenStore);

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
    output.header('whoami');

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

      output.keyValue(userInfo);
    }

    // Show organizations as a list
    if (response.organizations && response.organizations.length > 0) {
      output.blank();
      output.labelValue('Organizations', '');
      let orgItems = response.organizations.map(org => {
        let parts = [org.name];
        if (org.slug) parts.push(`@${org.slug}`);
        if (org.role) parts.push(`[${org.role}]`);
        return parts.join(' ');
      });
      output.list(orgItems);

      if (globalOptions.verbose) {
        for (let org of response.organizations) {
          if (org.id) {
            output.hint(`  ${org.name} ID: ${org.id}`);
          }
        }
      }
    }

    // Show token expiry info
    if (auth.expiresAt) {
      output.blank();
      let expiry = getTokenExpiryStatus(auth.expiresAt);
      if (expiry.level === 'warn') {
        output.warn(expiry.message);
      } else {
        output.hint(expiry.message);
      }

      if (expiry.refreshHint) {
        output.hint(expiry.refreshHint);
      }

      if (globalOptions.verbose) {
        output.hint(
          `Token expires at: ${new Date(auth.expiresAt).toISOString()}`
        );
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
        output.hint('Run "vizzly login" to authenticate again');
      }
      output.cleanup();
      exit(1);
    } else {
      output.error('Failed to get user information', error);
      output.cleanup();
      exit(1);
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
