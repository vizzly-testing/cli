/**
 * Login command implementation
 * Authenticates user via OAuth device flow
 */

import { ConsoleUI } from '../utils/console-ui.js';
import { AuthService } from '../services/auth-service.js';
import { getApiUrl } from '../utils/environment-config.js';
import { openBrowser } from '../utils/browser.js';

/**
 * Login command implementation using OAuth device flow
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function loginCommand(options = {}, globalOptions = {}) {
  // Create UI handler
  let ui = new ConsoleUI({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    ui.info('Starting Vizzly authentication...');
    console.log(''); // Empty line for spacing

    // Create auth service
    let authService = new AuthService({
      baseUrl: options.apiUrl || getApiUrl(),
    });

    // Initiate device flow
    ui.startSpinner('Connecting to Vizzly...');
    let deviceFlow = await authService.initiateDeviceFlow();
    ui.stopSpinner();

    // Handle both snake_case and camelCase field names
    let verificationUri =
      deviceFlow.verification_uri || deviceFlow.verificationUri;
    let userCode = deviceFlow.user_code || deviceFlow.userCode;
    let deviceCode = deviceFlow.device_code || deviceFlow.deviceCode;

    if (!verificationUri || !userCode || !deviceCode) {
      throw new Error('Invalid device flow response from server');
    }

    // Build URL with pre-filled code
    let urlWithCode = `${verificationUri}?code=${userCode}`;

    // Display user code prominently
    console.log(''); // Empty line for spacing
    console.log('='.repeat(50));
    console.log('');
    console.log('  Please visit the following URL to authorize this device:');
    console.log('');
    console.log(`  ${urlWithCode}`);
    console.log('');
    console.log('  Your code (pre-filled):');
    console.log('');
    console.log(`  ${ui.colors.bold(ui.colors.cyan(userCode))}`);
    console.log('');
    console.log('='.repeat(50));
    console.log(''); // Empty line for spacing

    // Try to open browser with pre-filled code
    let browserOpened = await openBrowser(urlWithCode);
    if (browserOpened) {
      ui.info('Opening browser...');
    } else {
      ui.warning(
        'Could not open browser automatically. Please open the URL manually.'
      );
    }

    console.log(''); // Empty line for spacing
    ui.info('After authorizing in your browser, press Enter to continue...');

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
    ui.startSpinner('Checking authorization status...');

    let pollResponse = await authService.pollDeviceAuthorization(deviceCode);

    ui.stopSpinner();

    let tokenData = null;

    // Check if authorization was successful by looking for tokens
    if (pollResponse.tokens && pollResponse.tokens.accessToken) {
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
    let tokensData = tokenData.tokens || tokenData;
    let tokenExpiresIn = tokensData.expiresIn || tokensData.expires_in;
    let tokenExpiresAt = tokenExpiresIn
      ? new Date(Date.now() + tokenExpiresIn * 1000).toISOString()
      : tokenData.expires_at || tokenData.expiresAt;

    let tokens = {
      accessToken: tokensData.accessToken || tokensData.access_token,
      refreshToken: tokensData.refreshToken || tokensData.refresh_token,
      expiresAt: tokenExpiresAt,
      user: tokenData.user,
      organizations: tokenData.organizations,
    };
    await authService.completeDeviceFlow(tokens);

    // Display success message
    ui.success('Successfully authenticated!');
    console.log(''); // Empty line for spacing

    // Show user info
    if (tokens.user) {
      ui.info(`User: ${tokens.user.name || tokens.user.username}`);
      ui.info(`Email: ${tokens.user.email}`);
    }

    // Show organization info
    if (tokens.organizations && tokens.organizations.length > 0) {
      console.log(''); // Empty line for spacing
      ui.info('Organizations:');
      for (let org of tokens.organizations) {
        console.log(`  - ${org.name}${org.slug ? ` (@${org.slug})` : ''}`);
      }
    }

    // Show token expiry info
    if (tokens.expiresAt) {
      console.log(''); // Empty line for spacing
      let expiresAt = new Date(tokens.expiresAt);
      let msUntilExpiry = expiresAt.getTime() - Date.now();
      let daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));
      let hoursUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60));
      let minutesUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60));

      if (daysUntilExpiry > 0) {
        ui.info(
          `Token expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''} (${expiresAt.toLocaleDateString()})`
        );
      } else if (hoursUntilExpiry > 0) {
        ui.info(
          `Token expires in ${hoursUntilExpiry} hour${hoursUntilExpiry !== 1 ? 's' : ''}`
        );
      } else if (minutesUntilExpiry > 0) {
        ui.info(
          `Token expires in ${minutesUntilExpiry} minute${minutesUntilExpiry !== 1 ? 's' : ''}`
        );
      }
    }

    console.log(''); // Empty line for spacing
    ui.info('You can now use Vizzly CLI commands without setting VIZZLY_TOKEN');

    ui.cleanup();
  } catch (error) {
    ui.stopSpinner();

    // Handle authentication errors with helpful messages
    if (error.name === 'AuthError') {
      ui.error('Authentication failed', error, 0);
      console.log(''); // Empty line for spacing
      console.log('Please try logging in again.');
      console.log(
        "If you don't have an account, sign up at https://vizzly.dev"
      );
      process.exit(1);
    } else if (error.code === 'RATE_LIMIT_ERROR') {
      ui.error('Too many login attempts', error, 0);
      console.log(''); // Empty line for spacing
      console.log('Please wait a few minutes before trying again.');
      process.exit(1);
    } else {
      ui.error('Login failed', error, 0);
      console.log(''); // Empty line for spacing
      console.log('Error details:', error.message);
      if (globalOptions.verbose && error.stack) {
        console.error(''); // Empty line for spacing
        console.error(error.stack);
      }
      process.exit(1);
    }
  }
}

/**
 * Validate login options
 * @param {Object} options - Command options
 */
export function validateLoginOptions() {
  let errors = [];

  // No specific validation needed for login command
  // OAuth device flow handles everything via browser

  return errors;
}
