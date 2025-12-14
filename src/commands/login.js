/**
 * Login command implementation
 * Authenticates user via OAuth device flow
 */

import {
  completeDeviceFlow,
  createAuthClient,
  createTokenStore,
  initiateDeviceFlow,
  pollDeviceAuthorization,
} from '../auth/index.js';
import { openBrowser } from '../utils/browser.js';
import { getApiUrl } from '../utils/environment-config.js';
import * as output from '../utils/output.js';

/**
 * Login command implementation using OAuth device flow
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function loginCommand(options = {}, globalOptions = {}) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  const colors = output.getColors();

  try {
    output.info('Starting Vizzly authentication...');
    output.blank();

    // Create auth client and token store
    let client = createAuthClient({
      baseUrl: options.apiUrl || getApiUrl(),
    });
    let tokenStore = createTokenStore();

    // Initiate device flow
    output.startSpinner('Connecting to Vizzly...');
    let deviceFlow = await initiateDeviceFlow(client);
    output.stopSpinner();

    // Handle both snake_case and camelCase field names
    const verificationUri =
      deviceFlow.verification_uri || deviceFlow.verificationUri;
    const userCode = deviceFlow.user_code || deviceFlow.userCode;
    const deviceCode = deviceFlow.device_code || deviceFlow.deviceCode;

    if (!verificationUri || !userCode || !deviceCode) {
      throw new Error('Invalid device flow response from server');
    }

    // Build URL with pre-filled code
    const urlWithCode = `${verificationUri}?code=${userCode}`;

    // Display user code prominently
    output.blank();
    output.print('='.repeat(50));
    output.blank();
    output.print('  Please visit the following URL to authorize this device:');
    output.blank();
    output.print(`  ${urlWithCode}`);
    output.blank();
    output.print('  Your code (pre-filled):');
    output.blank();
    output.print(`  ${colors.bold(colors.cyan(userCode))}`);
    output.blank();
    output.print('='.repeat(50));
    output.blank();

    // Try to open browser with pre-filled code
    const browserOpened = await openBrowser(urlWithCode);
    if (browserOpened) {
      output.info('Opening browser...');
    } else {
      output.warn(
        'Could not open browser automatically. Please open the URL manually.'
      );
    }

    output.blank();
    output.info(
      'After authorizing in your browser, press Enter to continue...'
    );

    // Wait for user to press Enter
    await new Promise(resolve => {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve();
      });
    });

    // Check authorization status
    output.startSpinner('Checking authorization status...');

    let pollResponse = await pollDeviceAuthorization(client, deviceCode);

    output.stopSpinner();

    let tokenData = null;

    // Check if authorization was successful by looking for tokens
    if (pollResponse.tokens?.accessToken) {
      // Success! We got tokens
      tokenData = pollResponse;
    } else if (pollResponse.status === 'pending') {
      throw new Error(
        'Authorization not complete yet. Please complete the authorization in your browser and try running "vizzly login" again.'
      );
    } else if (pollResponse.status === 'expired') {
      throw new Error('Device code expired. Please try logging in again.');
    } else if (pollResponse.status === 'denied') {
      throw new Error('Authorization denied. Please try logging in again.');
    } else {
      throw new Error(
        'Unexpected response from authorization server. Please try logging in again.'
      );
    }

    // Complete device flow and save tokens
    // Handle both snake_case and camelCase for token data, and nested tokens object
    const tokensData = tokenData.tokens || tokenData;
    const tokenExpiresIn = tokensData.expiresIn || tokensData.expires_in;
    const tokenExpiresAt = tokenExpiresIn
      ? new Date(Date.now() + tokenExpiresIn * 1000).toISOString()
      : tokenData.expires_at || tokenData.expiresAt;

    const tokens = {
      accessToken: tokensData.accessToken || tokensData.access_token,
      refreshToken: tokensData.refreshToken || tokensData.refresh_token,
      expiresAt: tokenExpiresAt,
      user: tokenData.user,
      organizations: tokenData.organizations,
    };
    await completeDeviceFlow(tokenStore, tokens);

    // Display success message
    output.success('Successfully authenticated!');
    output.blank();

    // Show user info
    if (tokens.user) {
      output.info(`User: ${tokens.user.name || tokens.user.username}`);
      output.info(`Email: ${tokens.user.email}`);
    }

    // Show organization info
    if (tokens.organizations && tokens.organizations.length > 0) {
      output.blank();
      output.info('Organizations:');
      for (const org of tokens.organizations) {
        output.print(`  - ${org.name}${org.slug ? ` (@${org.slug})` : ''}`);
      }
    }

    // Show token expiry info
    if (tokens.expiresAt) {
      output.blank();
      const expiresAt = new Date(tokens.expiresAt);
      const msUntilExpiry = expiresAt.getTime() - Date.now();
      const daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));
      const hoursUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60));
      const minutesUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60));

      if (daysUntilExpiry > 0) {
        output.info(
          `Token expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''} (${expiresAt.toLocaleDateString()})`
        );
      } else if (hoursUntilExpiry > 0) {
        output.info(
          `Token expires in ${hoursUntilExpiry} hour${hoursUntilExpiry !== 1 ? 's' : ''}`
        );
      } else if (minutesUntilExpiry > 0) {
        output.info(
          `Token expires in ${minutesUntilExpiry} minute${minutesUntilExpiry !== 1 ? 's' : ''}`
        );
      }
    }

    output.blank();
    output.info(
      'You can now use Vizzly CLI commands without setting VIZZLY_TOKEN'
    );

    output.cleanup();
  } catch (error) {
    output.stopSpinner();

    // Handle authentication errors with helpful messages
    if (error.name === 'AuthError') {
      output.error('Authentication failed', error);
      output.blank();
      output.print('Please try logging in again.');
      output.print(
        "If you don't have an account, sign up at https://vizzly.dev"
      );
      process.exit(1);
    } else if (error.code === 'RATE_LIMIT_ERROR') {
      output.error('Too many login attempts', error);
      output.blank();
      output.print('Please wait a few minutes before trying again.');
      process.exit(1);
    } else {
      output.error('Login failed', error);
      process.exit(1);
    }
  }
}

/**
 * Validate login options
 * @param {Object} options - Command options
 */
export function validateLoginOptions() {
  const errors = [];

  // No specific validation needed for login command
  // OAuth device flow handles everything via browser

  return errors;
}
