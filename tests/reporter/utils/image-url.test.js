import assert from 'node:assert';
import { describe, it } from 'node:test';
import { withImageVersion } from '../../../src/reporter/src/utils/image-url.js';

describe('reporter/utils/image-url', () => {
  it('returns original value for non-string urls', () => {
    assert.strictEqual(withImageVersion(null, 1), null);
    assert.strictEqual(withImageVersion(undefined, 1), undefined);
    assert.strictEqual(withImageVersion(42, 1), 42);
  });

  it('returns original url for non-local images', () => {
    let url = 'https://cdn.example.com/image.png';
    assert.strictEqual(withImageVersion(url, 123), url);
  });

  it('returns original url when version is missing', () => {
    let url = '/images/current/homepage.png';
    assert.strictEqual(withImageVersion(url, null), url);
    assert.strictEqual(withImageVersion(url, undefined), url);
  });

  it('appends v query param for local image urls', () => {
    assert.strictEqual(
      withImageVersion('/images/current/homepage.png', 123),
      '/images/current/homepage.png?v=123'
    );
  });

  it('appends v query param using ampersand when query already exists', () => {
    assert.strictEqual(
      withImageVersion('/images/current/homepage.png?mode=thumb', 456),
      '/images/current/homepage.png?mode=thumb&v=456'
    );
  });

  it('encodes non-numeric version values', () => {
    assert.strictEqual(
      withImageVersion('/images/current/homepage.png', 'run 1'),
      '/images/current/homepage.png?v=run%201'
    );
  });
});
