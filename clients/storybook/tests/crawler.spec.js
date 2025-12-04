/**
 * Tests for story crawler functions
 */

import { describe, expect, it } from 'vitest';
import {
  extractStoryConfig,
  filterStories,
  generateStoryUrl,
  parseStories,
} from '../src/crawler.js';

describe('parseStories', () => {
  it('should parse Storybook v7 format', () => {
    let indexData = {
      v: 7,
      entries: {
        'button--primary': {
          id: 'button--primary',
          title: 'Button',
          name: 'Primary',
          type: 'story',
        },
        'button--secondary': {
          id: 'button--secondary',
          title: 'Button',
          name: 'Secondary',
          type: 'story',
        },
      },
    };

    let stories = parseStories(indexData);

    expect(stories).toHaveLength(2);
    expect(stories[0]).toMatchObject({
      id: 'button--primary',
      title: 'Button',
      name: 'Primary',
    });
  });

  it('should parse Storybook v6 format', () => {
    let indexData = {
      stories: {
        'button--primary': {
          id: 'button--primary',
          title: 'Button',
          name: 'Primary',
        },
      },
    };

    let stories = parseStories(indexData);

    expect(stories).toHaveLength(1);
    expect(stories[0].id).toBe('button--primary');
  });

  it('should filter out non-story entries in v7', () => {
    let indexData = {
      v: 7,
      entries: {
        'button--primary': {
          id: 'button--primary',
          title: 'Button',
          name: 'Primary',
          type: 'story',
        },
        'docs--page': {
          id: 'docs--page',
          title: 'Docs',
          type: 'docs',
        },
      },
    };

    let stories = parseStories(indexData);

    expect(stories).toHaveLength(1);
    expect(stories[0].id).toBe('button--primary');
  });

  it('should throw error for invalid data', () => {
    expect(() => parseStories(null)).toThrow('Invalid index.json');
  });

  it('should throw error for unrecognized format', () => {
    expect(() => parseStories({})).toThrow('Unrecognized Storybook');
  });
});

describe('extractStoryConfig', () => {
  it('should extract vizzly config from parameters', () => {
    let story = {
      parameters: {
        vizzly: {
          viewports: [{ name: 'mobile', width: 375, height: 667 }],
        },
      },
    };

    let config = extractStoryConfig(story);

    expect(config).toEqual({
      viewports: [{ name: 'mobile', width: 375, height: 667 }],
    });
  });

  it('should return null if no vizzly config', () => {
    let story = { parameters: {} };

    expect(extractStoryConfig(story)).toBeNull();
  });

  it('should return null if no parameters', () => {
    let story = {};

    expect(extractStoryConfig(story)).toBeNull();
  });
});

describe('filterStories', () => {
  let stories = [
    { id: 'button--primary', title: 'Button' },
    { id: 'button--secondary', title: 'Button' },
    { id: 'card--default', title: 'Card' },
    {
      id: 'card--skipped',
      title: 'Card',
      parameters: { vizzly: { skip: true } },
    },
  ];

  it('should filter by include pattern', () => {
    let config = { include: 'button*' };
    let filtered = filterStories(stories, config);

    expect(filtered).toHaveLength(2);
    expect(filtered.every(s => s.id.startsWith('button'))).toBe(true);
  });

  it('should filter by exclude pattern', () => {
    let config = { exclude: 'button*' };
    let filtered = filterStories(stories, config);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('card--default');
  });

  it('should skip stories marked with skip: true', () => {
    let config = {};
    let filtered = filterStories(stories, config);

    expect(filtered).toHaveLength(3);
    expect(filtered.find(s => s.id === 'card--skipped')).toBeUndefined();
  });

  it('should apply both include and skip filters', () => {
    let config = { include: 'card*' };
    let filtered = filterStories(stories, config);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('card--default');
  });
});

describe('generateStoryUrl', () => {
  it('should generate correct iframe URL', () => {
    let url = generateStoryUrl('file:///path/to/storybook', 'button--primary');

    expect(url).toBe(
      'file:///path/to/storybook/iframe.html?id=button--primary&viewMode=story'
    );
  });

  it('should encode story ID', () => {
    let url = generateStoryUrl('http://localhost:6006', 'my story/with spaces');

    expect(url).toContain('id=my%20story%2Fwith%20spaces');
  });
});
