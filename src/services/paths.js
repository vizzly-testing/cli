import { join, normalize, resolve } from 'node:path';
import * as output from './output.js';

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
