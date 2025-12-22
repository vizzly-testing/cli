/**
 * Tests for dry-run mode
 * Verifies that --dry-run prints discovered pages without capturing screenshots
 */

import assert from 'node:assert';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, before, after, mock } from 'node:test';
import { run } from '../src/index.js';

describe('dry-run mode', () => {
  let testDir;
  let logMessages;
  let mockLogger;

  before(async () => {
    // Create temp directory with test files
    testDir = join(tmpdir(), `vizzly-dry-run-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create test HTML files
    await writeFile(
      join(testDir, 'index.html'),
      '<html><body>Home</body></html>'
    );
    await writeFile(
      join(testDir, 'about.html'),
      '<html><body>About</body></html>'
    );

    // Create nested page
    await mkdir(join(testDir, 'blog'), { recursive: true });
    await writeFile(
      join(testDir, 'blog', 'post-1.html'),
      '<html><body>Blog Post</body></html>'
    );
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('prints discovered pages without launching browser', async () => {
    logMessages = [];
    mockLogger = {
      info: msg => logMessages.push({ level: 'info', msg }),
      warn: msg => logMessages.push({ level: 'warn', msg }),
      error: msg => logMessages.push({ level: 'error', msg }),
      debug: () => {},
    };

    await run(testDir, { dryRun: true }, { logger: mockLogger });

    // Should have logged found pages
    let foundMessage = logMessages.find(m => m.msg.includes('Dry run:'));
    assert.ok(foundMessage, 'Should log dry run header');
    assert.ok(foundMessage.msg.includes('3 pages'), 'Should find 3 pages');

    // Should show HTML scan source
    let htmlScanMessage = logMessages.find(m =>
      m.msg.includes('From HTML scan')
    );
    assert.ok(htmlScanMessage, 'Should show HTML scan source');

    // Should show individual paths
    let aboutPath = logMessages.find(m => m.msg.includes('/about'));
    assert.ok(aboutPath, 'Should list /about page');

    let blogPath = logMessages.find(m => m.msg.includes('/blog/post-1'));
    assert.ok(blogPath, 'Should list /blog/post-1 page');

    // Should show task count summary
    let taskMessage = logMessages.find(m => m.msg.includes('Would capture'));
    assert.ok(taskMessage, 'Should show screenshot count');
  });

  it('shows viewport information', async () => {
    logMessages = [];
    mockLogger = {
      info: msg => logMessages.push({ level: 'info', msg }),
      warn: msg => logMessages.push({ level: 'warn', msg }),
      error: msg => logMessages.push({ level: 'error', msg }),
      debug: () => {},
    };

    await run(testDir, { dryRun: true }, { logger: mockLogger });

    // Should show viewport details
    let viewportMessage = logMessages.find(m => m.msg.includes('Viewports:'));
    assert.ok(viewportMessage, 'Should show viewport information');
  });

  it('shows concurrency setting', async () => {
    logMessages = [];
    mockLogger = {
      info: msg => logMessages.push({ level: 'info', msg }),
      warn: msg => logMessages.push({ level: 'warn', msg }),
      error: msg => logMessages.push({ level: 'error', msg }),
      debug: () => {},
    };

    await run(testDir, { dryRun: true }, { logger: mockLogger });

    // Should show concurrency
    let concurrencyMessage = logMessages.find(m =>
      m.msg.includes('Concurrency:')
    );
    assert.ok(concurrencyMessage, 'Should show concurrency setting');
    assert.ok(concurrencyMessage.msg.includes('tabs'), 'Should mention tabs');
  });

  it('respects include pattern', async () => {
    logMessages = [];
    mockLogger = {
      info: msg => logMessages.push({ level: 'info', msg }),
      warn: msg => logMessages.push({ level: 'warn', msg }),
      error: msg => logMessages.push({ level: 'error', msg }),
      debug: () => {},
    };

    await run(
      testDir,
      { dryRun: true, include: '/blog/*' },
      { logger: mockLogger }
    );

    // Should only find 1 page (blog post)
    let foundMessage = logMessages.find(m => m.msg.includes('Dry run:'));
    assert.ok(
      foundMessage.msg.includes('1 pages'),
      'Should find 1 page matching pattern'
    );
  });

  it('respects exclude pattern', async () => {
    logMessages = [];
    mockLogger = {
      info: msg => logMessages.push({ level: 'info', msg }),
      warn: msg => logMessages.push({ level: 'warn', msg }),
      error: msg => logMessages.push({ level: 'error', msg }),
      debug: () => {},
    };

    await run(
      testDir,
      { dryRun: true, exclude: '/blog/*' },
      { logger: mockLogger }
    );

    // Should find 2 pages (home and about, excluding blog)
    let foundMessage = logMessages.find(m => m.msg.includes('Dry run:'));
    assert.ok(
      foundMessage.msg.includes('2 pages'),
      'Should find 2 pages after exclusion'
    );
  });

  it('warns when no pages found', async () => {
    let emptyDir = join(tmpdir(), `vizzly-empty-test-${Date.now()}`);
    await mkdir(emptyDir, { recursive: true });

    logMessages = [];
    mockLogger = {
      info: msg => logMessages.push({ level: 'info', msg }),
      warn: msg => logMessages.push({ level: 'warn', msg }),
      error: msg => logMessages.push({ level: 'error', msg }),
      debug: () => {},
    };

    try {
      await run(emptyDir, { dryRun: true }, { logger: mockLogger });

      let warnMessage = logMessages.find(
        m => m.level === 'warn' && m.msg.includes('No pages found')
      );
      assert.ok(warnMessage, 'Should warn when no pages found');
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});
