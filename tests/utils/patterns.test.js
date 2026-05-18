import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createWildcardMatcher,
  escapeRegExp,
} from '../../src/utils/patterns.js';

describe('patterns', () => {
  describe('escapeRegExp', () => {
    it('escapes regular expression syntax characters', () => {
      assert.strictEqual(escapeRegExp('a+b[c].png'), 'a\\+b\\[c\\]\\.png');
    });
  });

  describe('createWildcardMatcher', () => {
    it('treats non-wildcard regex syntax as literal text', () => {
      let matches = createWildcardMatcher('card[primary].png');

      assert.strictEqual(matches('card[primary].png'), true);
      assert.strictEqual(matches('cardp.png'), false);
    });

    it('treats asterisks as wildcards', () => {
      let matches = createWildcardMatcher('button-*');

      assert.strictEqual(matches('button-primary'), true);
      assert.strictEqual(matches('button-secondary'), true);
      assert.strictEqual(matches('input-primary'), false);
    });

    it('can anchor wildcard matches to the whole value', () => {
      let matches = createWildcardMatcher('*.js', { anchored: true });

      assert.strictEqual(matches('app.js'), true);
      assert.strictEqual(matches('app.js.map'), false);
    });
  });
});
