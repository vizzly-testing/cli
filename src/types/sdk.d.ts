/**
 * Vizzly SDK Type Definitions
 * Full SDK for custom integrations
 * @module @vizzly-testing/cli/sdk
 */

import { EventEmitter } from 'node:events';

// Re-export common types
export {
  VizzlyConfig,
  ScreenshotOptions,
  UploadOptions,
  UploadResult,
  ComparisonResult,
  TddResults,
  BaselineData,
  Uploader,
  TddService,
  OutputUtils,
} from './index';

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
export class VizzlySDK extends EventEmitter {
  config: import('./index').VizzlyConfig;

  constructor(config: import('./index').VizzlyConfig, services: unknown);

  /**
   * Start the Vizzly server
   * @returns Server information including port and URL
   */
  start(): Promise<{ port: number; url: string }>;

  /**
   * Stop the Vizzly server
   */
  stop(): Promise<void>;

  /**
   * Get current configuration
   */
  getConfig(): import('./index').VizzlyConfig;

  /**
   * Capture a screenshot
   * @param name - Screenshot name
   * @param imageBuffer - Image data as a Buffer, or a file path to an image
   * @param options - Screenshot options
   * @throws VizzlyError when server is not running
   * @throws VizzlyError when file path is provided but file doesn't exist
   */
  screenshot(
    name: string,
    imageBuffer: Buffer | string,
    options?: import('./index').ScreenshotOptions
  ): Promise<void>;

  /**
   * Upload all captured screenshots
   * @param options - Upload options
   * @returns Upload result with build URL and stats
   */
  upload(
    options?: import('./index').UploadOptions
  ): Promise<import('./index').UploadResult>;

  /**
   * Run local comparison in TDD mode
   * @param name - Screenshot name
   * @param imageBuffer - Current image as a Buffer, or a file path to an image
   * @returns Comparison result
   */
  compare(
    name: string,
    imageBuffer: Buffer | string
  ): Promise<import('./index').ComparisonResult>;
}

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
  config?: import('./index').VizzlyConfig,
  options?: { verbose?: boolean }
): Promise<VizzlySDK>;

/** Load configuration from file and environment */
export function loadConfig(options?: {
  cwd?: string;
}): Promise<import('./index').VizzlyConfig>;

/** Output utilities */
export const output: import('./index').OutputUtils;

/** Create an uploader instance */
export function createUploader(
  config?: {
    apiKey?: string;
    apiUrl?: string;
    userAgent?: string;
    command?: string;
    upload?: import('./index').UploadConfig;
  },
  options?: {
    signal?: AbortSignal;
    batchSize?: number;
    timeout?: number;
  }
): import('./index').Uploader;

/** Create a TDD service instance */
export function createTDDService(
  config: import('./index').VizzlyConfig,
  options?: {
    workingDir?: string;
    setBaseline?: boolean;
    authService?: unknown;
  }
): import('./index').TddService;
