/**
 * Build token data for storage from API response
 * @param {Object} response - API response with tokens
 * @param {Object|null} existingUser - Existing user data to preserve
 * @returns {Object} Token data for storage
 */
export function buildTokenData(response, existingUser = null) {
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: response.expiresAt,
    user: response.user || existingUser,
  };
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
    urlWithCode:
      deviceFlow.verification_uri_complete ||
      deviceFlow.verificationUriComplete ||
      `${verificationUri}?code=${encodeURIComponent(userCode)}`,
  };
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

/** Map protocol codes without depending on the server's human-readable text. */
export function deviceAuthorizationStatus(error) {
  return {
    AUTHORIZATION_PENDING: 'pending',
    ACCESS_DENIED: 'denied',
    EXPIRED_TOKEN: 'expired',
    INVALID_DEVICE_CODE: 'invalid',
  }[error.context?.serverCode];
}
