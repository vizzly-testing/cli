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
  if (pollResponse.status === 'invalid') {
    throw new Error(
      'Device code is invalid or expired. Please try logging in again.'
    );
  }
  if (pollResponse.status === 'denied') {
    throw new Error('Authorization denied. Please try logging in again.');
  }

  throw new Error(
    'Unexpected response from authorization server. Please try logging in again.'
  );
}
