/**
 * Tests for task generation and processing
 */

import assert from 'node:assert';
import { describe, it, mock } from 'node:test';
import { generateTasks, processTask, processAllTasks } from '../src/tasks.js';

describe('generateTasks', () => {
  it('generates tasks for each story × viewport combination', () => {
    let stories = [
      { id: 'button--primary', title: 'Button', name: 'Primary' },
      { id: 'button--secondary', title: 'Button', name: 'Secondary' },
    ];
    let baseUrl = 'http://localhost:6006';
    let config = {
      viewports: [
        { name: 'mobile', width: 375, height: 667 },
        { name: 'desktop', width: 1920, height: 1080 },
      ],
    };

    let deps = {
      getStoryConfig: (_story, cfg) => ({
        viewports: cfg.viewports,
        screenshot: {},
      }),
      getBeforeScreenshotHook: () => null,
    };

    let tasks = generateTasks(stories, baseUrl, config, deps);

    assert.strictEqual(tasks.length, 4); // 2 stories × 2 viewports

    // Tasks are sorted by viewport, so find specific tasks by story+viewport
    let primaryMobile = tasks.find(
      t => t.story.id === 'button--primary' && t.viewport.name === 'mobile'
    );
    let primaryDesktop = tasks.find(
      t => t.story.id === 'button--primary' && t.viewport.name === 'desktop'
    );

    assert.deepStrictEqual(primaryMobile, {
      story: { id: 'button--primary', title: 'Button', name: 'Primary' },
      viewport: { name: 'mobile', width: 375, height: 667 },
      hook: null,
      storyId: 'button--primary',
      baseUrl: 'http://localhost:6006',
      screenshotOptions: {},
    });
    assert.deepStrictEqual(primaryDesktop, {
      story: { id: 'button--primary', title: 'Button', name: 'Primary' },
      viewport: { name: 'desktop', width: 1920, height: 1080 },
      hook: null,
      storyId: 'button--primary',
      baseUrl: 'http://localhost:6006',
      screenshotOptions: {},
    });
    // Check secondary stories exist
    assert.ok(tasks.some(t => t.story.id === 'button--secondary'));
  });

  it('sorts tasks by viewport to minimize viewport changes', () => {
    let stories = [
      { id: 'button--primary', title: 'Button', name: 'Primary' },
      { id: 'button--secondary', title: 'Button', name: 'Secondary' },
    ];
    let baseUrl = 'http://localhost:6006';
    let config = {
      viewports: [
        { name: 'mobile', width: 375, height: 667 },
        { name: 'desktop', width: 1920, height: 1080 },
      ],
    };

    let deps = {
      getStoryConfig: (_story, cfg) => ({
        viewports: cfg.viewports,
        screenshot: {},
      }),
      getBeforeScreenshotHook: () => null,
    };

    let tasks = generateTasks(stories, baseUrl, config, deps);

    // Tasks should be grouped by viewport
    let viewportOrder = tasks.map(t => `${t.viewport.width}x${t.viewport.height}`);
    // Same viewports should be adjacent
    let desktopIndices = viewportOrder
      .map((v, i) => (v === '1920x1080' ? i : -1))
      .filter(i => i >= 0);
    let mobileIndices = viewportOrder
      .map((v, i) => (v === '375x667' ? i : -1))
      .filter(i => i >= 0);

    // All desktop tasks should be contiguous (indices are consecutive)
    assert.ok(
      desktopIndices.every((idx, i) => i === 0 || idx === desktopIndices[i - 1] + 1)
    );
    // All mobile tasks should be contiguous
    assert.ok(
      mobileIndices.every((idx, i) => i === 0 || idx === mobileIndices[i - 1] + 1)
    );
  });

  it('handles single story with single viewport', () => {
    let stories = [{ id: 'card--default', title: 'Card', name: 'Default' }];
    let baseUrl = 'http://localhost:6006';
    let config = {
      viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
    };

    let deps = {
      getStoryConfig: (_story, cfg) => ({
        viewports: cfg.viewports,
        screenshot: {},
      }),
      getBeforeScreenshotHook: () => null,
    };

    let tasks = generateTasks(stories, baseUrl, config, deps);

    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].storyId, 'card--default');
    assert.strictEqual(tasks[0].baseUrl, 'http://localhost:6006');
  });

  it('handles empty stories array', () => {
    let stories = [];
    let baseUrl = 'http://localhost:6006';
    let config = {
      viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
    };

    let deps = {
      getStoryConfig: () => ({ viewports: [], screenshot: {} }),
      getBeforeScreenshotHook: () => null,
    };

    let tasks = generateTasks(stories, baseUrl, config, deps);

    assert.strictEqual(tasks.length, 0);
  });
});

describe('processTask', () => {
  it('sets viewport, navigates, and captures screenshot', async () => {
    let setViewportCalls = [];
    let navigateCalls = [];
    let screenshotCalls = [];

    let deps = {
      setViewport: async (tab, viewport) => {
        setViewportCalls.push({ tab, viewport });
      },
      navigateToStory: async (tab, storyId, baseUrl) => {
        navigateCalls.push({ tab, storyId, baseUrl });
      },
      captureAndSendScreenshot: async (tab, story, viewport, opts) => {
        screenshotCalls.push({ tab, story, viewport, opts });
      },
    };

    let tab = { id: 1 };
    let task = {
      story: { id: 'button--primary', title: 'Button', name: 'Primary' },
      viewport: { name: 'desktop', width: 1920, height: 1080 },
      hook: null,
      storyId: 'button--primary',
      baseUrl: 'http://localhost:6006',
      screenshotOptions: { fullPage: true },
    };

    await processTask(tab, task, deps);

    assert.strictEqual(setViewportCalls.length, 1);
    assert.strictEqual(setViewportCalls[0].tab, tab);
    assert.deepStrictEqual(setViewportCalls[0].viewport, task.viewport);

    assert.strictEqual(navigateCalls.length, 1);
    assert.strictEqual(navigateCalls[0].storyId, 'button--primary');
    assert.strictEqual(navigateCalls[0].baseUrl, 'http://localhost:6006');

    assert.strictEqual(screenshotCalls.length, 1);
    assert.deepStrictEqual(screenshotCalls[0].opts, { fullPage: true });
  });

  it('runs hook if provided', async () => {
    let hookCalls = [];

    let deps = {
      setViewport: async () => {},
      navigateToStory: async () => {},
      captureAndSendScreenshot: async () => {},
    };

    let tab = { id: 1 };
    let task = {
      story: { id: 'button--primary', title: 'Button', name: 'Primary' },
      viewport: { name: 'desktop', width: 1920, height: 1080 },
      hook: async t => {
        hookCalls.push(t);
      },
      storyId: 'button--primary',
      baseUrl: 'http://localhost:6006',
      screenshotOptions: {},
    };

    await processTask(tab, task, deps);

    assert.strictEqual(hookCalls.length, 1);
    assert.strictEqual(hookCalls[0], tab);
  });
});

describe('processAllTasks', () => {
  it('processes all tasks and returns errors', async () => {
    let acquireCount = 0;
    let releaseCalls = 0;

    let pool = {
      acquire: async () => ({ id: ++acquireCount }),
      release: () => {
        releaseCalls++;
      },
    };

    let config = { concurrency: 2 };
    let logger = {
      info: mock.fn(),
      error: mock.fn(),
      warn: mock.fn(),
    };

    let deps = {
      setViewport: async () => {},
      navigateToStory: async () => {},
      captureAndSendScreenshot: async () => {},
    };

    let tasks = [
      {
        story: { id: 'button--primary', title: 'Button', name: 'Primary' },
        viewport: { name: 'desktop', width: 1920, height: 1080 },
        hook: null,
        storyId: 'button--primary',
        baseUrl: 'http://localhost:6006',
        screenshotOptions: {},
      },
      {
        story: { id: 'button--secondary', title: 'Button', name: 'Secondary' },
        viewport: { name: 'mobile', width: 375, height: 667 },
        hook: null,
        storyId: 'button--secondary',
        baseUrl: 'http://localhost:6006',
        screenshotOptions: {},
      },
    ];

    let errors = await processAllTasks(tasks, pool, config, logger, deps);

    assert.strictEqual(errors.length, 0);
    assert.strictEqual(acquireCount, 2);
    assert.strictEqual(releaseCalls, 2);
    // 2 task logs + 1 completion time log
    assert.strictEqual(logger.info.mock.callCount(), 3);
  });

  it('collects errors when tasks fail', async () => {
    let pool = {
      acquire: async () => ({ id: 1 }),
      release: mock.fn(),
    };

    let config = { concurrency: 2 };
    let logger = {
      info: mock.fn(),
      error: mock.fn(),
      warn: mock.fn(),
    };

    let deps = {
      setViewport: async () => {},
      navigateToStory: async () => {},
      captureAndSendScreenshot: async () => {
        throw new Error('Screenshot failed');
      },
    };

    let tasks = [
      {
        story: { id: 'button--broken', title: 'Button', name: 'Broken' },
        viewport: { name: 'desktop', width: 1920, height: 1080 },
        hook: null,
        storyId: 'button--broken',
        baseUrl: 'http://localhost:6006',
        screenshotOptions: {},
      },
    ];

    let errors = await processAllTasks(tasks, pool, config, logger, deps);

    assert.strictEqual(errors.length, 1);
    assert.deepStrictEqual(errors[0], {
      story: 'Button/Broken',
      viewport: 'desktop',
      error: 'Screenshot failed',
    });
    assert.strictEqual(logger.error.mock.callCount(), 1);
    // Tab should still be released even on error
    assert.strictEqual(pool.release.mock.callCount(), 1);
  });

  it('handles pool returning null (drained)', async () => {
    let pool = {
      acquire: async () => null,
      release: mock.fn(),
    };

    let config = { concurrency: 2 };
    let logger = {
      info: mock.fn(),
      error: mock.fn(),
      warn: mock.fn(),
    };

    let deps = {
      setViewport: async () => {},
      navigateToStory: async () => {},
      captureAndSendScreenshot: async () => {},
    };

    let tasks = [
      {
        story: { id: 'button--primary', title: 'Button', name: 'Primary' },
        viewport: { name: 'desktop', width: 1920, height: 1080 },
        hook: null,
        storyId: 'button--primary',
        baseUrl: 'http://localhost:6006',
        screenshotOptions: {},
      },
    ];

    let errors = await processAllTasks(tasks, pool, config, logger, deps);

    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].error.includes('Pool was drained'));
  });

  it('respects concurrency limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    let pool = {
      acquire: async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        return { id: 1 };
      },
      release: () => {
        concurrent--;
      },
    };

    let config = { concurrency: 2 };
    let logger = {
      info: mock.fn(),
      error: mock.fn(),
      warn: mock.fn(),
    };

    let deps = {
      setViewport: async () => {},
      navigateToStory: async () => {},
      captureAndSendScreenshot: async () => {},
    };

    let tasks = Array.from({ length: 5 }, (_, i) => ({
      story: { id: `story--${i}`, title: 'Story', name: `${i}` },
      viewport: { name: 'desktop', width: 1920, height: 1080 },
      hook: null,
      storyId: `story--${i}`,
      baseUrl: 'http://localhost:6006',
      screenshotOptions: {},
    }));

    await processAllTasks(tasks, pool, config, logger, deps);

    assert.ok(maxConcurrent <= 2);
  });

  describe('retry logic', () => {
    it('retries with fresh tab on timeout error', async () => {
      let acquireCount = 0;
      let releaseCalls = [];
      let closeCalls = [];
      let screenshotAttempts = 0;

      let pool = {
        acquire: async () => {
          acquireCount++;
          return {
            id: acquireCount,
            close: async () => closeCalls.push(acquireCount),
          };
        },
        release: tab => {
          releaseCalls.push(tab.id);
        },
      };

      let config = { concurrency: 1 };
      let logger = {
        info: mock.fn(),
        error: mock.fn(),
        warn: mock.fn(),
      };

      let deps = {
        setViewport: async () => {},
        navigateToStory: async () => {},
        captureAndSendScreenshot: async () => {
          screenshotAttempts++;
          if (screenshotAttempts === 1) {
            throw new Error('Navigation timeout exceeded');
          }
          // Second attempt succeeds
        },
      };

      let tasks = [
        {
          story: { id: 'button--primary', title: 'Button', name: 'Primary' },
          viewport: { name: 'desktop', width: 1920, height: 1080 },
          hook: null,
          storyId: 'button--primary',
          baseUrl: 'http://localhost:6006',
          screenshotOptions: {},
        },
      ];

      let errors = await processAllTasks(tasks, pool, config, logger, deps);

      assert.strictEqual(errors.length, 0);
      assert.strictEqual(screenshotAttempts, 2);
      assert.strictEqual(acquireCount, 2); // Original + retry
      assert.deepStrictEqual(closeCalls, [1]); // First tab closed
      assert.deepStrictEqual(releaseCalls, [2]); // Second tab released
    });

    it('does not retry on non-timeout errors', async () => {
      let screenshotAttempts = 0;

      let pool = {
        acquire: async () => ({ id: 1, close: async () => {} }),
        release: mock.fn(),
      };

      let config = { concurrency: 1 };
      let logger = {
        info: mock.fn(),
        error: mock.fn(),
        warn: mock.fn(),
      };

      let deps = {
        setViewport: async () => {},
        navigateToStory: async () => {},
        captureAndSendScreenshot: async () => {
          screenshotAttempts++;
          throw new Error('Network error: DNS resolution failed');
        },
      };

      let tasks = [
        {
          story: { id: 'button--primary', title: 'Button', name: 'Primary' },
          viewport: { name: 'desktop', width: 1920, height: 1080 },
          hook: null,
          storyId: 'button--primary',
          baseUrl: 'http://localhost:6006',
          screenshotOptions: {},
        },
      ];

      let errors = await processAllTasks(tasks, pool, config, logger, deps);

      assert.strictEqual(errors.length, 1);
      assert.strictEqual(screenshotAttempts, 1); // No retry
      assert.ok(!errors[0].error.includes('after retry'));
    });

    it('does not retry if retry also fails', async () => {
      let screenshotAttempts = 0;
      let acquireCount = 0;

      let pool = {
        acquire: async () => {
          acquireCount++;
          return { id: acquireCount, close: async () => {} };
        },
        release: mock.fn(),
      };

      let config = { concurrency: 1 };
      let logger = {
        info: mock.fn(),
        error: mock.fn(),
        warn: mock.fn(),
      };

      let deps = {
        setViewport: async () => {},
        navigateToStory: async () => {},
        captureAndSendScreenshot: async () => {
          screenshotAttempts++;
          throw new Error('Navigation timeout exceeded');
        },
      };

      let tasks = [
        {
          story: { id: 'button--primary', title: 'Button', name: 'Primary' },
          viewport: { name: 'desktop', width: 1920, height: 1080 },
          hook: null,
          storyId: 'button--primary',
          baseUrl: 'http://localhost:6006',
          screenshotOptions: {},
        },
      ];

      let errors = await processAllTasks(tasks, pool, config, logger, deps);

      assert.strictEqual(errors.length, 1);
      assert.strictEqual(screenshotAttempts, 2); // Original + one retry
      assert.strictEqual(acquireCount, 2);
      assert.ok(errors[0].error.includes('after retry'));
    });

    it('appends retry note to error message', async () => {
      let pool = {
        acquire: async () => ({ id: 1, close: async () => {} }),
        release: mock.fn(),
      };

      let config = { concurrency: 1 };
      let logger = {
        info: mock.fn(),
        error: mock.fn(),
        warn: mock.fn(),
      };

      let deps = {
        setViewport: async () => {},
        navigateToStory: async () => {},
        captureAndSendScreenshot: async () => {
          throw new Error('Target closed');
        },
      };

      let tasks = [
        {
          story: { id: 'button--primary', title: 'Button', name: 'Primary' },
          viewport: { name: 'desktop', width: 1920, height: 1080 },
          hook: null,
          storyId: 'button--primary',
          baseUrl: 'http://localhost:6006',
          screenshotOptions: {},
        },
      ];

      let errors = await processAllTasks(tasks, pool, config, logger, deps);

      assert.strictEqual(errors.length, 1);
      assert.ok(errors[0].error.includes('Target closed'));
      assert.ok(errors[0].error.includes('(after retry)'));
    });

    it('handles Protocol error with retry', async () => {
      let screenshotAttempts = 0;

      let pool = {
        acquire: async () => ({ id: 1, close: async () => {} }),
        release: mock.fn(),
      };

      let config = { concurrency: 1 };
      let logger = {
        info: mock.fn(),
        error: mock.fn(),
        warn: mock.fn(),
      };

      let deps = {
        setViewport: async () => {},
        navigateToStory: async () => {},
        captureAndSendScreenshot: async () => {
          screenshotAttempts++;
          if (screenshotAttempts === 1) {
            throw new Error('Protocol error: Session closed');
          }
        },
      };

      let tasks = [
        {
          story: { id: 'button--primary', title: 'Button', name: 'Primary' },
          viewport: { name: 'desktop', width: 1920, height: 1080 },
          hook: null,
          storyId: 'button--primary',
          baseUrl: 'http://localhost:6006',
          screenshotOptions: {},
        },
      ];

      let errors = await processAllTasks(tasks, pool, config, logger, deps);

      assert.strictEqual(errors.length, 0);
      assert.strictEqual(screenshotAttempts, 2);
    });

    it('closes bad tab before getting fresh one', async () => {
      let events = [];

      let pool = {
        acquire: async () => {
          events.push('acquire');
          return {
            id: events.filter(e => e === 'acquire').length,
            close: async () => events.push('close'),
          };
        },
        release: () => events.push('release'),
      };

      let config = { concurrency: 1 };
      let logger = {
        info: mock.fn(),
        error: mock.fn(),
        warn: mock.fn(),
      };

      let firstAttempt = true;
      let deps = {
        setViewport: async () => {},
        navigateToStory: async () => {},
        captureAndSendScreenshot: async () => {
          if (firstAttempt) {
            firstAttempt = false;
            throw new Error('Timeout waiting for function');
          }
        },
      };

      let tasks = [
        {
          story: { id: 'button--primary', title: 'Button', name: 'Primary' },
          viewport: { name: 'desktop', width: 1920, height: 1080 },
          hook: null,
          storyId: 'button--primary',
          baseUrl: 'http://localhost:6006',
          screenshotOptions: {},
        },
      ];

      await processAllTasks(tasks, pool, config, logger, deps);

      // Verify order: acquire -> close (bad tab) -> acquire (fresh) -> release
      assert.strictEqual(events[0], 'acquire');
      assert.strictEqual(events[1], 'close');
      assert.strictEqual(events[2], 'acquire');
      assert.strictEqual(events[3], 'release');
    });

    it('handles pool returning null during retry', async () => {
      let acquireCount = 0;

      let pool = {
        acquire: async () => {
          acquireCount++;
          if (acquireCount === 2) {
            return null; // Pool drained during retry
          }
          return { id: acquireCount, close: async () => {} };
        },
        release: mock.fn(),
      };

      let config = { concurrency: 1 };
      let logger = {
        info: mock.fn(),
        error: mock.fn(),
        warn: mock.fn(),
      };

      let deps = {
        setViewport: async () => {},
        navigateToStory: async () => {},
        captureAndSendScreenshot: async () => {
          throw new Error('Navigation timeout');
        },
      };

      let tasks = [
        {
          story: { id: 'button--primary', title: 'Button', name: 'Primary' },
          viewport: { name: 'desktop', width: 1920, height: 1080 },
          hook: null,
          storyId: 'button--primary',
          baseUrl: 'http://localhost:6006',
          screenshotOptions: {},
        },
      ];

      let errors = await processAllTasks(tasks, pool, config, logger, deps);

      assert.strictEqual(errors.length, 1);
      assert.ok(errors[0].error.includes('Navigation timeout'));
    });

    it('ignores tab close errors before retry', async () => {
      let acquireCount = 0;

      let pool = {
        acquire: async () => {
          acquireCount++;
          return {
            id: acquireCount,
            close: async () => {
              throw new Error('Tab already closed');
            },
          };
        },
        release: mock.fn(),
      };

      let config = { concurrency: 1 };
      let logger = {
        info: mock.fn(),
        error: mock.fn(),
        warn: mock.fn(),
      };

      let firstAttempt = true;
      let deps = {
        setViewport: async () => {},
        navigateToStory: async () => {},
        captureAndSendScreenshot: async () => {
          if (firstAttempt) {
            firstAttempt = false;
            throw new Error('timeout exceeded');
          }
        },
      };

      let tasks = [
        {
          story: { id: 'button--primary', title: 'Button', name: 'Primary' },
          viewport: { name: 'desktop', width: 1920, height: 1080 },
          hook: null,
          storyId: 'button--primary',
          baseUrl: 'http://localhost:6006',
          screenshotOptions: {},
        },
      ];

      // Should not throw despite close error
      let errors = await processAllTasks(tasks, pool, config, logger, deps);

      assert.strictEqual(errors.length, 0);
      assert.strictEqual(acquireCount, 2);
    });
  });
});
