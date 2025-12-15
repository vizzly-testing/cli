/**
 * Vizzly Client Type Definitions
 * Lightweight client for test runners
 * @module @vizzly-testing/cli/client
 */

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
 *   properties: { browser: 'chrome', viewport: '1920x1080' },
 *   threshold: 5,
 *   minClusterSize: 10
 * });
 */
export function vizzlyScreenshot(
  name: string,
  imageBuffer: Buffer | string,
  options?: {
    properties?: Record<string, unknown>;
    threshold?: number;
    minClusterSize?: number;
    fullPage?: boolean;
  }
): Promise<void>;

/**
 * Flush result summary returned by vizzlyFlush
 */
export interface FlushResult {
  success: boolean;
  summary: {
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
};
