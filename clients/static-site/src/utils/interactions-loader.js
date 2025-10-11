/**
 * Interactions file loader
 * Loads page-specific interactions and overrides from vizzly.static-site.js
 */

import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Discover interactions file in project directory
 * Looks for vizzly.static-site.js in current working directory
 * @param {string} baseDir - Base directory to search (defaults to cwd)
 * @returns {Promise<string|null>} Path to interactions file or null
 */
export async function discoverInteractionsFile(baseDir = process.cwd()) {
  let possibleNames = [
    'vizzly.static-site.js',
    'vizzly.static-site.mjs',
    '.vizzly.static-site.js',
  ];

  for (let name of possibleNames) {
    let filePath = join(baseDir, name);
    if (existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

/**
 * Load interactions from file
 * @param {string} filePath - Path to interactions file
 * @returns {Promise<Object>} Interactions and pages configuration
 */
export async function loadInteractionsFile(filePath) {
  try {
    // Dynamic import to support ES modules
    let module = await import(filePath);
    let config = module.default || module;

    // Validate structure
    if (typeof config !== 'object') {
      throw new Error('Interactions file must export an object');
    }

    return {
      interactions: config.interactions || {},
      pages: config.pages || {},
    };
  } catch (error) {
    throw new Error(`Failed to load interactions file: ${error.message}`);
  }
}

/**
 * Load interactions configuration if file exists
 * @param {string} baseDir - Base directory to search
 * @returns {Promise<Object|null>} Interactions config or null
 */
export async function loadInteractions(baseDir = process.cwd()) {
  let filePath = await discoverInteractionsFile(baseDir);

  if (!filePath) {
    return null;
  }

  return await loadInteractionsFile(filePath);
}
