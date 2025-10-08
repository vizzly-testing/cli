/**
 * Tests for pattern matching utilities
 */

import { describe, it, expect } from 'vitest';
import {
  matchPattern,
  filterByPattern,
  findMatchingHook,
} from '../../src/utils/patterns.js';

describe('matchPattern', () => {
  it('should match exact strings', () => {
    expect(matchPattern('button--primary', 'button--primary')).toBe(true);
    expect(matchPattern('button--primary', 'button--secondary')).toBe(false);
  });

  it('should match with single wildcard', () => {
    expect(matchPattern('button--primary', 'button*')).toBe(true);
    expect(matchPattern('button--primary', '*primary')).toBe(true);
    expect(matchPattern('button--primary', 'button*primary')).toBe(true);
  });

  it('should not match across path segments with single wildcard', () => {
    expect(matchPattern('components/button', 'components*button')).toBe(false);
  });

  it('should match across path segments with double wildcard', () => {
    expect(matchPattern('components/atoms/button', 'components/**')).toBe(true);
    expect(matchPattern('components/atoms/button', '**/button')).toBe(true);
  });

  it('should return true for null/undefined pattern', () => {
    expect(matchPattern('anything', null)).toBe(true);
    expect(matchPattern('anything', undefined)).toBe(true);
  });

  it('should return false for null/undefined string', () => {
    expect(matchPattern(null, 'pattern')).toBe(false);
    expect(matchPattern(undefined, 'pattern')).toBe(false);
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

    expect(filtered).toHaveLength(2);
    expect(filtered.every(s => s.id.startsWith('button'))).toBe(true);
  });

  it('should filter by exclude pattern', () => {
    let filtered = filterByPattern(stories, null, 'button*');

    expect(filtered).toHaveLength(2);
    expect(filtered.find(s => s.id.startsWith('button'))).toBeUndefined();
  });

  it('should apply both include and exclude', () => {
    let allButtons = [
      { id: 'button--primary' },
      { id: 'button--secondary' },
      { id: 'button--disabled' },
    ];

    let filtered = filterByPattern(allButtons, 'button*', 'button--disabled');

    expect(filtered).toHaveLength(2);
    expect(filtered.find(s => s.id === 'button--disabled')).toBeUndefined();
  });

  it('should return all stories with no patterns', () => {
    let filtered = filterByPattern(stories, null, null);

    expect(filtered).toHaveLength(4);
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

    expect(hook).toBeDefined();
    expect(hook()).toBe('button-hook');
  });

  it('should return first matching pattern', () => {
    let hook = findMatchingHook({ id: 'card--default' }, interactions);

    expect(hook()).toBe('card-hook');
  });

  it('should return null if no match', () => {
    let hook = findMatchingHook({ id: 'modal--open' }, interactions);

    expect(hook).toBeNull();
  });

  it('should return null for empty interactions', () => {
    let hook = findMatchingHook({ id: 'button--primary' }, {});

    expect(hook).toBeNull();
  });

  it('should use title if id not available', () => {
    let hook = findMatchingHook({ title: 'button--primary' }, interactions);

    expect(hook).toBeDefined();
  });
});
