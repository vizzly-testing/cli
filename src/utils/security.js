/**
 * Security utilities for path sanitization and validation
 * Protects against path traversal attacks and ensures safe file operations
 */

import { isAbsolute, join, normalize, resolve } from 'node:path';
import * as output from './output.js';

/**
 * Sanitizes a screenshot name to prevent path traversal and ensure safe file naming
 * @param {string} name - Original screenshot name
 * @param {number} maxLength - Maximum allowed length (default: 255)
 * @param {boolean} allowSlashes - Whether to allow forward slashes (for browser version strings)
 * @returns {string} Sanitized screenshot name
 */
/**
 * Validate screenshot name for security (no transformations, just validation)
 * Throws if name contains path traversal or other dangerous patterns
 *
 * @param {string} name - Screenshot name to validate
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} The original name (unchanged) if valid
 * @throws {Error} If name contains dangerous patterns
 */
export function validateScreenshotName(name, maxLength = 255) {
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

  // Block forward slashes (path separators)
  if (name.includes('/')) {
    throw new Error('Screenshot name cannot contain forward slashes');
  }

  // Block absolute paths
  if (isAbsolute(name)) {
    throw new Error('Screenshot name cannot be an absolute path');
  }

  // Return the original name unchanged - validation only!
  return name;
}

/**
 * Validate screenshot name for security (allows spaces, preserves original name)
 *
 * This function only validates for security - it does NOT transform spaces.
 * Spaces are preserved so that:
 * 1. generateScreenshotSignature() uses the original name with spaces (matches cloud)
 * 2. generateBaselineFilename() handles space→hyphen conversion (matches cloud)
 *
 * Flow: "VBtn dark" → sanitize → "VBtn dark" → signature: "VBtn dark|1265||" → filename: "VBtn-dark_hash.png"
 *
 * @param {string} name - Screenshot name to validate
 * @param {number} maxLength - Maximum allowed length (default: 255)
 * @param {boolean} allowSlashes - Whether to allow forward slashes (for browser version strings)
 * @returns {string} The validated name (unchanged if valid, spaces preserved)
 * @throws {Error} If name contains dangerous patterns
 *
 * @example
 * sanitizeScreenshotName("VBtn dark") // Returns "VBtn dark" (spaces preserved)
 * sanitizeScreenshotName("My/Component") // Throws error (contains /)
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

  // Allow only safe characters: alphanumeric, hyphens, underscores, dots, spaces, and optionally slashes
  // Spaces are allowed here and will be converted to hyphens in generateBaselineFilename() to match cloud behavior
  // Replace other characters with underscores
  const allowedChars = allowSlashes
    ? /[^a-zA-Z0-9._ /-]/g
    : /[^a-zA-Z0-9._ -]/g;
  let sanitized = name.replace(allowedChars, '_');

  // Prevent names that start with dots (hidden files)
  if (sanitized.startsWith('.')) {
    sanitized = `file_${sanitized}`;
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
  const resolvedWorkingDir = resolve(normalize(workingDir));
  const resolvedTargetPath = resolve(normalize(targetPath));

  // Ensure the target path starts with the working directory
  if (!resolvedTargetPath.startsWith(resolvedWorkingDir)) {
    output.warn(
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
  const sanitizedSegments = pathSegments.map(segment => {
    if (typeof segment !== 'string') {
      throw new Error('Path segment must be a string');
    }

    // Block directory traversal in segments
    if (segment.includes('..')) {
      throw new Error('Path segment contains directory traversal sequence');
    }

    return segment;
  });

  const targetPath = join(workingDir, ...sanitizedSegments);
  return validatePathSecurity(targetPath, workingDir);
}

/**
 * Validate user metadata without interpreting names as Vizzly options or
 * rewriting values. Rendering code must escape strings for its output context.
 * Reject unsafe object keys and values that cannot be represented as JSON.
 *
 * @param {Object} [properties={}] - User screenshot metadata.
 * @returns {Object} A copy preserving the supplied JSON values.
 * @throws {Error} Metadata contains unsafe keys, cycles, or non-JSON values.
 */
export function validateScreenshotProperties(properties = {}) {
  if (
    !properties ||
    typeof properties !== 'object' ||
    Array.isArray(properties)
  ) {
    return {};
  }

  let ancestors = new Set();
  function copy(value) {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || ancestors.has(value)) {
      throw new Error('Screenshot properties must contain JSON values');
    }
    ancestors.add(value);
    let result;
    if (Array.isArray(value)) {
      result = value.map(copy);
    } else {
      let entries = Object.entries(value);
      if (
        entries.some(([key]) =>
          ['__proto__', 'constructor', 'prototype'].includes(key)
        )
      ) {
        throw new Error('Screenshot properties contain an unsafe key');
      }
      result = Object.fromEntries(
        entries.map(([key, item]) => [key, copy(item)])
      );
    }
    ancestors.delete(value);
    return result;
  }

  return copy(properties);
}
