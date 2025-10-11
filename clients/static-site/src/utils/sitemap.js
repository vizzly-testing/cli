/**
 * Sitemap XML parsing utilities
 * Functions for extracting URLs from sitemap.xml files
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';

/**
 * Parse sitemap XML file and extract URLs
 * @param {string} sitemapPath - Absolute path to sitemap.xml file
 * @returns {Promise<Array<string>>} Array of URLs from sitemap
 */
export async function parseSitemapFile(sitemapPath) {
  try {
    let content = await readFile(sitemapPath, 'utf-8');
    return parseSitemapXML(content);
  } catch (error) {
    throw new Error(`Failed to read sitemap at ${sitemapPath}: ${error.message}`);
  }
}

/**
 * Parse sitemap XML content and extract URLs
 * @param {string} xmlContent - Sitemap XML content
 * @returns {Array<string>} Array of URLs from sitemap
 */
export function parseSitemapXML(xmlContent) {
  let parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  let result = parser.parse(xmlContent);

  // Handle standard sitemap format
  if (result.urlset && result.urlset.url) {
    let urls = Array.isArray(result.urlset.url)
      ? result.urlset.url
      : [result.urlset.url];
    return urls.map(entry => entry.loc).filter(Boolean);
  }

  // Handle sitemap index format (sitemap of sitemaps)
  if (result.sitemapindex && result.sitemapindex.sitemap) {
    let sitemaps = Array.isArray(result.sitemapindex.sitemap)
      ? result.sitemapindex.sitemap
      : [result.sitemapindex.sitemap];
    return sitemaps.map(entry => entry.loc).filter(Boolean);
  }

  return [];
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
      path = '/' + path;
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
  let { existsSync } = await import('fs');

  let commonNames = ['sitemap.xml', 'sitemap_index.xml', 'sitemap-index.xml'];

  for (let filename of commonNames) {
    let sitemapPath = join(buildDir, filename);
    if (existsSync(sitemapPath)) {
      return sitemapPath;
    }
  }

  return null;
}
