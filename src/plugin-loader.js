import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { glob } from 'glob';
import { z } from 'zod';
import * as output from './utils/output.js';

/**
 * Load and register plugins from node_modules and config
 * @param {string|null} configPath - Path to config file
 * @param {Object} config - Loaded configuration
 * @returns {Promise<Array>} Array of loaded plugins
 */
export async function loadPlugins(configPath, config) {
  const plugins = [];
  const loadedNames = new Set();

  // 1. Auto-discover plugins from @vizzly-testing/* packages
  const discoveredPlugins = await discoverInstalledPlugins();

  for (const pluginInfo of discoveredPlugins) {
    try {
      const plugin = await loadPlugin(pluginInfo.path);
      if (plugin && !loadedNames.has(plugin.name)) {
        plugins.push(plugin);
        loadedNames.add(plugin.name);
        output.debug(
          `Loaded plugin: ${plugin.name}@${plugin.version || 'unknown'}`
        );
      }
    } catch (error) {
      output.warn(
        `Failed to load auto-discovered plugin from ${pluginInfo.packageName}: ${error.message}`
      );
    }
  }

  // 2. Load explicit plugins from config
  if (config?.plugins && Array.isArray(config.plugins)) {
    for (const pluginSpec of config.plugins) {
      try {
        const pluginPath = resolvePluginPath(pluginSpec, configPath);
        const plugin = await loadPlugin(pluginPath);

        if (plugin && !loadedNames.has(plugin.name)) {
          plugins.push(plugin);
          loadedNames.add(plugin.name);
        } else if (plugin && loadedNames.has(plugin.name)) {
          const existingPlugin = plugins.find(p => p.name === plugin.name);
          output.warn(
            `Plugin ${plugin.name} already loaded (v${existingPlugin.version || 'unknown'}), ` +
              `skipping v${plugin.version || 'unknown'} from config`
          );
        }
      } catch (error) {
        output.warn(
          `Failed to load plugin from config (${pluginSpec}): ${error.message}`
        );
      }
    }
  }

  return plugins;
}

/**
 * Discover installed plugins from node_modules/@vizzly-testing/*
 * @returns {Promise<Array>} Array of plugin info objects
 */
async function discoverInstalledPlugins() {
  const plugins = [];

  try {
    // Find all @vizzly-testing packages
    const packageJsonPaths = await glob(
      'node_modules/@vizzly-testing/*/package.json',
      {
        cwd: process.cwd(),
        absolute: true,
      }
    );

    for (const pkgPath of packageJsonPaths) {
      try {
        const packageJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));

        // Check if package has a plugin field
        // Support both new `vizzlyPlugin` and legacy `vizzly.plugin` for backwards compatibility
        const pluginField =
          packageJson.vizzlyPlugin || packageJson.vizzly?.plugin;
        if (pluginField) {
          const pluginRelativePath = pluginField;

          // Security: Ensure plugin path is relative and doesn't traverse up
          if (
            pluginRelativePath.startsWith('/') ||
            pluginRelativePath.includes('..')
          ) {
            output.warn(
              `Invalid plugin path in ${packageJson.name}: path must be relative and cannot traverse directories`
            );
            continue;
          }

          // Resolve plugin path relative to package directory
          const packageDir = dirname(pkgPath);
          const pluginPath = resolve(packageDir, pluginRelativePath);

          // Additional security: Ensure resolved path is still within package directory
          if (!pluginPath.startsWith(packageDir)) {
            output.warn(
              `Plugin path escapes package directory: ${packageJson.name}`
            );
            continue;
          }

          plugins.push({
            packageName: packageJson.name,
            path: pluginPath,
          });
        }
      } catch (error) {
        output.warn(
          `Failed to parse package.json at ${pkgPath}: ${error.message}`
        );
      }
    }
  } catch {
    // Plugin discovery is optional
  }

  return plugins;
}

/**
 * Load a plugin from a file path
 * @param {string} pluginPath - Path to plugin file
 * @returns {Promise<Object|null>} Loaded plugin or null
 */
async function loadPlugin(pluginPath) {
  try {
    // Convert to file URL for ESM import
    const pluginUrl = pathToFileURL(pluginPath).href;

    // Dynamic import
    const pluginModule = await import(pluginUrl);

    // Get the default export
    const plugin = pluginModule.default || pluginModule;

    // Validate plugin structure
    validatePluginStructure(plugin);

    return plugin;
  } catch (error) {
    const newError = new Error(
      `Failed to load plugin from ${pluginPath}: ${error.message}`
    );
    newError.cause = error;
    throw newError;
  }
}

/**
 * Zod schema for validating plugin structure
 * Note: Using passthrough() to allow configSchema without validating its structure
 * to avoid Zod version conflicts when plugins have nested config objects
 */
const pluginSchema = z
  .object({
    name: z.string().min(1, 'Plugin name is required'),
    version: z.string().optional(),
    register: z.custom(val => typeof val === 'function', {
      message: 'register must be a function',
    }),
  })
  .passthrough();

/**
 * Validate plugin has required structure
 * @param {Object} plugin - Plugin object
 * @throws {Error} If plugin structure is invalid
 */
function validatePluginStructure(plugin) {
  try {
    // Validate basic plugin structure
    pluginSchema.parse(plugin);

    // Skip deep validation of configSchema to avoid Zod version conflicts
    // configSchema is optional and primarily for documentation
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map(
        e => `${e.path.join('.')}: ${e.message}`
      );
      throw new Error(`Invalid plugin structure: ${messages.join(', ')}`);
    }
    throw error;
  }
}

/**
 * Resolve plugin path from config
 * @param {string} pluginSpec - Plugin specifier (package name or path)
 * @param {string|null} configPath - Path to config file
 * @returns {string} Resolved plugin path
 */
function resolvePluginPath(pluginSpec, configPath) {
  // If it's a package name (starts with @ or is alphanumeric), try to resolve from node_modules
  if (pluginSpec.startsWith('@') || /^[a-zA-Z0-9-]+$/.test(pluginSpec)) {
    // Try to resolve as a package
    try {
      const packageJsonPath = resolve(
        process.cwd(),
        'node_modules',
        pluginSpec,
        'package.json'
      );
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

      // Support both new `vizzlyPlugin` and legacy `vizzly.plugin`
      const pluginField =
        packageJson.vizzlyPlugin || packageJson.vizzly?.plugin;
      if (pluginField) {
        const packageDir = dirname(packageJsonPath);
        return resolve(packageDir, pluginField);
      }

      throw new Error(
        'Package does not specify a vizzlyPlugin or vizzly.plugin field'
      );
    } catch (error) {
      throw new Error(
        `Cannot resolve plugin package ${pluginSpec}: ${error.message}`
      );
    }
  }

  // Otherwise treat as a file path
  if (configPath) {
    // Resolve relative to config file
    const configDir = dirname(configPath);
    return resolve(configDir, pluginSpec);
  } else {
    // Resolve relative to cwd
    return resolve(process.cwd(), pluginSpec);
  }
}
