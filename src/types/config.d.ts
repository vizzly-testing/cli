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
 *     threshold: 0.1
 *   }
 * });
 */
export function defineConfig(config: import('./index').VizzlyConfig): import('./index').VizzlyConfig;
