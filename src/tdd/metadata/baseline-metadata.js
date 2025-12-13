/**
 * Baseline Metadata I/O
 *
 * Functions for reading and writing baseline metadata.json files.
 * These handle the local storage of baseline information.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Load baseline metadata from disk
 *
 * @param {string} baselinePath - Path to baselines directory
 * @returns {Object|null} Baseline metadata or null if not found
 */
export function loadBaselineMetadata(baselinePath) {
  let metadataPath = join(baselinePath, 'metadata.json');

  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    let content = readFileSync(metadataPath, 'utf8');
    return JSON.parse(content);
  } catch {
    // Return null for parse errors - caller can handle
    return null;
  }
}

/**
 * Save baseline metadata to disk
 *
 * @param {string} baselinePath - Path to baselines directory
 * @param {Object} metadata - Metadata object to save
 */
export function saveBaselineMetadata(baselinePath, metadata) {
  // Ensure directory exists
  if (!existsSync(baselinePath)) {
    mkdirSync(baselinePath, { recursive: true });
  }

  let metadataPath = join(baselinePath, 'metadata.json');
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}

/**
 * Create empty baseline metadata structure
 *
 * @param {Object} options - Options for the baseline
 * @param {number} options.threshold - Comparison threshold
 * @param {string[]} options.signatureProperties - Custom signature properties
 * @returns {Object} Empty baseline metadata
 */
export function createEmptyBaselineMetadata(options = {}) {
  return {
    buildId: 'local-baseline',
    buildName: 'Local TDD Baseline',
    environment: 'test',
    branch: 'local',
    threshold: options.threshold ?? 2.0,
    signatureProperties: options.signatureProperties ?? [],
    createdAt: new Date().toISOString(),
    screenshots: [],
  };
}

/**
 * Update or add a screenshot entry in the metadata
 *
 * @param {Object} metadata - Baseline metadata object (mutated)
 * @param {Object} screenshotEntry - Screenshot entry to upsert
 * @param {string} signature - Signature to match for updates
 * @returns {Object} The updated metadata (same reference)
 */
export function upsertScreenshotInMetadata(
  metadata,
  screenshotEntry,
  signature
) {
  if (!metadata.screenshots) {
    metadata.screenshots = [];
  }

  let existingIndex = metadata.screenshots.findIndex(
    s => s.signature === signature
  );

  if (existingIndex >= 0) {
    metadata.screenshots[existingIndex] = screenshotEntry;
  } else {
    metadata.screenshots.push(screenshotEntry);
  }

  return metadata;
}

/**
 * Find a screenshot in metadata by signature
 *
 * @param {Object} metadata - Baseline metadata object
 * @param {string} signature - Signature to find
 * @returns {Object|null} Screenshot entry or null if not found
 */
export function findScreenshotBySignature(metadata, signature) {
  if (!metadata?.screenshots) {
    return null;
  }

  return metadata.screenshots.find(s => s.signature === signature) || null;
}
