import { glob } from 'glob';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { pathToFileURL } from 'url';

/**
 * Load and register plugins from node_modules and config
 * @param {string|null} configPath - Path to config file
 * @param {Object} config - Loaded configuration
 * @param {Object} logger - Logger instance
 * @returns {Promise<Array>} Array of loaded plugins
 */
export async function loadPlugins(configPath, config, logger) {
  let plugins = [];
  let loadedNames = new Set();

  // 1. Auto-discover plugins from @vizzly-testing/* packages
  let discoveredPlugins = await discoverInstalledPlugins(logger);

  for (let pluginInfo of discoveredPlugins) {
    try {
      let plugin = await loadPlugin(pluginInfo.path, logger);
      if (plugin && !loadedNames.has(plugin.name)) {
        plugins.push(plugin);
        loadedNames.add(plugin.name);
        logger.debug(
          `Loaded plugin: ${plugin.name}@${plugin.version || 'unknown'}`
        );
      }
    } catch (error) {
      logger.warn(
        `Failed to load auto-discovered plugin from ${pluginInfo.packageName}: ${error.message}`
      );
    }
  }

  // 2. Load explicit plugins from config
  if (config?.plugins && Array.isArray(config.plugins)) {
    for (let pluginSpec of config.plugins) {
      try {
        let pluginPath = resolvePluginPath(pluginSpec, configPath);
        let plugin = await loadPlugin(pluginPath, logger);

        if (plugin && !loadedNames.has(plugin.name)) {
          plugins.push(plugin);
          loadedNames.add(plugin.name);
          logger.debug(
            `Loaded plugin from config: ${plugin.name}@${plugin.version || 'unknown'}`
          );
        } else if (plugin && loadedNames.has(plugin.name)) {
          let existingPlugin = plugins.find(p => p.name === plugin.name);
          logger.warn(
            `Plugin ${plugin.name} already loaded (v${existingPlugin.version || 'unknown'}), ` +
              `skipping v${plugin.version || 'unknown'} from config`
          );
        }
      } catch (error) {
        logger.warn(
          `Failed to load plugin from config (${pluginSpec}): ${error.message}`
        );
      }
    }
  }

  return plugins;
}

/**
 * Discover installed plugins from node_modules/@vizzly-testing/*
 * @param {Object} logger - Logger instance
 * @returns {Promise<Array>} Array of plugin info objects
 */
async function discoverInstalledPlugins(logger) {
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
        if (packageJson.vizzly?.plugin) {
          let pluginRelativePath = packageJson.vizzly.plugin;

          // Security: Ensure plugin path is relative and doesn't traverse up
          if (
            pluginRelativePath.startsWith('/') ||
            pluginRelativePath.includes('..')
          ) {
            logger.warn(
              `Invalid plugin path in ${packageJson.name}: path must be relative and cannot traverse directories`
            );
            continue;
          }

          // Resolve plugin path relative to package directory
          let packageDir = dirname(pkgPath);
          let pluginPath = resolve(packageDir, pluginRelativePath);

          // Additional security: Ensure resolved path is still within package directory
          if (!pluginPath.startsWith(packageDir)) {
            logger.warn(
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
        logger.warn(
          `Failed to parse package.json at ${pkgPath}: ${error.message}`
        );
      }
    }
  } catch (error) {
    logger.debug(`Failed to discover plugins: ${error.message}`);
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
 * Validate plugin has required structure
 * @param {Object} plugin - Plugin object
 * @throws {Error} If plugin structure is invalid
 */
function validatePluginStructure(plugin) {
  if (!plugin || typeof plugin !== 'object') {
    throw new Error('Plugin must export an object');
  }

  if (!plugin.name || typeof plugin.name !== 'string') {
    throw new Error('Plugin must have a name (string)');
  }

  if (!plugin.register || typeof plugin.register !== 'function') {
    throw new Error('Plugin must have a register function');
  }

  if (plugin.version && typeof plugin.version !== 'string') {
    throw new Error('Plugin version must be a string');
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
      let packageJsonPath = resolve(
        process.cwd(),
        'node_modules',
        pluginSpec,
        'package.json'
      );
      let packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

      if (packageJson.vizzly?.plugin) {
        let packageDir = dirname(packageJsonPath);
        return resolve(packageDir, packageJson.vizzly.plugin);
      }

      throw new Error('Package does not specify a vizzly.plugin field');
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
  } else {
    // Resolve relative to cwd
    return resolve(process.cwd(), pluginSpec);
  }
}
