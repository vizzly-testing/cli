import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  credentialInfo,
  requireCredentialScope,
  selectCredential,
} from './credential.rules.js';

test('credential selection honors deliberate sources and keeps account reads separate from uploads', () => {
  let linked = {
    apiKey: 'vzt_upload',
    userToken: 'user-access',
    credentialSource: 'linked-project',
  };
  assert.deepEqual(credentialInfo(selectCredential(linked)), {
    source: 'user',
    kind: 'user',
  });
  assert.equal(selectCredential(linked, { auth: 'token' }).token, 'vzt_upload');
  for (let source of ['flag', 'environment', 'config']) {
    let config = { ...linked, credentialSource: source };
    assert.equal(selectCredential(config).token, 'vzt_upload');
    if (source !== 'flag')
      assert.equal(
        selectCredential(config, { auth: 'user' }).token,
        'user-access'
      );
  }
  assert.equal(selectCredential({ apiKey: 'vzt_ci' }).token, 'vzt_ci');
  assert.equal(selectCredential({ userToken: 'user-access' }).source, 'user');
  assert.throws(
    () => selectCredential(linked, { token: 'explicit', auth: 'user' }),
    { code: 'INVALID_AUTH' }
  );
  assert.throws(() => selectCredential({}, { auth: 'user' }), {
    code: 'LOGIN_REQUIRED',
  });
  assert.throws(() => selectCredential({}, { auth: 'token' }), {
    code: 'LOGIN_REQUIRED',
  });
  assert.equal(
    selectCredential({}, { allowNoToken: true }).source,
    'anonymous'
  );
});

test('known user grants restrict actions without inferring permissions for token overrides', () => {
  let user = selectCredential({
    userToken: 'user-access',
    userAuthorization: {
      sessionId: 'session-1',
      clientId: 'vizzly-cli',
      scopes: ['read'],
    },
  });
  assert.doesNotThrow(() => requireCredentialScope(user, 'read'));
  assert.throws(
    () => requireCredentialScope(user, 'builds:write'),
    error => {
      assert.equal(error.code, 'INSUFFICIENT_SCOPE');
      assert.deepEqual(error.context.requiredScopes, ['builds:write']);
      assert.deepEqual(error.context.grantedScopes, ['read']);
      return true;
    }
  );
  assert.deepEqual(credentialInfo(user), {
    source: 'user',
    kind: 'user',
    authorization: {
      sessionId: 'session-1',
      clientId: 'vizzly-cli',
      scopes: ['read'],
    },
  });
  assert.doesNotThrow(() =>
    requireCredentialScope(
      selectCredential({ apiKey: 'external-token' }),
      'builds:write'
    )
  );
  assert.doesNotThrow(() =>
    requireCredentialScope(
      selectCredential({ userToken: 'legacy-access' }),
      'builds:write'
    )
  );
});

test('an unavailable user store blocks only commands that select that login', () => {
  let storageError = Object.assign(new Error('Unlock the credential store.'), {
    code: 'AUTH_STORAGE_UNAVAILABLE',
  });
  for (let source of ['flag', 'environment', 'config']) {
    let config = {
      apiKey: 'vzt_explicit',
      credentialSource: source,
      userAuthError: storageError,
    };
    assert.equal(selectCredential(config).token, 'vzt_explicit');
    assert.equal(
      selectCredential(config, { auth: 'token' }).token,
      'vzt_explicit'
    );
    if (source === 'flag') {
      assert.throws(() => selectCredential(config, { auth: 'user' }), {
        code: 'INVALID_AUTH',
      });
    } else {
      assert.throws(
        () => selectCredential(config, { auth: 'user' }),
        error => error === storageError
      );
    }
  }
  let linked = {
    apiKey: 'vzt_cached',
    credentialSource: 'linked-project',
    userAuthError: storageError,
  };
  assert.throws(
    () => selectCredential(linked),
    error => error === storageError
  );
  assert.throws(
    () => selectCredential(linked, { auth: 'user' }),
    error => error === storageError
  );
  assert.equal(selectCredential(linked, { auth: 'token' }).token, 'vzt_cached');
  assert.throws(
    () =>
      selectCredential({ userAuthError: storageError }, { allowNoToken: true }),
    error => error === storageError
  );
});
