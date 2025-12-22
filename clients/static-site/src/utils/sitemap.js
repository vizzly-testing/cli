/**
 * Sitemap XML parsing utilities
 * Functions for extracting URLs from sitemap.xml files
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { XMLParser } from 'fast-xml-parser';

/**
 * Check if a path is within the base directory
 * Prevents path traversal attacks
 * @param {string} targetPath - Path to validate
 * @param {string} baseDir - Base directory that should contain the target
 * @returns {boolean} True if targetPath is within baseDir
 */
function isWithinDirectory(targetPath, baseDir) {
  let resolvedBase = resolve(baseDir);
  let resolvedTarget = resolve(targetPath);

  return (
    resolvedTarget.startsWith(resolvedBase + sep) ||
    resolvedTarget === resolvedBase
  );
}

/**
 * Safely extract filename from URL
 * Validates the filename doesn't contain path traversal sequences
 * @param {string} url - URL to extract filename from
 * @returns {string|null} Safe filename or null if invalid
 */
function safeFilenameFromUrl(url) {
  // Extract the last path segment
  let filename = url.split('/').pop() || '';

  // Reject if it contains path traversal or suspicious characters
  if (
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0')
  ) {
    return null;
  }

  // Use basename as extra safety
  filename = basename(filename);

  // Must be a valid sitemap filename
  if (!filename.endsWith('.xml')) {
    return null;
  }

  return filename;
}

/**
 * Parse sitemap XML file and extract URLs
 * Follows sitemap index files to get all page URLs
 * @param {string} sitemapPath - Absolute path to sitemap.xml file
 * @returns {Promise<Array<string>>} Array of page URLs from sitemap
 */
export async function parseSitemapFile(sitemapPath) {
  try {
    let content = await readFile(sitemapPath, 'utf-8');
    let { urls, childSitemaps } = parseSitemapXML(content);

    // If this is a sitemap index, follow child sitemaps
    if (childSitemaps.length > 0) {
      let baseDir = dirname(sitemapPath);

      for (let childUrl of childSitemaps) {
        // Safely extract filename from URL
        let filename = safeFilenameFromUrl(childUrl);
        if (!filename) {
          // Skip invalid filenames (potential path traversal)
          continue;
        }

        let childPath = join(baseDir, filename);

        // Verify the resolved path is still within baseDir
        if (!isWithinDirectory(childPath, baseDir)) {
          continue;
        }

        if (existsSync(childPath)) {
          try {
            let childContent = await readFile(childPath, 'utf-8');
            let childResult = parseSitemapXML(childContent);
            urls.push(...childResult.urls);
          } catch {
            // Skip unreadable child sitemaps
          }
        }
      }
    }

    return urls;
  } catch (error) {
    throw new Error(
      `Failed to read sitemap at ${sitemapPath}: ${error.message}`
    );
  }
}

/**
 * Parse sitemap XML content and extract URLs
 * @param {string} xmlContent - Sitemap XML content
 * @returns {{ urls: Array<string>, childSitemaps: Array<string> }} URLs and child sitemap URLs
 */
export function parseSitemapXML(xmlContent) {
  let parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  let result = parser.parse(xmlContent);

  // Handle standard sitemap format
  if (result.urlset?.url) {
    let urls = Array.isArray(result.urlset.url)
      ? result.urlset.url
      : [result.urlset.url];
    return {
      urls: urls.map(entry => entry.loc).filter(Boolean),
      childSitemaps: [],
    };
  }

  // Handle sitemap index format (sitemap of sitemaps)
  if (result.sitemapindex?.sitemap) {
    let sitemaps = Array.isArray(result.sitemapindex.sitemap)
      ? result.sitemapindex.sitemap
      : [result.sitemapindex.sitemap];
    return {
      urls: [],
      childSitemaps: sitemaps.map(entry => entry.loc).filter(Boolean),
    };
  }

  return { urls: [], childSitemaps: [] };
}

/**
 * Convert sitemap URLs to relative paths
 * Removes base URL and normalizes paths
 * @param {Array<string>} urls - Array of full URLs
 * @param {string} baseUrl - Base URL to remove (e.g., 'https://example.com')
 * @returns {Array<string>} Array of relative paths
 */
export function urlsToRelativePaths(urls, baseUrl) {
  return urls.map(url => {
    // Remove base URL if present
    let path = url;
    if (baseUrl && url.startsWith(baseUrl)) {
      path = url.slice(baseUrl.length);
    }

    // Remove protocol and domain if still present
    path = path.replace(/^https?:\/\/[^/]+/, '');

    // Ensure leading slash
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }

    // Remove trailing slash for consistency (except root)
    if (path !== '/' && path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    return path;
  });
}

/**
 * Discover sitemap in build directory
 * Looks for common sitemap filenames
 * @param {string} buildDir - Build directory path
 * @returns {string|null} Path to sitemap if found, null otherwise
 */
export function discoverSitemap(buildDir) {
  let commonNames = ['sitemap.xml', 'sitemap_index.xml', 'sitemap-index.xml'];

  for (let filename of commonNames) {
    let sitemapPath = join(buildDir, filename);
    if (existsSync(sitemapPath)) {
      return sitemapPath;
    }
  }

  return null;
}
