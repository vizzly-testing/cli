/**
 * Test helpers for auth module tests
 *
 * Provides in-memory implementations for testing without mocks.
 */

/**
 * Create an in-memory token store for testing
 * @param {Object} initialTokens - Initial token state
 * @returns {Object} Token store with getTokens, saveTokens, clearTokens
 */
export function createInMemoryTokenStore(initialTokens = null) {
  let tokens = initialTokens;

  return {
    async getTokens() {
      return tokens;
    },
    async saveTokens(newTokens) {
      tokens = newTokens;
    },
    async clearTokens() {
      tokens = null;
    },
    // Test helper to inspect current state
    _getState() {
      return tokens;
    },
  };
}

/**
 * Create a mock HTTP client for testing
 * @param {Object} responses - Map of endpoint patterns to responses
 * @returns {Object} HTTP client with request, authenticatedRequest
 */
export function createMockHttpClient(responses = {}) {
  let calls = [];

  function findResponse(endpoint, method = 'GET') {
    // Try exact match first
    if (responses[endpoint]) {
      return responses[endpoint];
    }

    // Try with method prefix
    let key = `${method} ${endpoint}`;
    if (responses[key]) {
      return responses[key];
    }

    // Try pattern matching
    for (let pattern of Object.keys(responses)) {
      if (endpoint.includes(pattern) || pattern.includes(endpoint)) {
        return responses[pattern];
      }
    }

    return null;
  }

  async function request(endpoint, options = {}) {
    let method = options.method || 'GET';
    calls.push({ type: 'request', endpoint, options, method });

    let response = findResponse(endpoint, method);

    if (response instanceof Error) {
      throw response;
    }

    if (response === null || response === undefined) {
      throw new Error(`No mock response for ${method} ${endpoint}`);
    }

    return response;
  }

  async function authenticatedRequest(endpoint, accessToken, options = {}) {
    let method = options.method || 'GET';
    calls.push({
      type: 'authenticatedRequest',
      endpoint,
      accessToken,
      options,
      method,
    });

    let response = findResponse(endpoint, method);

    if (response instanceof Error) {
      throw response;
    }

    if (response === null || response === undefined) {
      throw new Error(
        `No mock response for authenticated ${method} ${endpoint}`
      );
    }

    return response;
  }

  return {
    request,
    authenticatedRequest,
    getBaseUrl: () => 'https://test.vizzly.dev',
    getUserAgent: () => 'vizzly-cli/test (auth)',
    // Test helpers
    _getCalls() {
      return calls;
    },
    _getLastCall() {
      return calls[calls.length - 1];
    },
    _clearCalls() {
      calls = [];
    },
  };
}
