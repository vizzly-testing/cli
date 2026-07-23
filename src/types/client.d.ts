/**
 * Vizzly Client Type Definitions
 * Lightweight client for test runners
 * @module @vizzly-testing/cli/client
 */

export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LOG_LEVELS: Readonly<Record<ClientLogLevel, number>>;

/**
 * Check whether client SDK output should log at the requested level.
 */
export function shouldLogClient(
  level: string,
  configuredLevel?: string
): boolean;

/**
 * Auto-discover a local TDD server by searching for `.vizzly/server.json`.
 */
export function autoDiscoverTddServer(
  startDir?: string,
  deps?: {
    exists?: (path: string) => boolean;
    readFile?: (path: string, encoding: BufferEncoding) => string | Buffer;
    env?: Record<string, string | undefined>;
  }
): string | null;

/**
 * Result returned by a successful screenshot capture.
 */
export interface ScreenshotResult {
  success: boolean;
  status?:
    | 'passed'
    | 'failed'
    | 'new'
    | 'match'
    | 'diff'
    | 'baseline-updated'
    | 'error';
  name?: string;
  diffPercentage?: number;
  [key: string]: unknown;
}

/**
 * Take a screenshot for visual regression testing
 *
 * @param name - Unique name for the screenshot
 * @param imageBuffer - PNG image data as a Buffer, or a file path to an image
 * @param options - Optional configuration
 *
 * @example
 * // Basic usage with Buffer
 * import { vizzlyScreenshot } from '@vizzly-testing/cli/client';
 *
 * const screenshot = await page.screenshot();
 * await vizzlyScreenshot('homepage', screenshot);
 *
 * @example
 * // Basic usage with file path
 * await vizzlyScreenshot('homepage', './screenshots/homepage.png');
 *
 * @example
 * // With properties and comparison settings
 * await vizzlyScreenshot('checkout-form', screenshot, {
 *   properties: { browser: 'chrome', viewport: { width: 1920, height: 1080 } },
 *   threshold: 5,
 *   minClusterSize: 10,
 *   fullPage: true,
 *   requestTimeout: 5000
 * });
 *
 * `properties` is the user metadata bag. Comparison options are normalized
 * into the server metadata payload, while `requestTimeout` stays on the
 * client request and `buildId` only routes the screenshot to a build.
 */
export function vizzlyScreenshot(
  name: string,
  imageBuffer: Buffer | string,
  options?: {
    properties?: Record<string, unknown>;
    threshold?: number;
    minClusterSize?: number;
    fullPage?: boolean;
    /** Coordinate frame used by the harness that captured the image. */
    captureMode?: 'viewport' | 'full_page' | 'element' | 'component';
    /** Bitmap pixels per CSS pixel reported by the capture harness. */
    deviceScaleFactor?: number;
    /** Exact selector used when captureMode is element or component. */
    selector?: string;
    /** Transport-only build ID used to route the request. */
    buildId?: string;
    /** Client-side HTTP timeout in milliseconds; not stored as metadata. */
    requestTimeout?: number;
  }
): Promise<ScreenshotResult | null>;

/**
 * Flush result summary returned by vizzlyFlush
 */
export interface FlushResult {
  success: boolean;
  uploaded?: number;
  flushed?: boolean;
  total?: number;
  passed?: number;
  failed?: number;
  new?: number;
  errors?: number;
  message?: string;
  summary?: {
    total: number;
    passed: number;
    failed: number;
    new: number;
    errors: number;
  };
}

/**
 * Signal test completion and trigger the results summary.
 * Call this in your test framework's global teardown to see a summary of all visual comparisons.
 *
 * @returns The flush result with summary, or null if no server is connected
 *
 * @example
 * // In Playwright global teardown
 * import { vizzlyFlush } from '@vizzly-testing/cli/client';
 * export default async () => await vizzlyFlush();
 *
 * @example
 * // In Jest/Vitest
 * afterAll(async () => {
 *   await vizzlyFlush();
 * });
 */
export function vizzlyFlush(): Promise<FlushResult | null>;

/**
 * Check if the Vizzly client is initialized and ready
 *
 * @returns True if client is ready, false otherwise
 */
export function isVizzlyReady(): boolean;

/**
 * Configure the client with custom settings
 *
 * @param config - Configuration options
 */
export function configure(config?: {
  serverUrl?: string;
  enabled?: boolean;
  failOnDiff?: boolean;
}): void;

/**
 * Enable or disable screenshot capture
 *
 * @param enabled - Whether to enable screenshots
 */
export function setEnabled(enabled: boolean): void;

/**
 * Get information about Vizzly client state
 *
 * @returns Client information
 */
export function getVizzlyInfo(): {
  enabled: boolean;
  serverUrl: string | null;
  ready: boolean;
  buildId: string | null;
  tddMode: boolean;
  disabled: boolean;
  failOnDiff: boolean;
};
