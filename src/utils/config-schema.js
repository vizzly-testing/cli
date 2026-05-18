/**
 * Configuration schema validation for Vizzly CLI
 * Uses Zod for runtime validation
 */

import { z } from 'zod';
import { CONFIG_DEFAULTS } from '../config/core.js';

/**
 * Server configuration schema
 */
const serverSchema = z.object({
  port: z.number().int().positive().default(CONFIG_DEFAULTS.server.port),
  timeout: z.number().int().positive().default(CONFIG_DEFAULTS.server.timeout),
});

/**
 * Build configuration schema
 */
const buildSchema = z.object({
  name: z.string().default(CONFIG_DEFAULTS.build.name),
  environment: z.string().default(CONFIG_DEFAULTS.build.environment),
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
    .default(CONFIG_DEFAULTS.upload.screenshotsDir),
  batchSize: z
    .number()
    .int()
    .positive()
    .default(CONFIG_DEFAULTS.upload.batchSize),
  timeout: z.number().int().positive().default(CONFIG_DEFAULTS.upload.timeout),
});

/**
 * Comparison configuration schema
 * threshold: CIEDE2000 Delta E units (0.0 = exact, 1.0 = JND, 2.0 = recommended, 3.0+ = permissive)
 * minClusterSize: pixels (1 = exact)
 */
const comparisonSchema = z.object({
  threshold: z.number().min(0).default(CONFIG_DEFAULTS.comparison.threshold),
  minClusterSize: z
    .int()
    .min(1)
    .default(CONFIG_DEFAULTS.comparison.minClusterSize),
});

/**
 * TDD configuration schema
 */
const tddSchema = z.object({
  openReport: z.boolean().default(CONFIG_DEFAULTS.tdd.openReport),
});

/**
 * Core Vizzly configuration schema
 * Allows plugin-specific keys with passthrough for extensibility
 */
export const vizzlyConfigSchema = z
  .object({
    // Core Vizzly config
    apiKey: z.string().optional(),
    apiUrl: z.string().url().default(CONFIG_DEFAULTS.apiUrl),
    server: serverSchema.default(CONFIG_DEFAULTS.server),
    build: buildSchema.default(CONFIG_DEFAULTS.build),
    upload: uploadSchema.default(CONFIG_DEFAULTS.upload),
    comparison: comparisonSchema.default(CONFIG_DEFAULTS.comparison),
    tdd: tddSchema.default(CONFIG_DEFAULTS.tdd),
    signatureProperties: z.array(z.string()).default([]),
    plugins: z.array(z.string()).default(CONFIG_DEFAULTS.plugins),

    // Additional optional fields
    parallelId: z.string().optional(),
    baselineBuildId: z.string().optional(),
    baselineComparisonId: z.string().optional(),
    eager: z.boolean().optional(),
    wait: z.boolean().optional(),
    allowNoToken: z.boolean().optional(),
  })
  .passthrough() // Allow plugin-specific keys like `staticSite`, `storybook`, etc.
  .default(CONFIG_DEFAULTS);

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
