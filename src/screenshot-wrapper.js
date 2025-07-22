/**
 * Simple factory for creating Vizzly instances with shared configuration
 * Users handle their own screenshots, just pass the buffer to Vizzly
 */

import { createVizzly as createVizzlySDK } from './vizzly.js';

/**
 * Create a factory that pre-configures Vizzly instances
 *
 * @param {Object} config - Shared configuration
 * @param {Object} [config.defaultProperties] - Default metadata for all screenshots
 * @param {number} [config.defaultThreshold] - Default comparison threshold
 *
 * @example
 * // test-setup.js - Configure once
 * export const createVizzly = vizzlyFactory({
 *   defaultProperties: {
 *     framework: 'playwright',
 *     project: 'web-app'
 *   }
 * });
 *
 * // my-test.spec.js - Use everywhere
 * const vizzly = createVizzly();
 *
 * const screenshot = await page.screenshot({ fullPage: true }); // Your method
 * await vizzly.screenshot({
 *   name: 'homepage',
 *   image: screenshot, // Your buffer
 *   properties: { browser: 'chrome' } // Merges with defaults
 * });
 */
export function vizzlyFactory(globalConfig) {
  const {
    defaultProperties = {},
    defaultThreshold,
    ...vizzlyConfig
  } = globalConfig;

  return function createVizzly(overrideConfig = {}) {
    const vizzly = createVizzlySDK({
      ...vizzlyConfig,
      ...overrideConfig,
    });

    return {
      ...vizzly,

      /**
       * Take a screenshot with default properties merged in
       *
       * @param {Object} screenshot - Screenshot object
       * @param {string} screenshot.name - Screenshot name
       * @param {Buffer} screenshot.image - Image buffer from YOUR screenshot method
       * @param {Object} [screenshot.properties] - Additional metadata (merged with defaults)
       * @param {number} [screenshot.threshold] - Comparison threshold (defaults to global)
       */
      async screenshot(screenshot) {
        return await vizzly.screenshot({
          ...screenshot,
          properties: {
            ...defaultProperties,
            ...screenshot.properties,
          },
          threshold: screenshot.threshold || defaultThreshold,
        });
      },
    };
  };
}
