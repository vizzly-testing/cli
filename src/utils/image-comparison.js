import { compare } from 'odiff-bin';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { VizzlyError } from '../errors/vizzly-error.js';

/**
 * Compare two images and return the difference
 * @param {Buffer} imageBuffer1 - First image buffer
 * @param {Buffer} imageBuffer2 - Second image buffer
 * @param {Object} options - Comparison options
 * @param {number} options.threshold - Matching threshold (0-1)
 * @param {boolean} options.ignoreAntialiasing - Ignore antialiasing
 * @param {boolean} options.ignoreColors - Ignore colors (not supported by odiff)
 * @param {Array} options.ignoreRegions - Regions to ignore in comparison
 * @returns {Promise<Object>} Comparison result
 */
export async function compareImages(imageBuffer1, imageBuffer2, options = {}) {
  // Create temporary files for odiff
  const tempDir = os.tmpdir();
  const tempId = crypto.randomBytes(8).toString('hex');
  const basePath = path.join(tempDir, `vizzly-base-${tempId}.png`);
  const comparePath = path.join(tempDir, `vizzly-compare-${tempId}.png`);
  const diffPath = path.join(tempDir, `vizzly-diff-${tempId}.png`);

  try {
    // Write buffers to temporary files
    await fs.writeFile(basePath, imageBuffer1);
    await fs.writeFile(comparePath, imageBuffer2);

    // Configure odiff options
    const odiffOptions = {
      threshold: options.threshold || 0.1,
      antialiasing: options.ignoreAntialiasing !== false,
      outputDiffMask: true,
      failOnLayoutDiff: false,
      noFailOnFsErrors: false,
      diffColor: '#ff0000', // Red for differences
      captureDiffLines: true,
      reduceRamUsage: false,
      ignoreRegions: options.ignoreRegions || [],
    };

    // Run odiff comparison
    const result = await compare(basePath, comparePath, diffPath, odiffOptions);

    // Process results
    if (result.match) {
      return {
        misMatchPercentage: 0,
        diffPixels: 0,
        totalPixels: 0,
        dimensionDifference: { width: 0, height: 0 },
        diffBuffer: null,
      };
    }

    // Handle different failure reasons
    switch (result.reason) {
      case 'layout-diff': {
        return {
          misMatchPercentage: 100,
          dimensionDifference: {
            width: 'unknown',
            height: 'unknown',
          },
          error: 'Image dimensions do not match',
          diffBuffer: null,
        };
      }

      case 'pixel-diff': {
        // Read the diff image
        const diffBuffer = await fs.readFile(diffPath);

        return {
          misMatchPercentage: result.diffPercentage,
          diffPixels: result.diffCount,
          totalPixels: Math.round(
            result.diffCount / (result.diffPercentage / 100)
          ),
          dimensionDifference: { width: 0, height: 0 },
          diffBuffer,
          diffLines: result.diffLines,
        };
      }

      case 'file-not-exists':
        throw new VizzlyError(
          `Image file not found: ${result.file}`,
          'IMAGE_NOT_FOUND',
          { file: result.file }
        );

      default:
        throw new VizzlyError(
          'Unknown comparison result',
          'COMPARISON_UNKNOWN',
          { result }
        );
    }
  } catch (error) {
    // Re-throw VizzlyErrors
    if (error instanceof VizzlyError) {
      throw error;
    }

    throw new VizzlyError(
      'Failed to compare images',
      'IMAGE_COMPARISON_FAILED',
      { error: error.message }
    );
  } finally {
    // Clean up temporary files
    await Promise.all([
      fs.unlink(basePath).catch(() => {}),
      fs.unlink(comparePath).catch(() => {}),
      fs.unlink(diffPath).catch(() => {}),
    ]);
  }
}

/**
 * Check if buffer is a valid PNG image
 * @param {Buffer} buffer - Image buffer
 * @returns {boolean} True if valid PNG
 */
export function isValidPNG(buffer) {
  // Check PNG signature
  if (!buffer || buffer.length < 8) {
    return false;
  }

  // PNG signature: 137 80 78 71 13 10 26 10
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return buffer.subarray(0, 8).equals(pngSignature);
}

/**
 * Get image dimensions from PNG buffer
 * @param {Buffer} buffer - Image buffer
 * @returns {Object|null} Dimensions or null if invalid
 */
export function getImageDimensions(buffer) {
  if (!isValidPNG(buffer)) {
    return null;
  }

  try {
    // PNG dimensions are stored in the IHDR chunk
    // Skip PNG signature (8 bytes) + chunk length (4 bytes) + chunk type (4 bytes)
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    return { width, height };
  } catch {
    return null;
  }
}

/**
 * Compare images with ignore regions
 * @param {Buffer} imageBuffer1 - First image buffer
 * @param {Buffer} imageBuffer2 - Second image buffer
 * @param {Array<{x: number, y: number, width: number, height: number}>} ignoreRegions - Regions to ignore
 * @returns {Promise<Object>} Comparison result
 */
export async function compareImagesWithIgnoreRegions(
  imageBuffer1,
  imageBuffer2,
  ignoreRegions = []
) {
  // Convert ignore regions to odiff format
  const odiffIgnoreRegions = ignoreRegions.map(region => ({
    x1: region.x,
    y1: region.y,
    x2: region.x + region.width,
    y2: region.y + region.height,
  }));

  return compareImages(imageBuffer1, imageBuffer2, {
    ignoreRegions: odiffIgnoreRegions,
  });
}
