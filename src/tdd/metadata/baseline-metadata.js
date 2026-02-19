/**
 * Baseline Metadata I/O
 *
 * Functions for reading and writing baseline metadata in state storage.
 */

import { basename, dirname, resolve } from 'node:path';
import { createStateStore } from '../state-store.js';

function resolveWorkingDirFromBaselinePath(baselinePath) {
  let resolvedPath = resolve(baselinePath);
  let parent = dirname(resolvedPath);

  if (
    basename(resolvedPath) === 'baselines' &&
    basename(parent) === '.vizzly'
  ) {
    return dirname(parent);
  }

  return resolvedPath;
}

function withStateStore(workingDir, operation) {
  let store = createStateStore({ workingDir });

  try {
    return operation(store);
  } finally {
    store.close();
  }
}

/**
 * Load baseline metadata from state storage
 *
 * @param {string} baselinePath - Path to baselines directory
 * @returns {Object|null} Baseline metadata or null if not found
 */
export function loadBaselineMetadata(baselinePath) {
  let workingDir = resolveWorkingDirFromBaselinePath(baselinePath);

  return withStateStore(workingDir, store => {
    try {
      return store.getBaselineMetadata();
    } catch (error) {
      console.debug?.(`Failed to read baseline metadata: ${error.message}`);
      return null;
    }
  });
}

/**
 * Save baseline metadata to state storage
 *
 * @param {string} baselinePath - Path to baselines directory
 * @param {Object} metadata - Metadata object to save
 */
export function saveBaselineMetadata(baselinePath, metadata) {
  let workingDir = resolveWorkingDirFromBaselinePath(baselinePath);

  withStateStore(workingDir, store => {
    store.setBaselineMetadata(metadata);
  });
}

/**
 * Load baseline build metadata from state storage
 *
 * @param {string} workingDir - Working directory containing .vizzly
 * @returns {Object|null} Baseline build metadata or null
 */
export function loadBaselineBuildMetadata(workingDir) {
  return withStateStore(workingDir, store => {
    try {
      return store.getBaselineBuildMetadata();
    } catch (error) {
      console.debug?.(
        `Failed to read baseline build metadata: ${error.message}`
      );
      return null;
    }
  });
}

/**
 * Save baseline build metadata to state storage
 *
 * @param {string} workingDir - Working directory containing .vizzly
 * @param {Object} metadata - Metadata object to save
 */
export function saveBaselineBuildMetadata(workingDir, metadata) {
  withStateStore(workingDir, store => {
    store.setBaselineBuildMetadata(metadata);
  });
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
    screenshot => screenshot.signature === signature
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

  return (
    metadata.screenshots.find(
      screenshot => screenshot.signature === signature
    ) || null
  );
}
