/**
 * Login command implementation
 * Authenticates user via OAuth device flow
 */

import { setTimeout as delay } from 'node:timers/promises';

import {
  buildTokens,
  normalizeDeviceFlowResponse,
  resolveAuthorizedTokenData,
} from '../auth/core.js';
import {
  completeDeviceFlow,
  createAuthClient,
  createTokenStore,
  initiateDeviceFlow,
  pollDeviceAuthorization,
} from '../auth/index.js';

import { openBrowser } from '../utils/browser.js';
import { getApiUrl } from '../utils/environment-config.js';
import { waitForLoginPoll } from '../utils/login-poll-wait.js';
import * as output from '../utils/output.js';

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
  let { now = Date.now, delay: sleep = delay } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  let colors = output.getColors();

  try {
    output.header('login');

    // Create auth client and token store
    let client = createAuthClient({
      baseUrl: options.apiUrl || getApiUrl(),
    });
    let tokenStore = createTokenStore();

    // Initiate device flow
    output.startSpinner('Connecting to Vizzly...');
    let deviceFlow = await initiateDeviceFlow(client);
    output.stopSpinner();
    let expiresIn = Number(deviceFlow.expires_in ?? deviceFlow.expiresIn);
    let lifetime =
      Number.isFinite(expiresIn) && expiresIn > 0
        ? Math.min(expiresIn, 120)
        : 120;
    let deadline = now() + lifetime * 1000;
    let timeoutMessage =
      expiresIn > 0 && expiresIn <= 120
        ? 'Device code expired. Please try logging in again.'
        : 'Login timed out after 2 minutes. Please try logging in again.';
    let interval = Number(deviceFlow.interval);
    let pollDelay =
      Number.isFinite(interval) && interval > 0 ? interval * 1000 : 5000;

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
    output.hint(
      'Waiting for authorization in your browser (up to 2 minutes)...'
    );
    let interactive = process.stdin.isTTY && !globalOptions.json;
    let backoff = false;
    let lastCheckAt = 0;

    let pollResponse;
    while (true) {
      let remaining = deadline - now();
      if (remaining <= 0) {
        throw new Error(timeoutMessage);
      }
      await waitForLoginPoll({
        milliseconds: Math.min(pollDelay, remaining),
        manualAllowed: !backoff,
        earliestCheckAt: lastCheckAt + 1000,
        stdin: interactive ? process.stdin : { isTTY: false },
        now,
        sleep,
        onTick: (milliseconds, canCheck) => {
          let seconds = Math.ceil(milliseconds / 1000);
          let message = backoff
            ? `Rate limited. Next check in ${seconds}s`
            : `Next check in ${seconds}s`;
          if (canCheck) message += ' — press Enter to check now';
          if (interactive) output.updateSpinner(message);
          else output.hint(message);
        },
      });
      remaining = deadline - now();
      if (remaining <= 0) {
        throw new Error(timeoutMessage);
      }
      lastCheckAt = now();
      output.updateSpinner('Checking authorization...');
      try {
        pollResponse = await pollDeviceAuthorization(client, deviceCode, {
          signal: AbortSignal.timeout(Math.ceil(Math.min(remaining, 30000))),
        });
      } catch (error) {
        if (now() >= deadline) {
          throw new Error(timeoutMessage);
        }
        if (error.code !== 'RATE_LIMIT_ERROR') throw error;
        backoff = true;
        let retryAfter = Number(error.context?.retryAfter);
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          pollDelay = Math.max(pollDelay, retryAfter * 1000);
        }
        continue;
      }
      backoff = false;
      if (pollResponse.status !== 'pending') break;
    }
    output.stopSpinner();

    let tokenData = resolveAuthorizedTokenData(pollResponse);

    // Complete device flow and save tokens
    // Handle both snake_case and camelCase for token data, and nested tokens object
    let tokens = buildTokens(tokenData, now());
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

    output.blank();
    output.hint('You can now browse cloud builds and download baselines');

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
    } else if (error.code === 'RATE_LIMIT_ERROR') {
      output.error('Too many login attempts', error);
      output.blank();
      output.hint('Please wait a few minutes before trying again');
    } else {
      output.error('Login failed', error);
    }
    output.cleanup();
    process.exit(1);
  }
}
