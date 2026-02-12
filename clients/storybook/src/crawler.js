/**
 * Storybook story discovery and parsing
 * Pure functions for extracting story information from index.json
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { filterByPattern } from './utils/patterns.js';

/**
 * Read and parse Storybook's index.json file
 * @param {string} storybookPath - Path to static Storybook build
 * @returns {Promise<Object>} Parsed index.json content
 */
export async function readIndexJson(storybookPath) {
  let indexPath = join(storybookPath, 'index.json');

  try {
    let content = await readFile(indexPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to read Storybook index.json at ${indexPath}: ${error.message}`
    );
  }
}

/**
 * Parse Storybook v6 format stories
 * @param {Object} indexData - Parsed index.json data
 * @returns {Array<Object>} Array of story objects
 */
function parseV6Stories(indexData) {
  let stories = indexData.stories || {};

  return Object.entries(stories).map(([id, story]) => ({
    id,
    title: story.title || story.kind || id,
    name: story.name || story.story || 'default',
    kind: story.kind || story.title,
    parameters: story.parameters || {},
    tags: story.tags || [],
  }));
}

/**
 * Parse Storybook v7+ format stories
 * @param {Object} indexData - Parsed index.json data
 * @returns {Array<Object>} Array of story objects
 */
function parseV7Stories(indexData) {
  let entries = indexData.entries || {};

  return Object.entries(entries)
    .filter(([, entry]) => entry.type === 'story')
    .map(([id, entry]) => ({
      id,
      title: entry.title || id,
      name: entry.name || 'default',
      kind: entry.title,
      parameters: entry.parameters || {},
      tags: entry.tags || [],
      importPath: entry.importPath,
    }));
}

/**
 * Detect Storybook version and parse stories accordingly
 * @param {Object} indexData - Parsed index.json data
 * @returns {Array<Object>} Array of story objects
 */
export function parseStories(indexData) {
  if (!indexData) {
    throw new Error('Invalid index.json data');
  }

  // v7+ uses 'entries' and 'v' fields
  if (indexData.v !== undefined || indexData.entries) {
    return parseV7Stories(indexData);
  }

  // v6 uses 'stories' field
  if (indexData.stories) {
    return parseV6Stories(indexData);
  }

  throw new Error('Unrecognized Storybook index.json format');
}

/**
 * Extract Vizzly configuration from story parameters
 * @param {Object} story - Story object with parameters
 * @returns {Object|null} Vizzly config or null
 */
export function extractStoryConfig(story) {
  return story.parameters?.vizzly || null;
}

/**
 * Check whether a story is tagged to skip Vizzly capture
 * @param {Object} story - Story object with tags
 * @returns {boolean}
 */
function hasVizzlySkipTag(story) {
  return Array.isArray(story.tags) && story.tags.includes('vizzly-skip');
}

/**
 * Filter stories based on include/exclude patterns and skip config
 * @param {Array<Object>} stories - Array of story objects
 * @param {Object} config - Configuration object
 * @returns {Array<Object>} Filtered stories
 */
export function filterStories(stories, config) {
  let verbose = process.env.VIZZLY_LOG_LEVEL === 'debug';

  // First filter by include/exclude patterns
  let filtered = filterByPattern(stories, config.include, config.exclude);

  // Then filter out stories marked to skip
  filtered = filtered.filter(story => {
    if (hasVizzlySkipTag(story)) {
      if (verbose) {
        console.error(`  [filter] Skipping ${story.id} (tag: vizzly-skip)`);
      }
      return false;
    }

    let storyConfig = extractStoryConfig(story);
    if (storyConfig?.skip) {
      if (verbose) {
        console.error(`  [filter] Skipping ${story.id} (parameters.vizzly.skip)`);
      }
      return false;
    }

    return true;
  });

  return filtered;
}

/**
 * Generate story URL for iframe
 * @param {string} baseUrl - Base Storybook URL
 * @param {string} storyId - Story ID
 * @returns {string} Full story URL
 */
export function generateStoryUrl(baseUrl, storyId) {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('baseUrl must be a non-empty string');
  }
  if (!storyId || typeof storyId !== 'string') {
    throw new Error('storyId must be a non-empty string');
  }

  return `${baseUrl}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;
}

/**
 * Discover all stories from Storybook build
 * @param {string} storybookPath - Path to static Storybook build
 * @param {Object} config - Configuration object
 * @returns {Promise<Array<Object>>} Array of discovered and filtered stories
 */
export async function discoverStories(storybookPath, config) {
  let indexData = await readIndexJson(storybookPath);
  let allStories = parseStories(indexData);
  let filtered = filterStories(allStories, config);

  return filtered;
}
