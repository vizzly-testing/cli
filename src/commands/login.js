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

function createLoginDeps(deps = {}) {
  return {
    completeDeviceFlow: deps.completeDeviceFlow || completeDeviceFlow,
    createAuthClient: deps.createAuthClient || createAuthClient,
    createTokenStore: deps.createTokenStore || createTokenStore,
    getApiUrl: deps.getApiUrl || getApiUrl,
    initiateDeviceFlow: deps.initiateDeviceFlow || initiateDeviceFlow,
    now: deps.now || (() => Date.now()),
    openBrowser: deps.openBrowser || openBrowser,
    output: deps.output || output,
    pollDeviceAuthorization:
      deps.pollDeviceAuthorization || pollDeviceAuthorization,
    waitForEnter: deps.waitForEnter || waitForEnter,
    exit: deps.exit || (code => process.exit(code)),
  };
}

function configureOutput(output, globalOptions) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });
}

export function normalizeDeviceFlowResponse(deviceFlow) {
  let verificationUri =
    deviceFlow.verification_uri || deviceFlow.verificationUri;
  let userCode = deviceFlow.user_code || deviceFlow.userCode;
  let deviceCode = deviceFlow.device_code || deviceFlow.deviceCode;

  if (!verificationUri || !userCode || !deviceCode) {
    throw new Error('Invalid device flow response from server');
  }

  return {
    verificationUri,
    userCode,
    deviceCode,
    urlWithCode: `${verificationUri}?code=${encodeURIComponent(userCode)}`,
  };
}

export function resolveAuthorizedTokenData(pollResponse) {
  let accessToken =
    pollResponse.tokens?.accessToken || pollResponse.tokens?.access_token;

  if (accessToken) {
    return pollResponse;
  }

  if (pollResponse.status === 'pending') {
    throw new Error(
      'Authorization not complete yet. Please complete the authorization in your browser and try running "vizzly login" again.'
    );
  }
  if (pollResponse.status === 'expired') {
    throw new Error('Device code expired. Please try logging in again.');
  }
  if (pollResponse.status === 'denied') {
    throw new Error('Authorization denied. Please try logging in again.');
  }

  throw new Error(
    'Unexpected response from authorization server. Please try logging in again.'
  );
}

export function buildTokens(tokenData, now = Date.now()) {
  let tokensData = tokenData.tokens || tokenData;
  let tokenExpiresIn = tokensData.expiresIn || tokensData.expires_in;
  let tokenExpiresAt = tokenExpiresIn
    ? new Date(now + tokenExpiresIn * 1000).toISOString()
    : tokenData.expires_at || tokenData.expiresAt;

  return {
    accessToken: tokensData.accessToken || tokensData.access_token,
    refreshToken: tokensData.refreshToken || tokensData.refresh_token,
    expiresAt: tokenExpiresAt,
    user: tokenData.user,
    organizations: tokenData.organizations,
  };
}

export function getTokenExpiryHint(expiresAt, now = Date.now()) {
  if (!expiresAt) {
    return null;
  }

  let expiry = new Date(expiresAt);
  let msUntilExpiry = expiry.getTime() - now;
  let daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));
  let hoursUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60));
  let minutesUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60));

  if (daysUntilExpiry > 0) {
    return `Token expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`;
  }
  if (hoursUntilExpiry > 0) {
    return `Token expires in ${hoursUntilExpiry} hour${hoursUntilExpiry !== 1 ? 's' : ''}`;
  }
  if (minutesUntilExpiry > 0) {
    return `Token expires in ${minutesUntilExpiry} minute${minutesUntilExpiry !== 1 ? 's' : ''}`;
  }

  return null;
}

export async function waitForEnter(stdin = process.stdin) {
  await new Promise(resolve => {
    let canSetRawMode = typeof stdin.setRawMode === 'function';
    if (canSetRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.once('data', () => {
      if (canSetRawMode) {
        stdin.setRawMode(false);
      }
      stdin.pause();
      resolve();
    });
  });
}

/**
 * Login command implementation using OAuth device flow
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function loginCommand(
  options = {},
  globalOptions = {},
  deps = {}
) {
  let {
    completeDeviceFlow,
    createAuthClient,
    createTokenStore,
    getApiUrl,
    initiateDeviceFlow,
    now,
    openBrowser,
    output,
    pollDeviceAuthorization,
    waitForEnter,
    exit,
  } = createLoginDeps(deps);

  configureOutput(output, globalOptions);

  let colors = output.getColors();

  try {
    output.header('login');

    // Create auth client and token store
    let apiUrl = options.apiUrl || getApiUrl();
    let client = createAuthClient({
      baseUrl: apiUrl,
    });
    let tokenStore = createTokenStore();

    // Initiate device flow
    output.startSpinner('Connecting to Vizzly...');
    let deviceFlow = await initiateDeviceFlow(client);
    output.stopSpinner();

    // Handle both snake_case and camelCase field names
    let { deviceCode, urlWithCode, userCode } =
      normalizeDeviceFlowResponse(deviceFlow);

    // Display user code prominently in a box
    output.printBox(
      [
        'Visit this URL to authorize:',
        '',
        colors.brand.info(urlWithCode),
        '',
        'Your code:',
        '',
        colors.bold(colors.brand.amber(userCode)),
      ],
      { title: 'Authorization', style: 'branded' }
    );
    output.blank();

    // Try to open browser with pre-filled code
    let browserOpened = await openBrowser(urlWithCode);
    if (browserOpened) {
      output.complete('Browser opened');
    } else {
      output.warn('Could not open browser automatically');
      output.hint('Please open the URL manually');
    }

    output.blank();
    output.hint('After authorizing, press Enter to continue...');

    // Wait for user to press Enter
    await waitForEnter();

    // Check authorization status
    output.startSpinner('Checking authorization...');

    let pollResponse = await pollDeviceAuthorization(client, deviceCode);

    output.stopSpinner();

    let tokenData = resolveAuthorizedTokenData(pollResponse);

    // Complete device flow and save tokens
    // Handle both snake_case and camelCase for token data, and nested tokens object
    let tokens = {
      ...buildTokens(tokenData, now()),
      apiUrl,
    };
    await completeDeviceFlow(tokenStore, tokens);

    // Display success
    output.complete('Authenticated');
    output.blank();

    // Show user info
    if (tokens.user) {
      output.keyValue({
        User: tokens.user.name || tokens.user.username,
        Email: tokens.user.email,
      });
    }

    // Show organization info
    if (tokens.organizations && tokens.organizations.length > 0) {
      output.blank();
      output.labelValue('Organizations', '');
      let orgItems = tokens.organizations.map(
        org => `${org.name}${org.slug ? ` (@${org.slug})` : ''}`
      );
      output.list(orgItems);
    }

    // Show token expiry info
    if (tokens.expiresAt) {
      output.blank();
      let expiryHint = getTokenExpiryHint(tokens.expiresAt, now());
      if (expiryHint) {
        output.hint(expiryHint);
      }
    }

    output.blank();
    output.hint(
      'Run "vizzly project link <org>/<project>" to enable cloud uploads'
    );

    output.cleanup();
  } catch (error) {
    output.stopSpinner();

    // Handle authentication errors with helpful messages
    if (error.name === 'AuthError') {
      output.error('Authentication failed', error);
      output.blank();
      output.hint('Please try logging in again');
      output.hint(
        "If you don't have an account, sign up at https://vizzly.dev"
      );
      output.cleanup();
      exit(1);
    } else if (error.code === 'RATE_LIMIT_ERROR') {
      output.error('Too many login attempts', error);
      output.blank();
      output.hint('Please wait a few minutes before trying again');
      output.cleanup();
      exit(1);
    } else {
      output.error('Login failed', error);
      output.cleanup();
      exit(1);
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
