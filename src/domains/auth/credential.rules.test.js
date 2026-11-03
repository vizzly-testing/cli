import assert from 'node:assert/strict';
import { test } from 'node:test';
import { credentialInfo, selectCredential } from './credential.rules.js';

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
