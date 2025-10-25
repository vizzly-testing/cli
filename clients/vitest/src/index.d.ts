/**
 * TypeScript declarations for @vizzly-testing/vitest
 */

/**
 * Vizzly-specific options for screenshot comparison
 */
export interface VizzlyScreenshotOptions {
  /**
   * Custom metadata properties for multi-variant testing
   * @example { theme: 'dark', viewport: '1920x1080' }
   */
  properties?: Record<string, any>;

  /**
   * Comparison threshold (0-100)
   * @default 0
   */
  threshold?: number;

  /**
   * Whether this is a full page screenshot
   */
  fullPage?: boolean;
}

/**
 * Vitest plugin for Vizzly integration
 * Extends expect API with custom toMatchScreenshot matcher
 */
export function vizzlyPlugin(options?: Record<string, any>): {
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
  serverUrl?: string;
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
  }
}
