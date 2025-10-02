/**
 * Security utilities for path sanitization and validation
 * Protects against path traversal attacks and ensures safe file operations
 */

import { resolve, normalize, isAbsolute, join } from 'path';
import { createServiceLogger } from './logger-factory.js';

const logger = createServiceLogger('SECURITY');

/**
 * Sanitizes a screenshot name to prevent path traversal and ensure safe file naming
 * @param {string} name - Original screenshot name
 * @param {number} maxLength - Maximum allowed length (default: 255)
 * @param {boolean} allowSlashes - Whether to allow forward slashes (for browser version strings)
 * @returns {string} Sanitized screenshot name
 */
export function sanitizeScreenshotName(
  name,
  maxLength = 255,
  allowSlashes = false
) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Screenshot name must be a non-empty string');
  }

  if (name.length > maxLength) {
    throw new Error(
      `Screenshot name exceeds maximum length of ${maxLength} characters`
    );
  }

  // Block directory traversal patterns
  if (name.includes('..') || name.includes('\\')) {
    throw new Error('Screenshot name contains invalid path characters');
  }

  // Block forward slashes unless explicitly allowed (e.g., for browser version strings)
  if (!allowSlashes && name.includes('/')) {
    throw new Error('Screenshot name contains invalid path characters');
  }

  // Block absolute paths
  if (isAbsolute(name)) {
    throw new Error('Screenshot name cannot be an absolute path');
  }

  // Allow only safe characters: alphanumeric, hyphens, underscores, dots, and optionally slashes
  // Replace other characters with underscores
  let allowedChars = allowSlashes ? /[^a-zA-Z0-9._/-]/g : /[^a-zA-Z0-9._-]/g;
  let sanitized = name.replace(allowedChars, '_');

  // Prevent names that start with dots (hidden files)
  if (sanitized.startsWith('.')) {
    sanitized = 'file_' + sanitized;
  }

  // Ensure we have a valid filename
  if (sanitized.length === 0 || sanitized === '.' || sanitized === '..') {
    sanitized = 'unnamed_screenshot';
  }

  return sanitized;
}

/**
 * Validates that a path stays within the allowed working directory bounds
 * @param {string} targetPath - Path to validate
 * @param {string} workingDir - Working directory that serves as the security boundary
 * @returns {string} Resolved and normalized path if valid
 * @throws {Error} If path is invalid or outside bounds
 */
export function validatePathSecurity(targetPath, workingDir) {
  if (typeof targetPath !== 'string' || targetPath.length === 0) {
    throw new Error('Path must be a non-empty string');
  }

  if (typeof workingDir !== 'string' || workingDir.length === 0) {
    throw new Error('Working directory must be a non-empty string');
  }

  // Normalize and resolve both paths
  let resolvedWorkingDir = resolve(normalize(workingDir));
  let resolvedTargetPath = resolve(normalize(targetPath));

  // Ensure the target path starts with the working directory
  if (!resolvedTargetPath.startsWith(resolvedWorkingDir)) {
    logger.warn(
      `Path traversal attempt blocked: ${targetPath} (resolved: ${resolvedTargetPath}) is outside working directory: ${resolvedWorkingDir}`
    );
    throw new Error('Path is outside the allowed working directory');
  }

  return resolvedTargetPath;
}

/**
 * Safely constructs a path within the working directory
 * @param {string} workingDir - Base working directory
 * @param {...string} pathSegments - Path segments to join
 * @returns {string} Safely constructed path
 * @throws {Error} If resulting path would be outside working directory
 */
export function safePath(workingDir, ...pathSegments) {
  if (pathSegments.length === 0) {
    return validatePathSecurity(workingDir, workingDir);
  }

  // Sanitize each path segment
  let sanitizedSegments = pathSegments.map(segment => {
    if (typeof segment !== 'string') {
      throw new Error('Path segment must be a string');
    }

    // Block directory traversal in segments
    if (segment.includes('..')) {
      throw new Error('Path segment contains directory traversal sequence');
    }

    return segment;
  });

  let targetPath = join(workingDir, ...sanitizedSegments);
  return validatePathSecurity(targetPath, workingDir);
}

/**
 * Validates screenshot properties object for safe values
 * @param {Object} properties - Properties to validate
 * @returns {Object} Validated properties object
 */
export function validateScreenshotProperties(properties = {}) {
  if (properties === null || typeof properties !== 'object') {
    return {};
  }

  let validated = {};

  // Validate common properties with safe constraints
  if (properties.browser && typeof properties.browser === 'string') {
    try {
      // Extract browser name without version (e.g., "Chrome/139.0.7258.138" -> "Chrome")
      let browserName = properties.browser.split('/')[0];
      validated.browser = sanitizeScreenshotName(browserName, 50);
    } catch (error) {
      // Skip invalid browser names, don't include them
      logger.warn(
        `Invalid browser name '${properties.browser}': ${error.message}`
      );
    }
  }

  if (properties.viewport && typeof properties.viewport === 'object') {
    let viewport = {};
    if (
      typeof properties.viewport.width === 'number' &&
      properties.viewport.width > 0 &&
      properties.viewport.width <= 10000
    ) {
      viewport.width = Math.floor(properties.viewport.width);
    }
    if (
      typeof properties.viewport.height === 'number' &&
      properties.viewport.height > 0 &&
      properties.viewport.height <= 10000
    ) {
      viewport.height = Math.floor(properties.viewport.height);
    }
    if (Object.keys(viewport).length > 0) {
      validated.viewport = viewport;
    }
  }

  // Allow other safe string properties but sanitize them
  for (let [key, value] of Object.entries(properties)) {
    if (key === 'browser' || key === 'viewport') continue; // Already handled

    if (
      typeof key === 'string' &&
      key.length <= 50 &&
      /^[a-zA-Z0-9_-]+$/.test(key)
    ) {
      if (typeof value === 'string' && value.length <= 200) {
        // Store sanitized version of string values
        validated[key] = value.replace(/[<>&"']/g, ''); // Basic HTML entity prevention
      } else if (
        typeof value === 'number' &&
        !isNaN(value) &&
        isFinite(value)
      ) {
        validated[key] = value;
      } else if (typeof value === 'boolean') {
        validated[key] = value;
      }
    }
  }

  return validated;
}
