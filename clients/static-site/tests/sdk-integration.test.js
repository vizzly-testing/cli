/**
 * E2E Integration Tests for Static-Site SDK
 *
 * Uses the shared test-site (FluffyCloud) to verify the full screenshot
 * capture flow: page discovery → browser launch → screenshot capture → TDD server.
 *
 * Run with: VIZZLY_E2E=1 npm test -- e2e.test.js
 *
 * Requires:
 * - TDD server running: `vizzly tdd start`
 * - test-site available at ../../../test-site
 */

import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { closeBrowser, launchBrowser } from '../src/browser.js';
import { discoverPages } from '../src/crawler.js';
import { createTabPool } from '../src/pool.js';
import { captureScreenshot } from '../src/screenshot.js';
import { startStaticServer, stopStaticServer } from '../src/server.js';
import { generateTasks, processAllTasks } from '../src/tasks.js';

// Paths
let testDir = join(tmpdir(), `vizzly-static-site-e2e-${Date.now()}`);
let testSitePath = resolve(import.meta.dirname, '../../../test-site');

// Skip E2E tests unless explicitly enabled
let runE2E = process.env.VIZZLY_E2E === '1';

// Check if running under `vizzly tdd run` or `vizzly run`
let externalServer = !!process.env.VIZZLY_SERVER_URL;

describe('Static-Site E2E with shared test-site', { skip: !runE2E }, () => {
  let tddServer = null;
  let serverInfo = null;
  let browser = null;
  let pool = null;

  // Mock logger for tests
  let logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };

  before(async () => {
    // Verify test-site exists
    assert.ok(
      existsSync(join(testSitePath, 'index.html')),
      'test-site/index.html should exist'
    );

    // Start TDD server only if not running under vizzly wrapper
    if (!externalServer) {
      // Create temp directory
      mkdirSync(testDir, { recursive: true });

      tddServer = spawn('npx', ['vizzly', 'tdd', 'start'], {
        cwd: testDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, VIZZLY_HOME: testDir },
      });

      // Wait for TDD server to start
      await new Promise((resolve, reject) => {
        let timeout = setTimeout(
          () => reject(new Error('TDD server timeout')),
          15000
        );

        tddServer.stdout.on('data', data => {
          if (
            data.toString().includes('TDD server started') ||
            data.toString().includes('localhost:47392')
          ) {
            clearTimeout(timeout);
            resolve();
          }
        });

        tddServer.on('error', err => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }

    // Start static server for test-site
    serverInfo = await startStaticServer(testSitePath);

    // Launch browser
    browser = await launchBrowser({ headless: true });
  });

  after(async () => {
    if (pool) await pool.drain();
    if (browser) await closeBrowser(browser);
    if (serverInfo) await stopStaticServer(serverInfo);

    if (tddServer && !externalServer) {
      tddServer.kill('SIGTERM');
      await new Promise(resolve => {
        tddServer.on('exit', resolve);
        setTimeout(resolve, 2000);
      });
    }

    if (!externalServer) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // ===========================================================================
  // Page Discovery Tests
  // ===========================================================================

  describe('Page Discovery', () => {
    it('discovers all pages from test-site', async () => {
      // Note: page.path is URL-like (/contact, /features) not file-like (contact.html)
      let config = {
        buildPath: testSitePath,
        include: null, // No filtering - discover all
        exclude: ['/playwright-report**'], // Exclude build artifacts
        pageDiscovery: {
          useSitemap: false,
          scanHtml: true,
          sitemapPath: 'sitemap.xml',
        },
      };

      let pages = await discoverPages(testSitePath, config);

      assert.ok(pages.length >= 4, `Should find at least 4 pages, found ${pages.length}`);

      let pagePaths = pages.map(p => p.path);
      assert.ok(
        pagePaths.includes('/') || pagePaths.some(p => p.includes('index')),
        'Should find index page'
      );
      assert.ok(
        pagePaths.some(p => p.includes('features')),
        'Should find features page'
      );
      assert.ok(
        pagePaths.some(p => p.includes('pricing')),
        'Should find pricing page'
      );
      assert.ok(
        pagePaths.some(p => p.includes('contact')),
        'Should find contact page'
      );
    });

    it('filters pages with include patterns', async () => {
      // page.path uses URL format: /, /features, /pricing, /contact
      let config = {
        buildPath: testSitePath,
        include: ['/', '/features'],
        exclude: null,
        pageDiscovery: {
          useSitemap: false,
          scanHtml: true,
          sitemapPath: 'sitemap.xml',
        },
      };

      let pages = await discoverPages(testSitePath, config);
      assert.strictEqual(pages.length, 2, `Should find exactly 2 pages, found ${pages.length}: ${pages.map(p => p.path).join(', ')}`);
    });

    it('excludes pages with exclude patterns', async () => {
      // page.path uses URL format: /, /features, /pricing, /contact
      let config = {
        buildPath: testSitePath,
        include: null,
        exclude: ['/pricing', '/contact', '/playwright-report**'],
        pageDiscovery: {
          useSitemap: false,
          scanHtml: true,
          sitemapPath: 'sitemap.xml',
        },
      };

      let pages = await discoverPages(testSitePath, config);
      let pagePaths = pages.map(p => p.path);

      assert.ok(
        !pagePaths.some(p => p.includes('pricing')),
        'Should exclude pricing page'
      );
      assert.ok(
        !pagePaths.some(p => p.includes('contact')),
        'Should exclude contact page'
      );
      assert.ok(pages.length >= 2, `Should have at least 2 pages (/ and /features), found ${pages.length}`);
    });
  });

  // ===========================================================================
  // Screenshot Capture Tests
  // ===========================================================================

  describe('Screenshot Capture', () => {
    it('captures homepage screenshot', async () => {
      let page = await browser.newPage();

      try {
        await page.goto(`${serverInfo.url}/index.html`, {
          waitUntil: 'networkidle0',
        });

        let result = await captureScreenshot(
          page,
          'e2e-homepage',
          { width: 1920, height: 1080, name: 'desktop' },
          {
            threshold: 0,
            fullPage: true,
            properties: { page: 'homepage', test: 'e2e' },
          }
        );

        assert.ok(result, 'Screenshot should succeed');
      } finally {
        await page.close();
      }
    });

    it('captures element screenshot with selector', async () => {
      let page = await browser.newPage();

      try {
        await page.goto(`${serverInfo.url}/index.html`, {
          waitUntil: 'networkidle0',
        });

        let result = await captureScreenshot(
          page,
          'e2e-nav',
          { width: 1920, height: 1080, name: 'desktop' },
          {
            selector: 'nav',
            properties: { component: 'navigation' },
          }
        );

        assert.ok(result, 'Element screenshot should succeed');
      } finally {
        await page.close();
      }
    });

    it('captures screenshots with custom threshold', async () => {
      let page = await browser.newPage();

      try {
        await page.goto(`${serverInfo.url}/index.html`, {
          waitUntil: 'networkidle0',
        });

        let result = await captureScreenshot(
          page,
          'e2e-threshold',
          { width: 1920, height: 1080, name: 'desktop' },
          {
            threshold: 5,
            properties: { test: 'threshold' },
          }
        );

        assert.ok(result, 'Screenshot with threshold should succeed');
      } finally {
        await page.close();
      }
    });
  });

  // ===========================================================================
  // Task Generation Tests
  // ===========================================================================

  describe('Task Generation', () => {
    it('generates tasks for pages and viewports', () => {
      let pages = [
        { path: '/index.html', source: 'html' },
        { path: '/features.html', source: 'html' },
      ];

      let config = {
        viewports: [
          { name: 'desktop', width: 1920, height: 1080 },
          { name: 'mobile', width: 375, height: 812 },
        ],
        threshold: 0,
      };

      let tasks = generateTasks(pages, serverInfo.url, config);

      assert.strictEqual(tasks.length, 4, 'Should generate 4 tasks (2 pages × 2 viewports)');

      // Verify task structure
      let firstTask = tasks[0];
      assert.ok(firstTask.url, 'Task should have URL');
      assert.ok(firstTask.viewport, 'Task should have viewport');
      assert.ok(firstTask.page, 'Task should have page');
      assert.ok(firstTask.page.path, 'Task page should have path');
    });
  });

  // ===========================================================================
  // Tab Pool Tests
  // ===========================================================================

  describe('Tab Pool Processing', () => {
    it('processes multiple pages through tab pool', async () => {
      pool = createTabPool(browser, 2);

      let pages = [
        { path: '/', source: 'html' },
        { path: '/features', source: 'html' },
        { path: '/pricing', source: 'html' },
      ];

      let config = {
        viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
        threshold: 0,
        fullPage: true,
        hooks: [],
      };

      let tasks = generateTasks(pages, serverInfo.url, config);
      let errors = await processAllTasks(tasks, pool, config, logger);

      assert.strictEqual(errors.length, 0, 'All tasks should succeed');
    });
  });

  // ===========================================================================
  // Multi-Page Tests
  // ===========================================================================

  describe('Multi-Page Screenshots', () => {
    it('captures all test-site pages', async () => {
      let pages = ['index.html', 'features.html', 'pricing.html', 'contact.html'];
      let results = [];

      for (let pageName of pages) {
        let page = await browser.newPage();

        try {
          await page.goto(`${serverInfo.url}/${pageName}`, {
            waitUntil: 'networkidle0',
          });

          let result = await captureScreenshot(
            page,
            `e2e-${pageName.replace('.html', '')}`,
            { width: 1920, height: 1080, name: 'desktop' },
            {
              fullPage: true,
              properties: { page: pageName },
            }
          );

          results.push({ page: pageName, success: !!result });
        } finally {
          await page.close();
        }
      }

      let allSucceeded = results.every(r => r.success);
      assert.ok(allSucceeded, 'All page screenshots should succeed');
    });

    it('captures pages with multiple viewports', async () => {
      let viewports = [
        { name: 'desktop', width: 1920, height: 1080 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'mobile', width: 375, height: 812 },
      ];

      let results = [];

      for (let viewport of viewports) {
        let page = await browser.newPage();

        try {
          await page.setViewport(viewport);
          await page.goto(`${serverInfo.url}/index.html`, {
            waitUntil: 'networkidle0',
          });

          let result = await captureScreenshot(
            page,
            `e2e-homepage-${viewport.name}`,
            viewport,
            {
              fullPage: true,
              properties: { viewport: viewport.name },
            }
          );

          results.push({ viewport: viewport.name, success: !!result });
        } finally {
          await page.close();
        }
      }

      let allSucceeded = results.every(r => r.success);
      assert.ok(allSucceeded, 'All viewport screenshots should succeed');
    });
  });
});

// ===========================================================================
// Unit tests that don't require TDD server
// ===========================================================================

describe('Static-Site SDK (unit tests)', () => {
  it('discovers pages from test-site directory', async () => {
    let config = {
      buildPath: testSitePath,
      include: null, // No filtering
      exclude: ['/playwright-report**'],
      pageDiscovery: {
        useSitemap: false,
        scanHtml: true,
        sitemapPath: 'sitemap.xml',
      },
    };

    let pages = await discoverPages(testSitePath, config);
    assert.ok(pages.length > 0, `Should discover pages, found ${pages.length}`);
  });

  it('generates correct task structure', () => {
    let pages = [{ path: '/about', filePath: 'about.html', source: 'html' }];
    let config = {
      viewports: [{ name: 'desktop', width: 1920, height: 1080 }],
      threshold: 0,
    };

    let tasks = generateTasks(pages, 'http://localhost:3000', config);

    assert.strictEqual(tasks.length, 1);
    assert.ok(tasks[0].page.path.includes('about'), 'Task page path should include page name');
    assert.strictEqual(tasks[0].viewport.name, 'desktop', 'Task should have viewport');
    assert.ok(tasks[0].url.includes('about'), 'Task URL should include page path');
  });

  it('handles include patterns correctly', async () => {
    // page.path uses URL format: /
    let config = {
      buildPath: testSitePath,
      include: ['/'],
      exclude: null,
      pageDiscovery: {
        useSitemap: false,
        scanHtml: true,
        sitemapPath: 'sitemap.xml',
      },
    };

    let pages = await discoverPages(testSitePath, config);
    assert.strictEqual(pages.length, 1, `Should find only index page, found ${pages.length}: ${pages.map(p => p.path).join(', ')}`);
    assert.strictEqual(pages[0].path, '/');
  });
});
