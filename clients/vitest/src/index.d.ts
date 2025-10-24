/**
 * TypeScript declarations for @vizzly-testing/vitest
 */

import type { Comparator } from 'vitest/node';

/**
 * Vizzly-specific options for screenshot comparison
 */
export interface VizzlyOptions {
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
 * Vizzly screenshot comparator function
 */
export function vizzlyComparator(
  reference: {
    data: TypedArray;
    metadata: { width: number; height: number };
  },
  actual: {
    data: TypedArray;
    metadata: { width: number; height: number };
  },
  options?: VizzlyOptions & { name?: string }
): Promise<{
  pass: boolean;
  diff: TypedArray | null;
  message: string | null;
}>;

/**
 * Vitest plugin for Vizzly integration
 */
export function vizzlyPlugin(options?: {
  threshold?: number;
  properties?: Record<string, any>;
  fullPage?: boolean;
}): {
  name: string;
  config(config: any): any;
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
 * Module augmentation to register Vizzly comparator with Vitest
 */
declare module 'vitest/node' {
  interface ToMatchScreenshotComparators {
    vizzly: Comparator<VizzlyOptions>;
  }
}
