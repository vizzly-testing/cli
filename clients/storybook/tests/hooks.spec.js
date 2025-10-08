/**
 * Tests for interaction hooks
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getBeforeScreenshotHook,
  applyHook,
  getStoryConfig,
} from '../src/hooks.js';

describe('getBeforeScreenshotHook', () => {
  it('should return story-level hook if present', () => {
    let storyHook = vi.fn();
    let story = {
      parameters: {
        vizzly: {
          beforeScreenshot: storyHook,
        },
      },
    };
    let globalConfig = {
      interactions: {
        'Button/*': vi.fn(),
      },
    };

    let hook = getBeforeScreenshotHook(story, globalConfig);

    expect(hook).toBe(storyHook);
  });

  it('should return global pattern hook if no story hook', () => {
    let globalHook = vi.fn();
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

    expect(hook).toBe(globalHook);
  });

  it('should return null if no hooks match', () => {
    let story = {
      id: 'button--primary',
      title: 'Button',
      name: 'Primary',
    };
    let globalConfig = {
      interactions: {
        'Card/*': vi.fn(),
      },
    };

    let hook = getBeforeScreenshotHook(story, globalConfig);

    expect(hook).toBeNull();
  });

  it('should prioritize story hook over global hook', () => {
    let storyHook = vi.fn();
    let globalHook = vi.fn();
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

    expect(hook).toBe(storyHook);
    expect(hook).not.toBe(globalHook);
  });
});

describe('applyHook', () => {
  it('should execute hook with page', async () => {
    let mockPage = { hover: vi.fn() };
    let hook = vi.fn(async page => {
      await page.hover('.button');
    });

    await applyHook(mockPage, hook);

    expect(hook).toHaveBeenCalledWith(mockPage, {});
    expect(mockPage.hover).toHaveBeenCalledWith('.button');
  });

  it('should pass context to hook', async () => {
    let mockPage = {};
    let hook = vi.fn();
    let context = { story: 'test' };

    await applyHook(mockPage, hook, context);

    expect(hook).toHaveBeenCalledWith(mockPage, context);
  });

  it('should do nothing if hook is null', async () => {
    let mockPage = {};

    await expect(applyHook(mockPage, null)).resolves.toBeUndefined();
  });

  it('should do nothing if hook is not a function', async () => {
    let mockPage = {};

    await expect(
      applyHook(mockPage, 'not a function')
    ).resolves.toBeUndefined();
  });

  it('should throw error if hook fails', async () => {
    let mockPage = {};
    let hook = vi.fn(async () => {
      throw new Error('Hook failed');
    });

    await expect(applyHook(mockPage, hook)).rejects.toThrow(
      'Hook execution failed: Hook failed'
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

    expect(config.viewports[0].name).toBe('mobile');
    expect(config.concurrency).toBe(3);
  });

  it('should return global config if no story config', () => {
    let story = {};
    let globalConfig = {
      viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
    };

    let config = getStoryConfig(story, globalConfig);

    expect(config).toEqual(globalConfig);
  });
});
