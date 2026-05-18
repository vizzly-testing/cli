import assert from 'node:assert';
import { describe, it } from 'node:test';
import { getAppBaseUrl } from '../../src/utils/api-url.js';

describe('getAppBaseUrl', () => {
  it('removes API path segments without touching api hostnames', () => {
    assert.strictEqual(
      getAppBaseUrl('https://api.test/api/v1'),
      'https://api.test'
    );
    assert.strictEqual(
      getAppBaseUrl('https://api.vizzly.dev'),
      'https://api.vizzly.dev'
    );
  });

  it('handles API URLs with the API path at the end', () => {
    assert.strictEqual(
      getAppBaseUrl('https://host.test/api'),
      'https://host.test'
    );
  });

  it('removes search and hash fragments from app links', () => {
    assert.strictEqual(
      getAppBaseUrl('https://host.test/api/v1?token=abc#section'),
      'https://host.test'
    );
  });

  it('handles plain API strings with the legacy path fallback', () => {
    assert.strictEqual(getAppBaseUrl('host.test/api'), 'host.test');
  });
});
