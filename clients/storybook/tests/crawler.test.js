/**
 * Tests for story crawler functions
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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

    assert.equal(stories.length, 2);
    assert.equal(stories[0].id, 'button--primary');
    assert.equal(stories[0].title, 'Button');
    assert.equal(stories[0].name, 'Primary');
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

    assert.equal(stories.length, 1);
    assert.equal(stories[0].id, 'button--primary');
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

    assert.equal(stories.length, 1);
    assert.equal(stories[0].id, 'button--primary');
  });

  it('should throw error for invalid data', () => {
    assert.throws(() => parseStories(null), /Invalid index\.json/);
  });

  it('should throw error for unrecognized format', () => {
    assert.throws(() => parseStories({}), /Unrecognized Storybook/);
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

    assert.deepEqual(config, {
      viewports: [{ name: 'mobile', width: 375, height: 667 }],
    });
  });

  it('should return null if no vizzly config', () => {
    let story = { parameters: {} };

    assert.equal(extractStoryConfig(story), null);
  });

  it('should return null if no parameters', () => {
    let story = {};

    assert.equal(extractStoryConfig(story), null);
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

    assert.equal(filtered.length, 2);
    assert.ok(filtered.every(s => s.id.startsWith('button')));
  });

  it('should filter by exclude pattern', () => {
    let config = { exclude: 'button*' };
    let filtered = filterStories(stories, config);

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'card--default');
  });

  it('should skip stories marked with skip: true', () => {
    let config = {};
    let filtered = filterStories(stories, config);

    assert.equal(filtered.length, 3);
    assert.equal(filtered.find(s => s.id === 'card--skipped'), undefined);
  });

  it('should apply both include and skip filters', () => {
    let config = { include: 'card*' };
    let filtered = filterStories(stories, config);

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'card--default');
  });
});

describe('generateStoryUrl', () => {
  it('should generate correct iframe URL', () => {
    let url = generateStoryUrl('file:///path/to/storybook', 'button--primary');

    assert.equal(
      url,
      'file:///path/to/storybook/iframe.html?id=button--primary&viewMode=story'
    );
  });

  it('should encode story ID', () => {
    let url = generateStoryUrl('http://localhost:6006', 'my story/with spaces');

    assert.ok(url.includes('id=my%20story%2Fwith%20spaces'));
  });
});
