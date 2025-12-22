/**
 * Configuration schema validation for Static Site plugin
 * Uses Zod for runtime validation
 */

import { cpus } from 'node:os';
import { z } from 'zod';

/**
 * Cache CPU count at module load time
 * Avoids repeated system calls
 */
let cachedCpuCount = cpus().length;

/**
 * Calculate smart default concurrency based on CPU cores
 * Uses half the cores (min 2, max 8) to balance speed vs resource usage
 * @returns {number} Default concurrency value
 */
export function getDefaultConcurrency() {
  return Math.max(2, Math.min(8, Math.floor(cachedCpuCount / 2)));
}

/**
 * Viewport schema
 */
let viewportSchema = z.object({
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

/**
 * Browser configuration schema
 */
let browserSchema = z.object({
  headless: z.boolean().default(true),
  args: z.array(z.string()).default([]),
});

/**
 * Screenshot configuration schema
 */
let screenshotSchema = z.object({
  fullPage: z.boolean().default(false),
  omitBackground: z.boolean().default(false),
});

/**
 * Page discovery configuration schema
 */
let pageDiscoverySchema = z.object({
  useSitemap: z.boolean().default(true),
  sitemapPath: z.string().default('sitemap.xml'),
  scanHtml: z.boolean().default(true),
});

/**
 * Interactions schema (optional in main config)
 * Note: Full interaction functions should be defined in vizzly.static-site.js
 * Main config can reference interaction names only
 */
let interactionsSchema = z.record(z.string(), z.any()).optional();

/**
 * Page-specific configuration schema
 * Allows overriding global settings for specific pages
 */
let pageConfigSchema = z
  .object({
    viewports: z
      .union([
        z.array(viewportSchema),
        z.array(z.string()), // Viewport names to filter from global viewports
      ])
      .optional(),
    screenshot: screenshotSchema.partial().optional(),
    interaction: z.string().optional(), // Named interaction to run
  })
  .passthrough(); // Allow additional page-specific settings

/**
 * Complete Static Site plugin configuration schema
 */
export let staticSiteConfigSchema = z
  .object({
    buildPath: z.string().optional(),
    viewports: z
      .array(viewportSchema)
      .default([{ name: 'default', width: 1920, height: 1080 }]),
    browser: browserSchema.default({
      headless: true,
      args: [],
    }),
    screenshot: screenshotSchema.default({
      fullPage: false,
      omitBackground: false,
    }),
    concurrency: z.number().int().positive().default(getDefaultConcurrency()),
    include: z.string().nullable().optional(),
    exclude: z.string().nullable().optional(),
    pageDiscovery: pageDiscoverySchema.default({
      useSitemap: true,
      sitemapPath: 'sitemap.xml',
      scanHtml: true,
    }),
    interactions: interactionsSchema,
    pages: z.record(z.string(), pageConfigSchema).optional(), // Page-specific overrides
  })
  .default({
    viewports: [{ name: 'default', width: 1920, height: 1080 }],
    browser: { headless: true, args: [] },
    screenshot: { fullPage: false, omitBackground: false },
    concurrency: getDefaultConcurrency(),
    pageDiscovery: {
      useSitemap: true,
      sitemapPath: 'sitemap.xml',
      scanHtml: true,
    },
  });

/**
 * Validate static site configuration
 * @param {unknown} config - Configuration to validate
 * @returns {Object} Validated configuration
 * @throws {ZodError} If validation fails
 */
export function validateStaticSiteConfig(config) {
  try {
    return staticSiteConfigSchema.parse(config);
  } catch (error) {
    // Re-throw with more context
    throw new Error(
      `Invalid staticSite configuration: ${error.message}\n\n` +
        `Please check your vizzly.config.js file.\n` +
        `See https://vizzly.dev/docs/plugins/static-site for configuration options.`
    );
  }
}

/**
 * Safely validate with defaults if config is missing
 * @param {unknown} config - Configuration to validate (can be undefined)
 * @returns {Object} Validated configuration with defaults
 */
export function validateStaticSiteConfigWithDefaults(config) {
  if (!config) {
    return staticSiteConfigSchema.parse({});
  }
  return validateStaticSiteConfig(config);
}
