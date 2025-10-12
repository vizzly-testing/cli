/**
 * @module file-helpers
 * @description Utilities for handling file-based screenshot inputs
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { VizzlyError } from '../errors/vizzly-error.js';

/**
 * Resolve image buffer from file path or return buffer as-is
 * Handles both Buffer inputs and file path strings, with proper validation and error handling
 *
 * @param {Buffer|string} imageBufferOrPath - Image data as Buffer or file path
 * @param {string} contextName - Context for error messages (e.g., 'screenshot', 'compare')
 * @returns {Buffer} The image buffer
 * @throws {VizzlyError} When file not found, unreadable, or invalid input type
 *
 * @example
 * // With Buffer
 * const buffer = resolveImageBuffer(myBuffer, 'screenshot');
 *
 * @example
 * // With file path
 * const buffer = resolveImageBuffer('./my-image.png', 'screenshot');
 */
export function resolveImageBuffer(imageBufferOrPath, contextName) {
  // Return Buffer as-is
  if (Buffer.isBuffer(imageBufferOrPath)) {
    return imageBufferOrPath;
  }

  // Validate input type
  if (typeof imageBufferOrPath !== 'string') {
    throw new VizzlyError(
      `Invalid image input: expected Buffer or file path string`,
      'INVALID_INPUT',
      { contextName, type: typeof imageBufferOrPath }
    );
  }

  // Resolve to absolute path for consistent behavior
  const filePath = resolve(imageBufferOrPath);

  // Check file exists
  if (!existsSync(filePath)) {
    throw new VizzlyError(
      `Screenshot file not found: ${imageBufferOrPath}`,
      'FILE_NOT_FOUND',
      { contextName, filePath, originalPath: imageBufferOrPath }
    );
  }

  // Read file with error handling
  try {
    return readFileSync(filePath);
  } catch (error) {
    throw new VizzlyError(
      `Failed to read screenshot file: ${imageBufferOrPath} - ${error.message}`,
      'FILE_READ_ERROR',
      {
        contextName,
        filePath,
        originalPath: imageBufferOrPath,
        originalError: error.message,
      }
    );
  }
}
