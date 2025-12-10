/**
 * Vizzly Config Type Definitions
 * Configuration helpers
 * @module @vizzly-testing/cli/config
 */

export { VizzlyConfig } from './index';

/**
 * Define Vizzly configuration with type hints
 *
 * Use this in your vizzly.config.js for better IDE support:
 *
 * @example
 * import { defineConfig } from '@vizzly-testing/cli/config';
 *
 * export default defineConfig({
 *   apiKey: process.env.VIZZLY_TOKEN,
 *   server: {
 *     port: 47392
 *   },
 *   comparison: {
 *     threshold: 2.0,      // CIEDE2000 Delta E (0=exact, 1=JND, 2=recommended)
 *     minClusterSize: 2    // Filter single-pixel noise (1=exact, 2=default, 3+=permissive)
 *   }
 * });
 */
export function defineConfig(
  config: import('./index').VizzlyConfig
): import('./index').VizzlyConfig;
