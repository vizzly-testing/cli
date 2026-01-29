/**
 * Tests for pattern matching utilities
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterByPattern,
  findMatchingHook,
  matchPattern,
} from '../src/utils/patterns.js';

describe('matchPattern', () => {
  it('should match exact string', () => {
    assert.ok(matchPattern('button--primary', 'button--primary'));
  });

  it('should match with wildcard', () => {
    assert.ok(matchPattern('button--primary', 'button*'));
    assert.ok(matchPattern('button--secondary', 'button*'));
  });

  it('should match with double wildcard', () => {
    assert.ok(matchPattern('components/atoms/button', 'components/**'));
    assert.ok(matchPattern('components/atoms/button/primary', 'components/**'));
  });

  it('should not match different strings', () => {
    assert.ok(!matchPattern('card--default', 'button*'));
  });

  it('should return true for empty pattern', () => {
    assert.ok(matchPattern('anything', ''));
    assert.ok(matchPattern('anything', null));
  });

  it('should return false for empty string', () => {
    assert.ok(!matchPattern('', 'pattern'));
    assert.ok(!matchPattern(null, 'pattern'));
  });
});

describe('filterByPattern', () => {
  let stories = [
    { id: 'button--primary', title: 'Button' },
    { id: 'button--secondary', title: 'Button' },
    { id: 'card--default', title: 'Card' },
  ];

  it('should filter by include pattern', () => {
    let filtered = filterByPattern(stories, 'button*', null);

    assert.equal(filtered.length, 2);
    assert.ok(filtered.every(s => s.id.startsWith('button')));
  });

  it('should filter by exclude pattern', () => {
    let filtered = filterByPattern(stories, null, 'button*');

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'card--default');
  });

  it('should apply both include and exclude', () => {
    let filtered = filterByPattern(stories, 'button*', 'button--secondary');

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'button--primary');
  });

  it('should return all stories when no patterns', () => {
    let filtered = filterByPattern(stories, null, null);

    assert.equal(filtered.length, 3);
  });

  it('should use title as fallback when no id', () => {
    let storiesWithoutId = [{ title: 'Button' }, { title: 'Card' }];

    let filtered = filterByPattern(storiesWithoutId, 'Button', null);

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].title, 'Button');
  });
});

describe('findMatchingHook', () => {
  it('should find matching hook from simple object format', () => {
    let hook = () => {};
    let interactions = {
      'button*': hook,
    };
    let story = { id: 'button--primary' };

    let result = findMatchingHook(story, interactions);

    assert.equal(result, hook);
  });

  it('should return null when no match in simple format', () => {
    let interactions = {
      'card*': () => {},
    };
    let story = { id: 'button--primary' };

    let result = findMatchingHook(story, interactions);

    assert.equal(result, null);
  });

  it('should find matching hook from patterns array format', () => {
    let hook = () => {};
    let interactions = {
      patterns: [
        { match: 'card*', beforeScreenshot: () => {} },
        { match: 'button*', beforeScreenshot: hook },
      ],
    };
    let story = { id: 'button--primary' };

    let result = findMatchingHook(story, interactions);

    assert.equal(result, hook);
  });

  it('should return null when no match in patterns array format', () => {
    let interactions = {
      patterns: [{ match: 'card*', beforeScreenshot: () => {} }],
    };
    let story = { id: 'button--primary' };

    let result = findMatchingHook(story, interactions);

    assert.equal(result, null);
  });

  it('should return null for null interactions', () => {
    let story = { id: 'button--primary' };

    let result = findMatchingHook(story, null);

    assert.equal(result, null);
  });

  it('should return null for undefined interactions', () => {
    let story = { id: 'button--primary' };

    let result = findMatchingHook(story, undefined);

    assert.equal(result, null);
  });

  it('should return null for empty interactions object', () => {
    let story = { id: 'button--primary' };

    let result = findMatchingHook(story, {});

    assert.equal(result, null);
  });

  it('should use title as fallback when no id', () => {
    let hook = () => {};
    let interactions = {
      'Button*': hook,
    };
    let story = { title: 'Button' };

    let result = findMatchingHook(story, interactions);

    assert.equal(result, hook);
  });

  it('should return first matching hook in patterns array', () => {
    let firstHook = () => 'first';
    let secondHook = () => 'second';
    let interactions = {
      patterns: [
        { match: 'button*', beforeScreenshot: firstHook },
        { match: 'button--primary', beforeScreenshot: secondHook },
      ],
    };
    let story = { id: 'button--primary' };

    let result = findMatchingHook(story, interactions);

    assert.equal(result, firstHook);
  });
});
