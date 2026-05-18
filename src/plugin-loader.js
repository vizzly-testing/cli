import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
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
  let plugins = [];
  let loadedNames = new Set();

  // 1. Auto-discover plugins from @vizzly-testing/* packages
  let discoveredPlugins = await discoverInstalledPlugins();

  for (let pluginInfo of discoveredPlugins) {
    try {
      let plugin = await loadPlugin(pluginInfo.path);
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
    for (let pluginSpec of config.plugins) {
      try {
        let pluginPath = resolvePluginPath(pluginSpec, configPath);
        let plugin = await loadPlugin(pluginPath);

        if (plugin && !loadedNames.has(plugin.name)) {
          plugins.push(plugin);
          loadedNames.add(plugin.name);
        } else if (plugin && loadedNames.has(plugin.name)) {
          let existingPlugin = plugins.find(p => p.name === plugin.name);
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
export async function discoverInstalledPlugins() {
  let plugins = [];

  try {
    // Find all @vizzly-testing packages
    let packageJsonPaths = await glob(
      'node_modules/@vizzly-testing/*/package.json',
      {
        cwd: process.cwd(),
        absolute: true,
      }
    );

    for (let pkgPath of packageJsonPaths) {
      try {
        let packageJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));

        // Check if package has a plugin field
        // Support both new `vizzlyPlugin` and legacy `vizzly.plugin` for backwards compatibility
        let pluginField = getPluginField(packageJson);
        if (pluginField) {
          let packageDir = dirname(pkgPath);
          let pluginPath = resolvePackagePluginPath(
            packageJson.name,
            packageDir,
            pluginField
          );

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

function getPluginField(packageJson) {
  return packageJson.vizzlyPlugin || packageJson.vizzly?.plugin;
}

export function resolvePackagePluginPath(
  packageName,
  packageDir,
  pluginRelativePath
) {
  if (typeof pluginRelativePath !== 'string' || pluginRelativePath === '') {
    throw new Error(
      `Invalid plugin path in ${packageName}: path must be a non-empty string`
    );
  }

  if (isAbsolute(pluginRelativePath)) {
    throw new Error(
      `Invalid plugin path in ${packageName}: path must be relative`
    );
  }

  let pluginPath = resolve(packageDir, pluginRelativePath);
  let relativePath = relative(packageDir, pluginPath);

  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      `Invalid plugin path in ${packageName}: path cannot escape package directory`
    );
  }

  return pluginPath;
}

/**
 * Load a plugin from a file path
 * @param {string} pluginPath - Path to plugin file
 * @returns {Promise<Object|null>} Loaded plugin or null
 */
export async function loadPlugin(pluginPath) {
  try {
    // Convert to file URL for ESM import
    let pluginUrl = pathToFileURL(pluginPath).href;

    // Dynamic import
    let pluginModule = await import(pluginUrl);

    // Get the default export
    let plugin = pluginModule.default || pluginModule;

    // Validate plugin structure
    validatePluginStructure(plugin);

    return plugin;
  } catch (error) {
    let newError = new Error(
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
      let messages = error.issues.map(e => `${e.path.join('.')}: ${e.message}`);
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
export function resolvePluginPath(pluginSpec, configPath) {
  if (typeof pluginSpec !== 'string' || pluginSpec === '') {
    throw new Error('Plugin spec must be a non-empty string');
  }

  // If it's a package name (starts with @ or is alphanumeric), try to resolve from node_modules
  if (pluginSpec.startsWith('@') || /^[a-zA-Z0-9-]+$/.test(pluginSpec)) {
    // Try to resolve as a package
    try {
      let packageJsonPath = resolve(
        process.cwd(),
        'node_modules',
        pluginSpec,
        'package.json'
      );
      let packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

      // Support both new `vizzlyPlugin` and legacy `vizzly.plugin`
      let pluginField = getPluginField(packageJson);
      if (pluginField) {
        let packageDir = dirname(packageJsonPath);
        return resolvePackagePluginPath(
          packageJson.name || pluginSpec,
          packageDir,
          pluginField
        );
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
    let configDir = dirname(configPath);
    return resolve(configDir, pluginSpec);
  }

  // Resolve relative to cwd
  return resolve(process.cwd(), pluginSpec);
}
