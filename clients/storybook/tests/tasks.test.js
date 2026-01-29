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
      getStoryConfig: (story, cfg) => ({
        viewports: cfg.viewports,
        screenshot: {},
      }),
      generateStoryUrl: (base, storyId) => `${base}/iframe.html?id=${storyId}`,
      getBeforeScreenshotHook: () => null,
    };

    let tasks = generateTasks(stories, baseUrl, config, deps);

    assert.strictEqual(tasks.length, 4); // 2 stories × 2 viewports
    assert.deepStrictEqual(tasks[0], {
      story: { id: 'button--primary', title: 'Button', name: 'Primary' },
      viewport: { name: 'mobile', width: 375, height: 667 },
      hook: null,
      url: 'http://localhost:6006/iframe.html?id=button--primary',
      screenshotOptions: {},
    });
    assert.deepStrictEqual(tasks[1], {
      story: { id: 'button--primary', title: 'Button', name: 'Primary' },
      viewport: { name: 'desktop', width: 1920, height: 1080 },
      hook: null,
      url: 'http://localhost:6006/iframe.html?id=button--primary',
      screenshotOptions: {},
    });
    assert.strictEqual(tasks[2].story.id, 'button--secondary');
    assert.strictEqual(tasks[3].story.id, 'button--secondary');
  });

  it('handles single story with single viewport', () => {
    let stories = [{ id: 'card--default', title: 'Card', name: 'Default' }];
    let baseUrl = 'http://localhost:6006';
    let config = {
      viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
    };

    let deps = {
      getStoryConfig: (story, cfg) => ({
        viewports: cfg.viewports,
        screenshot: {},
      }),
      generateStoryUrl: (base, storyId) => `${base}/iframe.html?id=${storyId}`,
      getBeforeScreenshotHook: () => null,
    };

    let tasks = generateTasks(stories, baseUrl, config, deps);

    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(
      tasks[0].url,
      'http://localhost:6006/iframe.html?id=card--default'
    );
  });

  it('handles empty stories array', () => {
    let stories = [];
    let baseUrl = 'http://localhost:6006';
    let config = {
      viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
    };

    let deps = {
      getStoryConfig: () => ({ viewports: [], screenshot: {} }),
      generateStoryUrl: () => '',
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
      navigateToUrl: async (tab, url) => {
        navigateCalls.push({ tab, url });
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
      url: 'http://localhost:6006/iframe.html?id=button--primary',
      screenshotOptions: { fullPage: true },
    };

    await processTask(tab, task, deps);

    assert.strictEqual(setViewportCalls.length, 1);
    assert.strictEqual(setViewportCalls[0].tab, tab);
    assert.deepStrictEqual(setViewportCalls[0].viewport, task.viewport);

    assert.strictEqual(navigateCalls.length, 1);
    assert.strictEqual(navigateCalls[0].url, task.url);

    assert.strictEqual(screenshotCalls.length, 1);
    assert.deepStrictEqual(screenshotCalls[0].opts, { fullPage: true });
  });

  it('runs hook if provided', async () => {
    let hookCalls = [];

    let deps = {
      setViewport: async () => {},
      navigateToUrl: async () => {},
      captureAndSendScreenshot: async () => {},
    };

    let tab = { id: 1 };
    let task = {
      story: { id: 'button--primary', title: 'Button', name: 'Primary' },
      viewport: { name: 'desktop', width: 1920, height: 1080 },
      hook: async t => {
        hookCalls.push(t);
      },
      url: 'http://localhost:6006/iframe.html?id=button--primary',
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
    };

    let deps = {
      setViewport: async () => {},
      navigateToUrl: async () => {},
      captureAndSendScreenshot: async () => {},
    };

    let tasks = [
      {
        story: { id: 'button--primary', title: 'Button', name: 'Primary' },
        viewport: { name: 'desktop', width: 1920, height: 1080 },
        hook: null,
        url: 'http://localhost:6006/iframe.html?id=button--primary',
        screenshotOptions: {},
      },
      {
        story: { id: 'button--secondary', title: 'Button', name: 'Secondary' },
        viewport: { name: 'mobile', width: 375, height: 667 },
        hook: null,
        url: 'http://localhost:6006/iframe.html?id=button--secondary',
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
      navigateToUrl: async () => {},
      captureAndSendScreenshot: async () => {
        throw new Error('Screenshot failed');
      },
    };

    let tasks = [
      {
        story: { id: 'button--broken', title: 'Button', name: 'Broken' },
        viewport: { name: 'desktop', width: 1920, height: 1080 },
        hook: null,
        url: 'http://localhost:6006/iframe.html?id=button--broken',
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
      navigateToUrl: async () => {},
      captureAndSendScreenshot: async () => {},
    };

    let tasks = [
      {
        story: { id: 'button--primary', title: 'Button', name: 'Primary' },
        viewport: { name: 'desktop', width: 1920, height: 1080 },
        hook: null,
        url: 'http://localhost:6006/iframe.html?id=button--primary',
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
    };

    let deps = {
      setViewport: async () => {},
      navigateToUrl: async () => {},
      captureAndSendScreenshot: async () => {},
    };

    let tasks = Array.from({ length: 5 }, (_, i) => ({
      story: { id: `story--${i}`, title: 'Story', name: `${i}` },
      viewport: { name: 'desktop', width: 1920, height: 1080 },
      hook: null,
      url: `http://localhost:6006/iframe.html?id=story--${i}`,
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
      };

      let deps = {
        setViewport: async () => {},
        navigateToUrl: async () => {},
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
          url: 'http://localhost:6006/iframe.html?id=button--primary',
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
        navigateToUrl: async () => {},
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
          url: 'http://localhost:6006/iframe.html?id=button--primary',
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
        navigateToUrl: async () => {},
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
          url: 'http://localhost:6006/iframe.html?id=button--primary',
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
        navigateToUrl: async () => {},
        captureAndSendScreenshot: async () => {
          throw new Error('Target closed');
        },
      };

      let tasks = [
        {
          story: { id: 'button--primary', title: 'Button', name: 'Primary' },
          viewport: { name: 'desktop', width: 1920, height: 1080 },
          hook: null,
          url: 'http://localhost:6006/iframe.html?id=button--primary',
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
      };

      let deps = {
        setViewport: async () => {},
        navigateToUrl: async () => {},
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
          url: 'http://localhost:6006/iframe.html?id=button--primary',
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
      };

      let firstAttempt = true;
      let deps = {
        setViewport: async () => {},
        navigateToUrl: async () => {},
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
          url: 'http://localhost:6006/iframe.html?id=button--primary',
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
        navigateToUrl: async () => {},
        captureAndSendScreenshot: async () => {
          throw new Error('Navigation timeout');
        },
      };

      let tasks = [
        {
          story: { id: 'button--primary', title: 'Button', name: 'Primary' },
          viewport: { name: 'desktop', width: 1920, height: 1080 },
          hook: null,
          url: 'http://localhost:6006/iframe.html?id=button--primary',
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
      };

      let firstAttempt = true;
      let deps = {
        setViewport: async () => {},
        navigateToUrl: async () => {},
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
          url: 'http://localhost:6006/iframe.html?id=button--primary',
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
