import { createTokenStore } from '../../src/domains/auth/token-store.js';

export let fixtureAuthorization = Object.freeze({
  sessionId: '8bfb8060-ef8e-4c3e-b58b-ffb826ba899b',
  clientId: 'vizzly-cli',
  scopes: Object.freeze([
    'read',
    'builds:write',
    'reviews:write',
    'comments:write',
  ]),
});

/** Save synthetic login data through the same origin-scoped store as the CLI. */
export async function saveFixtureAuth(home, apiUrl, auth = {}) {
  await createTokenStore({ apiUrl, home }).saveTokens({
    accessToken: 'fixture-user',
    refreshToken: 'fixture-refresh',
    expiresAt: '2999-01-01T00:00:00.000Z',
    user: { username: 'fixture-user' },
    authorization: fixtureAuthorization,
    ...auth,
  });
}
