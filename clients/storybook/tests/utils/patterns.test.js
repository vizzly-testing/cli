/**
 * Tests for pattern matching utilities
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterByPattern,
  findMatchingHook,
  matchPattern,
} from '../../src/utils/patterns.js';

describe('matchPattern', () => {
  it('should match exact strings', () => {
    assert.strictEqual(matchPattern('button--primary', 'button--primary'), true);
    assert.strictEqual(matchPattern('button--primary', 'button--secondary'), false);
  });

  it('should match with single wildcard', () => {
    assert.strictEqual(matchPattern('button--primary', 'button*'), true);
    assert.strictEqual(matchPattern('button--primary', '*primary'), true);
    assert.strictEqual(matchPattern('button--primary', 'button*primary'), true);
  });

  it('should not match across path segments with single wildcard', () => {
    assert.strictEqual(matchPattern('components/button', 'components*button'), false);
  });

  it('should match across path segments with double wildcard', () => {
    assert.strictEqual(matchPattern('components/atoms/button', 'components/**'), true);
    assert.strictEqual(matchPattern('components/atoms/button', '**/button'), true);
  });

  it('should return true for null/undefined pattern', () => {
    assert.strictEqual(matchPattern('anything', null), true);
    assert.strictEqual(matchPattern('anything', undefined), true);
  });

  it('should return false for null/undefined string', () => {
    assert.strictEqual(matchPattern(null, 'pattern'), false);
    assert.strictEqual(matchPattern(undefined, 'pattern'), false);
  });
});

describe('filterByPattern', () => {
  let stories = [
    { id: 'button--primary' },
    { id: 'button--secondary' },
    { id: 'card--default' },
    { id: 'components/atoms/button' },
  ];

  it('should filter by include pattern', () => {
    let filtered = filterByPattern(stories, 'button*', null);

    assert.strictEqual(filtered.length, 2);
    assert.ok(filtered.every(s => s.id.startsWith('button')));
  });

  it('should filter by exclude pattern', () => {
    let filtered = filterByPattern(stories, null, 'button*');

    assert.strictEqual(filtered.length, 2);
    assert.strictEqual(filtered.find(s => s.id.startsWith('button')), undefined);
  });

  it('should apply both include and exclude', () => {
    let allButtons = [
      { id: 'button--primary' },
      { id: 'button--secondary' },
      { id: 'button--disabled' },
    ];

    let filtered = filterByPattern(allButtons, 'button*', 'button--disabled');

    assert.strictEqual(filtered.length, 2);
    assert.strictEqual(filtered.find(s => s.id === 'button--disabled'), undefined);
  });

  it('should return all stories with no patterns', () => {
    let filtered = filterByPattern(stories, null, null);

    assert.strictEqual(filtered.length, 4);
  });
});

describe('findMatchingHook', () => {
  let interactions = {
    'button*': () => 'button-hook',
    'card--default': () => 'card-hook',
    '**/atoms/*': () => 'atoms-hook',
  };

  it('should find matching hook', () => {
    let hook = findMatchingHook({ id: 'button--primary' }, interactions);

    assert.ok(hook);
    assert.strictEqual(hook(), 'button-hook');
  });

  it('should return first matching pattern', () => {
    let hook = findMatchingHook({ id: 'card--default' }, interactions);

    assert.strictEqual(hook(), 'card-hook');
  });

  it('should return null if no match', () => {
    let hook = findMatchingHook({ id: 'modal--open' }, interactions);

    assert.strictEqual(hook, null);
  });

  it('should return null for empty interactions', () => {
    let hook = findMatchingHook({ id: 'button--primary' }, {});

    assert.strictEqual(hook, null);
  });

  it('should use title if id not available', () => {
    let hook = findMatchingHook({ title: 'button--primary' }, interactions);

    assert.ok(hook);
  });
});
