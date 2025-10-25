/**
 * Vizzly Plugin for Vitest Browser Mode
 *
 * This plugin completely replaces Vitest's native visual testing by extending
 * the expect API with a custom toMatchScreenshot matcher. Users write standard
 * Vitest tests, and Vizzly handles comparison, storage, and team collaboration.
 *
 * IMPORTANT: This plugin fully replaces Vitest's system:
 * - Extends expect API via setup file injected into browser context
 * - Disables Vitest's native screenshot system (screenshotFailures: false)
 * - Makes direct HTTP calls from browser to Vizzly server
 * - TDD Mode: Local comparison with instant feedback dashboard
 * - Cloud Mode: Upload to Vizzly cloud, tests always pass
 *
 * @module @vizzly-testing/vitest
 *
 * @example
 * // vitest.config.js
 * import { defineConfig } from 'vitest/config'
 * import { vizzlyPlugin } from '@vizzly-testing/vitest'
 *
 * export default defineConfig({
 *   plugins: [vizzlyPlugin()],
 *   test: {
 *     browser: {
 *       enabled: true,
 *       name: 'chromium',
 *       provider: 'playwright'
 *     }
 *   }
 * })
 *
 * @example
 * // test file - use Vitest's standard API!
 * import { expect, test } from 'vitest'
 * import { page } from 'vitest/browser'
 *
 * test('homepage looks correct', async () => {
 *   await page.goto('/')
 *   await expect(page).toMatchScreenshot('hero.png', {
 *     properties: {
 *       theme: 'dark',
 *       viewport: '1920x1080'
 *     },
 *     threshold: 5
 *   })
 * })
 */

import { getVizzlyInfo } from '@vizzly-testing/cli/client';
import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';

export function vizzlyPlugin(options = {}) {
  return {
    name: 'vitest-vizzly',
    config(config, { mode }) {
      // Add setup file to extend expect with our custom matcher
      let setupFiles = config?.test?.setupFiles || [];
      if (!Array.isArray(setupFiles)) {
        setupFiles = [setupFiles];
      }

      // Auto-detect Vizzly server (TDD mode or cloud mode)
      // Search for .vizzly/server.json from process.cwd() up to root
      let serverUrl = process.env.VIZZLY_SERVER_URL || '';
      let buildId = process.env.VIZZLY_BUILD_ID || '';

      if (!serverUrl) {
        // Search for .vizzly/server.json in current working directory and parent directories
        let currentDir = process.cwd();
        while (currentDir !== '/') {
          let serverJsonPath = join(currentDir, '.vizzly', 'server.json');
          if (existsSync(serverJsonPath)) {
            try {
              let serverConfig = JSON.parse(readFileSync(serverJsonPath, 'utf-8'));
              serverUrl = `http://localhost:${serverConfig.port}`;
              break;
            } catch (e) {
              // Ignore malformed server.json
            }
          }
          let parentDir = resolve(currentDir, '..');
          if (parentDir === currentDir) break;
          currentDir = parentDir;
        }
      }

      return {
        test: {
          setupFiles: [
            ...setupFiles,
            resolve(import.meta.dirname || __dirname, 'setup.js'),
          ],
          browser: {
            // Disable Vitest's native screenshot testing
            // Our custom matcher completely replaces it
            screenshotFailures: false,
          },
        },
        // Pass Vizzly environment variables to browser context via define
        define: {
          __VIZZLY_SERVER_URL__: JSON.stringify(serverUrl),
          __VIZZLY_BUILD_ID__: JSON.stringify(buildId),
        },
      };
    },
  };
}

/**
 * Helper to get Vizzly status in tests
 *
 * @returns {Object} Vizzly client information
 * @property {boolean} enabled - Whether Vizzly is enabled
 * @property {boolean} ready - Whether client is ready
 * @property {boolean} tddMode - Whether in TDD mode
 * @property {string} serverUrl - Server URL if available
 *
 * @example
 * import { getVizzlyStatus } from '@vizzly-testing/vitest'
 *
 * test('my test', () => {
 *   const status = getVizzlyStatus()
 *   if (status.ready) {
 *     // Vizzly is available
 *   }
 * })
 */
export function getVizzlyStatus() {
  return getVizzlyInfo();
}

// Re-export client utilities for advanced usage
export { getVizzlyInfo } from '@vizzly-testing/cli/client';
