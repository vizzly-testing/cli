/**
 * TypeScript declarations for @vizzly-testing/vitest
 */

/**
 * Vizzly-specific options for screenshot comparison
 */
export interface VizzlyScreenshotOptions {
  /**
   * Forwarded to Vitest/Playwright screenshot capture.
   */
  animations?: 'disabled' | 'allow';
  caret?: 'hide' | 'initial';
  mask?: readonly unknown[];
  maskColor?: string;
  omitBackground?: boolean;
  scale?: 'css' | 'device';
  timeout?: number;

  /**
   * Custom metadata properties for multi-variant testing.
   * Vizzly automatically adds browser, url, and viewport metadata;
   * reserved runtime fields stay pinned to the browser session, while
   * explicit viewport fields can override the detected viewport signature.
   * @example { theme: 'dark' }
   */
  properties?: Record<string, unknown>;

  /**
   * Visual comparison sensitivity threshold used by Vizzly's diff engine.
   * When omitted, the Vizzly server configuration is used.
   */
  threshold?: number;

  /**
   * Minimum connected-pixel cluster size to count as a difference
   */
  minClusterSize?: number;

  /**
   * Whether this is a full page screenshot.
   * Only applies when the screenshot target is the page; element targets ignore it.
   */
  fullPage?: boolean;

  /**
   * Fail this assertion when Vizzly reports a visual diff.
   * When omitted, the Vizzly server or environment setting is used.
   */
  failOnDiff?: boolean;
}

/**
 * Vitest plugin for Vizzly integration
 * Extends expect API with custom toMatchScreenshot matcher
 */
export function vizzlyPlugin(): {
  name: string;
  config(config: any, context: { mode: string }): any;
};

/**
 * Get Vizzly status
 */
export function getVizzlyStatus(): {
  enabled: boolean;
  ready: boolean;
  tddMode: boolean;
  serverUrl: string | null;
  buildId: string | null;
  disabled: boolean;
  failOnDiff: boolean;
};

/**
 * Re-export Vizzly client utilities
 */
export { getVizzlyInfo } from '@vizzly-testing/cli/client';

/**
 * Module augmentation to extend Vitest's expect with Vizzly options
 */
declare module 'vitest' {
  interface Assertion {
    toMatchScreenshot(
      name?: string,
      options?: VizzlyScreenshotOptions
    ): Promise<void>;
    toMatchScreenshot(options?: VizzlyScreenshotOptions): Promise<void>;
  }
}
