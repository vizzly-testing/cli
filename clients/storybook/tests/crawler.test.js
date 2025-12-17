/**
 * Tests for story crawler functions
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  discoverStories,
  extractStoryConfig,
  filterStories,
  generateStoryUrl,
  parseStories,
  readIndexJson,
} from '../src/crawler.js';

describe('readIndexJson', () => {
  it('should read and parse index.json', async () => {
    let dir = await mkdtemp(join(tmpdir(), 'vizzly-storybook-'));
    try {
      let indexData = { v: 7, entries: {} };
      await writeFile(join(dir, 'index.json'), JSON.stringify(indexData), 'utf-8');

      let parsed = await readIndexJson(dir);
      assert.deepEqual(parsed, indexData);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('should throw a helpful error when index.json cannot be read', async () => {
    let dir = await mkdtemp(join(tmpdir(), 'vizzly-storybook-missing-'));
    try {
      await assert.rejects(
        () => readIndexJson(dir),
        /Failed to read Storybook index\.json at .*index\.json:/
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

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

    assert.strictEqual(stories.length, 2);
    let { id, title, name } = stories[0];
    assert.deepEqual(
      { id, title, name },
      { id: 'button--primary', title: 'Button', name: 'Primary' }
    );
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

    assert.strictEqual(stories.length, 1);
    assert.strictEqual(stories[0].id, 'button--primary');
  });

  it('should apply v6 fallbacks for missing fields', () => {
    let indexData = {
      stories: {
        'story-id': {
          kind: 'FallbackKind',
          story: 'FallbackStory',
        },
        'empty-story': {},
      },
    };

    let stories = parseStories(indexData);

    assert.strictEqual(stories.length, 2);

    let story1 = stories.find(s => s.id === 'story-id');
    assert.ok(story1);
    assert.strictEqual(story1.title, 'FallbackKind');
    assert.strictEqual(story1.name, 'FallbackStory');
    assert.strictEqual(story1.kind, 'FallbackKind');
    assert.deepEqual(story1.parameters, {});
    assert.deepEqual(story1.tags, []);

    let story2 = stories.find(s => s.id === 'empty-story');
    assert.ok(story2);
    assert.strictEqual(story2.title, 'empty-story');
    assert.strictEqual(story2.name, 'default');
    assert.strictEqual(story2.kind, undefined);
    assert.deepEqual(story2.parameters, {});
    assert.deepEqual(story2.tags, []);
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

    assert.strictEqual(stories.length, 1);
    assert.strictEqual(stories[0].id, 'button--primary');
  });

  it('should apply v7 fallbacks for missing fields', () => {
    let indexData = {
      v: 7,
      entries: {
        'id-with-missing-fields': {
          id: 'id-with-missing-fields',
          type: 'story',
        },
      },
    };

    let stories = parseStories(indexData);

    assert.strictEqual(stories.length, 1);
    assert.strictEqual(stories[0].id, 'id-with-missing-fields');
    assert.strictEqual(stories[0].title, 'id-with-missing-fields');
    assert.strictEqual(stories[0].name, 'default');
    assert.deepEqual(stories[0].parameters, {});
    assert.deepEqual(stories[0].tags, []);
  });

  it('should handle v7 index.json with no entries', () => {
    let stories = parseStories({ v: 7 });
    assert.deepEqual(stories, []);
  });

  it('should treat entries as v7 even without explicit version field', () => {
    let indexData = {
      entries: {
        'button--primary': {
          id: 'button--primary',
          title: 'Button',
          name: 'Primary',
          type: 'story',
        },
      },
    };

    let stories = parseStories(indexData);

    assert.strictEqual(stories.length, 1);
    assert.strictEqual(stories[0].id, 'button--primary');
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

    assert.strictEqual(extractStoryConfig(story), null);
  });

  it('should return null if no parameters', () => {
    let story = {};

    assert.strictEqual(extractStoryConfig(story), null);
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

    assert.strictEqual(filtered.length, 2);
    assert.ok(filtered.every(s => s.id.startsWith('button')));
  });

  it('should filter by exclude pattern', () => {
    let config = { exclude: 'button*' };
    let filtered = filterStories(stories, config);

    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 'card--default');
  });

  it('should skip stories marked with skip: true', () => {
    let config = {};
    let filtered = filterStories(stories, config);

    assert.strictEqual(filtered.length, 3);
    assert.strictEqual(filtered.find(s => s.id === 'card--skipped'), undefined);
  });

  it('should apply both include and skip filters', () => {
    let config = { include: 'card*' };
    let filtered = filterStories(stories, config);

    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 'card--default');
  });
});

describe('generateStoryUrl', () => {
  it('should generate correct iframe URL', () => {
    let url = generateStoryUrl('file:///path/to/storybook', 'button--primary');

    assert.strictEqual(
      url,
      'file:///path/to/storybook/iframe.html?id=button--primary&viewMode=story'
    );
  });

  it('should encode story ID', () => {
    let url = generateStoryUrl('http://localhost:6006', 'my story/with spaces');

    assert.ok(url.includes('id=my%20story%2Fwith%20spaces'));
  });

  it('should validate baseUrl and storyId', () => {
    assert.throws(() => generateStoryUrl('', 'story'), /baseUrl must be a non-empty string/);
    assert.throws(
      () => generateStoryUrl('http://localhost:6006', ''),
      /storyId must be a non-empty string/
    );
  });

  it('should validate argument types', () => {
    assert.throws(() => generateStoryUrl(123, 'story'), /baseUrl must be a non-empty string/);
    assert.throws(
      () => generateStoryUrl('http://localhost:6006', 456),
      /storyId must be a non-empty string/
    );
  });
});

describe('discoverStories', () => {
  it('should read, parse, and filter stories from a Storybook build', async () => {
    let dir = await mkdtemp(join(tmpdir(), 'vizzly-storybook-discover-'));
    try {
      let indexData = {
        v: 7,
        entries: {
          'button--primary': {
            id: 'button--primary',
            title: 'Button',
            name: 'Primary',
            type: 'story',
          },
          'button--skipped': {
            id: 'button--skipped',
            title: 'Button',
            name: 'Skipped',
            type: 'story',
            parameters: { vizzly: { skip: true } },
          },
          'card--default': {
            id: 'card--default',
            title: 'Card',
            name: 'Default',
            type: 'story',
          },
        },
      };

      await writeFile(join(dir, 'index.json'), JSON.stringify(indexData), 'utf-8');

      let stories = await discoverStories(dir, { include: 'button*', exclude: null });

      assert.strictEqual(stories.length, 1);
      assert.strictEqual(stories[0].id, 'button--primary');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
