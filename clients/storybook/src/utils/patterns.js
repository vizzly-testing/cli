/**
 * Pattern matching utilities for story filtering
 * Pure functions for glob-like pattern matching
 */

/**
 * Check if a string matches a glob-like pattern
 * Supports wildcards: * (any characters), ** (any path segments)
 * @param {string} str - String to test
 * @param {string} pattern - Pattern to match against
 * @returns {boolean} True if string matches pattern
 */
export function matchPattern(str, pattern) {
  if (!pattern) return true;
  if (!str) return false;

  // Escape special regex characters except * and /
  let regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    // Replace ** with a placeholder
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    // Replace * with regex for any characters except /
    .replace(/\*/g, '[^/]*')
    // Replace placeholder with regex for any characters including /
    .replace(/__DOUBLE_STAR__/g, '.*');

  let regex = new RegExp(`^${regexPattern}$`);
  return regex.test(str);
}

/**
 * Filter stories by include and exclude patterns
 * @param {Array<Object>} stories - Array of story objects with id property
 * @param {string|null} includePattern - Include pattern
 * @param {string|null} excludePattern - Exclude pattern
 * @returns {Array<Object>} Filtered stories
 */
export function filterByPattern(stories, includePattern, excludePattern) {
  return stories.filter(story => {
    let candidates = buildStoryPatternCandidates(story);

    // Check include pattern
    if (includePattern && !matchesAnyCandidate(candidates, includePattern)) {
      return false;
    }

    // Check exclude pattern
    if (excludePattern && matchesAnyCandidate(candidates, excludePattern)) {
      return false;
    }

    return true;
  });
}

/**
 * Find matching interaction hook for a story
 * Patterns are tried in order, first match wins
 * @param {Object} story - Story object with id/title
 * @param {Object} interactions - Interactions config with patterns array or simple map
 * @returns {Function|null} Matching interaction function or null
 */
export function findMatchingHook(story, interactions) {
  if (!interactions) {
    return null;
  }

  let candidates = buildStoryPatternCandidates(story);

  // Handle patterns array format: { patterns: [{ match, beforeScreenshot }] }
  if (interactions.patterns && Array.isArray(interactions.patterns)) {
    for (let pattern of interactions.patterns) {
      if (matchesAnyCandidate(candidates, pattern.match)) {
        return pattern.beforeScreenshot;
      }
    }
    return null;
  }

  // Handle simple object map format: { pattern: hook }
  if (Object.keys(interactions).length === 0) {
    return null;
  }

  for (let [pattern, hook] of Object.entries(interactions)) {
    if (matchesAnyCandidate(candidates, pattern)) {
      return hook;
    }
  }

  return null;
}

function matchesAnyCandidate(candidates, pattern) {
  return candidates.some(candidate => matchPattern(candidate, pattern));
}

function buildStoryPatternCandidates(story) {
  let title = story.title || '';
  let name = story.name || story.storyName || '';
  let titleName = title && name ? `${title}/${name}` : '';
  let candidates = [story.id, titleName, title, name, story.importPath].filter(
    Boolean
  );

  return [
    ...new Set(candidates.flatMap(value => [value, value.toLowerCase()])),
  ];
}
