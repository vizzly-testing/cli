/**
 * Sitemap XML parsing utilities
 * Functions for extracting URLs from sitemap.xml files
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';

/**
 * Parse sitemap XML file and extract URLs
 * Follows sitemap index files to get all page URLs
 * @param {string} sitemapPath - Absolute path to sitemap.xml file
 * @returns {Promise<Array<string>>} Array of page URLs from sitemap
 */
export async function parseSitemapFile(sitemapPath) {
  let { dirname } = await import('node:path');
  let { existsSync } = await import('node:fs');

  try {
    let content = await readFile(sitemapPath, 'utf-8');
    let { urls, childSitemaps } = parseSitemapXML(content);

    // If this is a sitemap index, follow child sitemaps
    if (childSitemaps.length > 0) {
      let baseDir = dirname(sitemapPath);

      for (let childUrl of childSitemaps) {
        // Extract filename from URL (e.g., "sitemap-0.xml" from "https://example.com/sitemap-0.xml")
        let filename = childUrl.split('/').pop();
        let childPath = join(baseDir, filename);

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
 * @returns {Promise<string|null>} Path to sitemap if found, null otherwise
 */
export async function discoverSitemap(buildDir) {
  let { existsSync } = await import('node:fs');

  let commonNames = ['sitemap.xml', 'sitemap_index.xml', 'sitemap-index.xml'];

  for (let filename of commonNames) {
    let sitemapPath = join(buildDir, filename);
    if (existsSync(sitemapPath)) {
      return sitemapPath;
    }
  }

  return null;
}
