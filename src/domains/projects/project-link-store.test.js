import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { loadGlobalConfig } from '../../services/global-config.js';
import {
  buildProjectLinkAccount,
  clearActiveProjectLink,
  getProjectLink,
  saveProjectLink,
} from './project-link-store.js';

let directory;
let originalHome;
let originalKeychain;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'vizzly-linked-project-'));
  originalHome = process.env.VIZZLY_HOME;
  originalKeychain = process.env.VIZZLY_DISABLE_KEYCHAIN;
  process.env.VIZZLY_HOME = directory;
  process.env.VIZZLY_DISABLE_KEYCHAIN = 'true';
});

afterEach(async () => {
  for (let [key, value] of [
    ['VIZZLY_HOME', originalHome],
    ['VIZZLY_DISABLE_KEYCHAIN', originalKeychain],
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(directory, { recursive: true, force: true });
});

function link(projectSlug, overrides = {}) {
  return {
    apiUrl: 'https://app.vizzly.dev',
    organizationSlug: 'team',
    projectSlug,
    token: `vzt_fixture_${projectSlug}`,
    tokenPrefix: 'vzt_fix',
    ...overrides,
  };
}

describe('repository project credentials', () => {
  it('uses the exact project account after another project is linked', async () => {
    await saveProjectLink(link('a'));
    await saveProjectLink(link('b'));
    assert.equal(
      buildProjectLinkAccount(link('a')),
      'https://app.vizzly.dev|team/a'
    );
    let credential = await getProjectLink(link('a'));
    assert.equal(credential.projectSlug, 'a');
    assert.equal(credential.token, 'vzt_fixture_a');
    assert.equal(
      await getProjectLink({ apiUrl: 'https://app.vizzly.dev' }),
      null
    );
    assert.equal(await getProjectLink(link('missing')), null);
    assert.equal(
      await getProjectLink(link('a', { apiUrl: 'https://other.test' })),
      null
    );
  });

  it('rejects expired and malformed expiration credentials', async () => {
    for (let expiresAt of ['2000-01-01T00:00:00.000Z', 'invalid']) {
      await saveProjectLink(link('expired', { expiresAt }));
      assert.equal(await getProjectLink(link('expired')), null);
    }
    await saveProjectLink(
      link('valid', { expiresAt: '2999-01-01T00:00:00.000Z' })
    );
    let credential = await getProjectLink(link('valid'));
    assert.equal(credential.expiresAt, '2999-01-01T00:00:00.000Z');
  });

  it('persists fallback credentials in user storage and clears the selected saved link', async () => {
    let saved = await saveProjectLink(link('a'));
    assert.equal(saved.storage, 'file');
    let stored = await loadGlobalConfig();
    assert.equal(
      stored.projectLink.links[saved.account].token,
      'vzt_fixture_a'
    );
    let cleared = await clearActiveProjectLink();
    assert.equal(cleared.account, saved.account);
    assert.equal(await getProjectLink(link('a')), null);
  });
});
