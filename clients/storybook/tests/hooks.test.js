/**
 * Tests for interaction hooks
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  applyHook,
  getBeforeScreenshotHook,
  getStoryConfig,
} from '../src/hooks.js';

describe('getBeforeScreenshotHook', () => {
  it('should return story-level hook if present', () => {
    let storyHook = mock.fn();
    let story = {
      parameters: {
        vizzly: {
          beforeScreenshot: storyHook,
        },
      },
    };
    let globalConfig = {
      interactions: {
        'Button/*': mock.fn(),
      },
    };

    let hook = getBeforeScreenshotHook(story, globalConfig);

    assert.strictEqual(hook, storyHook);
  });

  it('should return global pattern hook if no story hook', () => {
    let globalHook = mock.fn();
    let story = {
      id: 'button--primary',
      title: 'Button',
      name: 'Primary',
    };
    let globalConfig = {
      interactions: {
        'button*': globalHook,
      },
    };

    let hook = getBeforeScreenshotHook(story, globalConfig);

    assert.strictEqual(hook, globalHook);
  });

  it('should return null if no hooks match', () => {
    let story = {
      id: 'button--primary',
      title: 'Button',
      name: 'Primary',
    };
    let globalConfig = {
      interactions: {
        'Card/*': mock.fn(),
      },
    };

    let hook = getBeforeScreenshotHook(story, globalConfig);

    assert.strictEqual(hook, null);
  });

  it('should prioritize story hook over global hook', () => {
    let storyHook = mock.fn();
    let globalHook = mock.fn();
    let story = {
      id: 'button--primary',
      title: 'Button',
      name: 'Primary',
      parameters: {
        vizzly: {
          beforeScreenshot: storyHook,
        },
      },
    };
    let globalConfig = {
      interactions: {
        'button*': globalHook,
      },
    };

    let hook = getBeforeScreenshotHook(story, globalConfig);

    assert.strictEqual(hook, storyHook);
    assert.notStrictEqual(hook, globalHook);
  });
});

describe('applyHook', () => {
  it('should execute hook with page', async () => {
    let mockPage = { hover: mock.fn() };
    let hook = mock.fn(async page => {
      await page.hover('.button');
    });

    await applyHook(mockPage, hook);

    assert.strictEqual(hook.mock.calls.length, 1);
    assert.strictEqual(hook.mock.calls[0].arguments[0], mockPage);
    assert.deepEqual(hook.mock.calls[0].arguments[1], {});

    assert.strictEqual(mockPage.hover.mock.calls.length, 1);
    assert.strictEqual(mockPage.hover.mock.calls[0].arguments[0], '.button');
  });

  it('should pass context to hook', async () => {
    let mockPage = {};
    let hook = mock.fn();
    let context = { story: 'test' };

    await applyHook(mockPage, hook, context);

    assert.strictEqual(hook.mock.calls.length, 1);
    assert.strictEqual(hook.mock.calls[0].arguments[0], mockPage);
    assert.strictEqual(hook.mock.calls[0].arguments[1], context);
  });

  it('should do nothing if hook is null', async () => {
    let mockPage = {};

    let result = await applyHook(mockPage, null);
    assert.strictEqual(result, undefined);
  });

  it('should do nothing if hook is not a function', async () => {
    let mockPage = {};

    let result = await applyHook(mockPage, 'not a function');
    assert.strictEqual(result, undefined);
  });

  it('should throw error if hook fails', async () => {
    let mockPage = {};
    let hook = mock.fn(async () => {
      throw new Error('Hook failed');
    });

    await assert.rejects(
      () => applyHook(mockPage, hook),
      /Hook execution failed: Hook failed/
    );
  });
});

describe('getStoryConfig', () => {
  it('should merge global and story config', () => {
    let story = {
      parameters: {
        vizzly: {
          viewports: [{ name: 'mobile', width: 375, height: 667 }],
        },
      },
    };
    let globalConfig = {
      viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
      concurrency: 3,
    };

    let config = getStoryConfig(story, globalConfig);

    assert.strictEqual(config.viewports[0].name, 'mobile');
    assert.strictEqual(config.concurrency, 3);
  });

  it('should return global config if no story config', () => {
    let story = {};
    let globalConfig = {
      viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
    };

    let config = getStoryConfig(story, globalConfig);

    assert.deepEqual(config, globalConfig);
  });
});
