/**
 * Configuration schema validation for Vizzly CLI
 * Uses Zod for runtime validation
 */

import { z } from 'zod';

/**
 * Server configuration schema
 */
const serverSchema = z.object({
  port: z.number().int().positive().default(47392),
  timeout: z.number().int().positive().default(30000),
});

/**
 * Build configuration schema
 */
const buildSchema = z.object({
  name: z.string().default('Build {timestamp}'),
  environment: z.string().default('test'),
  branch: z.string().optional(),
  commit: z.string().optional(),
  message: z.string().optional(),
});

/**
 * Upload configuration schema
 */
const uploadSchema = z.object({
  screenshotsDir: z
    .union([z.string(), z.array(z.string())])
    .default('./screenshots'),
  batchSize: z.number().int().positive().default(10),
  timeout: z.number().int().positive().default(30000),
});

/**
 * Comparison configuration schema
 * threshold: CIEDE2000 Delta E units (0.0 = exact, 1.0 = JND, 2.0 = recommended, 3.0+ = permissive)
 * minClusterSize: pixels (1 = exact)
 */
const comparisonSchema = z.object({
  threshold: z.number().min(0).default(2.0),
  minClusterSize: z.int().min(1).default(2),
});

/**
 * TDD configuration schema
 */
const tddSchema = z.object({
  openReport: z.boolean().default(false),
});

/**
 * Core Vizzly configuration schema
 * Allows plugin-specific keys with passthrough for extensibility
 */
export const vizzlyConfigSchema = z
  .object({
    // Core Vizzly config
    apiKey: z.string().optional(),
    apiUrl: z.string().url().optional(),
    server: serverSchema.default({ port: 47392, timeout: 30000 }),
    build: buildSchema.default({
      name: 'Build {timestamp}',
      environment: 'test',
    }),
    upload: uploadSchema.default({
      screenshotsDir: './screenshots',
      batchSize: 10,
      timeout: 30000,
    }),
    comparison: comparisonSchema.default({ threshold: 2.0, minClusterSize: 2 }),
    tdd: tddSchema.default({ openReport: false }),
    signatureProperties: z.array(z.string()).default([]),
    plugins: z.array(z.string()).default([]),

    // Additional optional fields
    parallelId: z.string().optional(),
    baselineBuildId: z.string().optional(),
    baselineComparisonId: z.string().optional(),
    eager: z.boolean().optional(),
    wait: z.boolean().optional(),
    allowNoToken: z.boolean().optional(),
  })
  .passthrough() // Allow plugin-specific keys like `staticSite`, `storybook`, etc.
  .default({
    server: { port: 47392, timeout: 30000 },
    build: { name: 'Build {timestamp}', environment: 'test' },
    upload: { screenshotsDir: './screenshots', batchSize: 10, timeout: 30000 },
    comparison: { threshold: 2.0, minClusterSize: 2 },
    tdd: { openReport: false },
    plugins: [],
  });

/**
 * Validate Vizzly configuration
 * @param {unknown} config - Configuration to validate
 * @returns {Object} Validated configuration
 * @throws {ZodError} If validation fails
 */
export function validateVizzlyConfig(config) {
  try {
    return vizzlyConfigSchema.parse(config);
  } catch (error) {
    // Re-throw with more context
    throw new Error(
      `Invalid Vizzly configuration: ${error.message}\n\n` +
        `Please check your vizzly.config.js file.\n` +
        `See https://vizzly.dev/docs/configuration for configuration options.`
    );
  }
}

/**
 * Safely validate with defaults if config is missing
 * @param {unknown} config - Configuration to validate (can be undefined)
 * @returns {Object} Validated configuration with defaults
 */
export function validateVizzlyConfigWithDefaults(config) {
  if (!config) {
    return vizzlyConfigSchema.parse({});
  }
  return validateVizzlyConfig(config);
}
