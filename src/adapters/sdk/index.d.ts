/**
 * Vizzly SDK Type Definitions
 * Full SDK for custom integrations
 * @module @vizzly-testing/cli/sdk
 */

// Re-export common types
/**
 * VizzlySDK class - Full SDK for custom integrations
 *
 * @example
 * import { createVizzly } from '@vizzly-testing/cli/sdk';
 *
 * const vizzly = await createVizzly({
 *   apiKey: process.env.VIZZLY_TOKEN,
 *   server: { port: 3003 }
 * });
 *
 * await vizzly.start();
 * await vizzly.screenshot('test', buffer);
 * await vizzly.upload();
 * await vizzly.stop();
 */
export {
  BaselineData,
  ComparisonResult,
  OutputUtils,
  ScreenshotOptions,
  TddResults,
  TddService,
  Uploader,
  UploadOptions,
  UploadResult,
  VizzlyConfig,
  VizzlySDK,
} from '../../index';

/**
 * Create a new Vizzly SDK instance
 *
 * @param config - Configuration options
 * @param options - Additional options
 * @returns Configured Vizzly SDK instance
 *
 * @example
 * const vizzly = await createVizzly({
 *   apiKey: process.env.VIZZLY_TOKEN,
 *   apiUrl: 'https://app.vizzly.dev',
 *   server: { port: 3003 }
 * });
 */
export function createVizzly(
  config?: import('../../index').VizzlyConfig,
  options?: { verbose?: boolean }
): Promise<import('../../index').VizzlySDK>;

/** Load configuration from file and environment */
export function loadConfig(options?: {
  cwd?: string;
}): Promise<import('../../index').VizzlyConfig>;

/** Output utilities */
export const output: import('../../index').OutputUtils;

/** Create an uploader instance */
export function createUploader(
  config?: {
    apiKey?: string;
    apiUrl?: string;
    userAgent?: string;
    command?: string;
    upload?: import('../../index').UploadConfig;
  },
  options?: {
    signal?: AbortSignal;
    batchSize?: number;
    timeout?: number;
  }
): import('../../index').Uploader;

/** Create a TDD service instance */
export function createTDDService(
  config: import('../../index').VizzlyConfig,
  options?: {
    workingDir?: string;
    setBaseline?: boolean;
    authService?: unknown;
  }
): import('../../index').TddService;
