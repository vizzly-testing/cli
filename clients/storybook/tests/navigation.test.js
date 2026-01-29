/**
 * Tests for smart Storybook navigation
 */

import assert from 'node:assert';
import { describe, it, mock } from 'node:test';
import {
  generateStoryUrl,
  navigateToStory,
  resetStorybookState,
} from '../src/navigation.js';

describe('generateStoryUrl', () => {
  it('generates correct iframe URL', () => {
    let url = generateStoryUrl('http://localhost:6006', 'button--primary');
    assert.strictEqual(
      url,
      'http://localhost:6006/iframe.html?id=button--primary&viewMode=story'
    );
  });

  it('encodes special characters in story ID', () => {
    let url = generateStoryUrl('http://localhost:6006', 'button/with spaces');
    assert.strictEqual(
      url,
      'http://localhost:6006/iframe.html?id=button%2Fwith%20spaces&viewMode=story'
    );
  });
});

describe('navigateToStory', () => {
  it('does full page navigation on first visit', async () => {
    let gotoCalls = [];

    let tab = {
      _poolEntry: {},
      goto: mock.fn(async url => {
        gotoCalls.push(url);
      }),
    };

    await navigateToStory(tab, 'button--primary', 'http://localhost:6006');

    assert.strictEqual(gotoCalls.length, 1);
    assert.ok(gotoCalls[0].includes('button--primary'));
    assert.strictEqual(tab._poolEntry.storybookInitialized, true);
    assert.strictEqual(tab._poolEntry.currentStoryId, 'button--primary');
  });

  it('uses client-side navigation on subsequent visits', async () => {
    let gotoCalls = [];

    let tab = {
      _poolEntry: {
        storybookInitialized: true,
        currentStoryId: 'button--primary',
      },
      goto: mock.fn(async url => {
        gotoCalls.push(url);
      }),
      evaluate: mock.fn(async () => true),
      waitForFunction: mock.fn(async () => {}),
    };

    await navigateToStory(tab, 'button--secondary', 'http://localhost:6006');

    assert.strictEqual(gotoCalls.length, 0); // No full page navigation
    // Single evaluate call that handles navigation + waiting
    assert.strictEqual(tab.evaluate.mock.callCount(), 1);
    assert.strictEqual(tab._poolEntry.currentStoryId, 'button--secondary');
  });

  it('skips navigation if same story', async () => {
    let tab = {
      _poolEntry: {
        storybookInitialized: true,
        currentStoryId: 'button--primary',
      },
      goto: mock.fn(),
      evaluate: mock.fn(),
    };

    await navigateToStory(tab, 'button--primary', 'http://localhost:6006');

    assert.strictEqual(tab.goto.mock.callCount(), 0);
    assert.strictEqual(tab.evaluate.mock.callCount(), 0);
  });

  it('falls back to full navigation if client-side fails', async () => {
    let gotoCalls = [];

    let tab = {
      _poolEntry: {
        storybookInitialized: true,
        currentStoryId: 'button--primary',
      },
      goto: mock.fn(async url => {
        gotoCalls.push(url);
      }),
      evaluate: mock.fn(async () => {
        throw new Error('Storybook API not available');
      }),
    };

    await navigateToStory(tab, 'button--secondary', 'http://localhost:6006');

    assert.strictEqual(gotoCalls.length, 1);
    assert.ok(gotoCalls[0].includes('button--secondary'));
    assert.strictEqual(tab._poolEntry.currentStoryId, 'button--secondary');
  });

  it('falls back to domcontentloaded on timeout', async () => {
    let gotoCalls = [];
    let callCount = 0;

    let tab = {
      _poolEntry: {},
      goto: mock.fn(async (url, options) => {
        callCount++;
        gotoCalls.push({ url, waitUntil: options.waitUntil });
        if (callCount === 1 && options.waitUntil === 'networkidle2') {
          throw new Error('Navigation timeout exceeded');
        }
      }),
    };

    await navigateToStory(tab, 'button--primary', 'http://localhost:6006');

    assert.strictEqual(gotoCalls.length, 2);
    assert.strictEqual(gotoCalls[0].waitUntil, 'networkidle2');
    assert.strictEqual(gotoCalls[1].waitUntil, 'domcontentloaded');
  });

  it('propagates non-timeout errors', async () => {
    let tab = {
      _poolEntry: {},
      goto: mock.fn(async () => {
        throw new Error('Network error');
      }),
    };

    await assert.rejects(
      () => navigateToStory(tab, 'button--primary', 'http://localhost:6006'),
      { message: 'Network error' }
    );
  });

  it('handles tab without _poolEntry', async () => {
    let tab = {
      goto: mock.fn(async () => {}),
    };

    await navigateToStory(tab, 'button--primary', 'http://localhost:6006');

    assert.strictEqual(tab.goto.mock.callCount(), 1);
  });
});

describe('resetStorybookState', () => {
  it('clears storybookInitialized flag', () => {
    let entry = {
      storybookInitialized: true,
      currentStoryId: 'button--primary',
    };

    resetStorybookState(entry);

    assert.strictEqual(entry.storybookInitialized, false);
    assert.strictEqual(entry.currentStoryId, null);
  });

  it('handles null entry gracefully', () => {
    // Should not throw
    resetStorybookState(null);
    resetStorybookState(undefined);
  });
});
