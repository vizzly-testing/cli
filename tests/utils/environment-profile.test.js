import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getApiOrigin,
  LOCAL_API_URL,
  normalizeApiUrl,
  PRODUCTION_API_URL,
  resolveEnvironment,
} from '../../src/utils/environment-profile.js';

describe('utils/environment-profile', () => {
  it('uses production without configuration', () => {
    assert.deepStrictEqual(resolveEnvironment({ config: {}, env: {} }), {
      name: 'production',
      apiUrl: PRODUCTION_API_URL,
      origin: PRODUCTION_API_URL,
      source: 'default',
    });
  });

  it('selects local only when explicitly requested', () => {
    assert.deepStrictEqual(
      resolveEnvironment({
        config: { environment: { active: 'local' } },
        env: {},
      }),
      {
        name: 'local',
        apiUrl: LOCAL_API_URL,
        origin: LOCAL_API_URL,
        source: 'global-config',
      }
    );
  });

  it('uses an explicit API URL as both the request base and credential origin', () => {
    let environment = resolveEnvironment({
      config: { environment: { active: 'local' } },
      env: { VIZZLY_API_URL: 'https://preview.example.test/api/' },
    });

    assert.strictEqual(environment.name, 'custom');
    assert.strictEqual(environment.apiUrl, 'https://preview.example.test/api');
    assert.strictEqual(environment.origin, 'https://preview.example.test');
  });

  it('normalizes URLs without collapsing an API base path into its origin', () => {
    assert.strictEqual(
      normalizeApiUrl('https://preview.example.test/api/?ignored=true#hash'),
      'https://preview.example.test/api'
    );
    assert.strictEqual(
      getApiOrigin('https://preview.example.test/api'),
      'https://preview.example.test'
    );
  });

  it('rejects unknown selected environments instead of falling back to production', () => {
    assert.throws(
      () =>
        resolveEnvironment({
          config: { environment: { active: 'prodution' } },
          env: {},
        }),
      /Unknown Vizzly environment "prodution"/
    );
  });

  it('rejects malformed explicit API URLs', () => {
    assert.throws(
      () =>
        resolveEnvironment({
          config: {},
          env: { VIZZLY_API_URL: 'not a URL' },
        }),
      /Invalid URL/
    );
  });
});
