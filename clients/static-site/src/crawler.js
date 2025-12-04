/**
 * Page discovery and crawling
 * Functions for finding and parsing HTML pages in static site builds
 */

import { readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { filterByPattern } from './utils/patterns.js';
import {
  discoverSitemap,
  parseSitemapFile,
  urlsToRelativePaths,
} from './utils/sitemap.js';

/**
 * Check if a path is within the base directory
 * Prevents path traversal attacks by validating resolved paths
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
 * Recursively scan directory for HTML files
 * @param {string} dir - Directory to scan
 * @param {string} baseDir - Base directory for calculating relative paths
 * @returns {Promise<Array<string>>} Array of relative paths to HTML files
 */
async function scanHtmlFiles(dir, baseDir) {
  let htmlFiles = [];

  try {
    let entries = await readdir(dir, { withFileTypes: true });

    for (let entry of entries) {
      let fullPath = join(dir, entry.name);

      // Security: Validate path stays within baseDir
      if (!isWithinDirectory(fullPath, baseDir)) {
        // Skip entries that escape the base directory (symlinks, path traversal, etc.)
        continue;
      }

      if (entry.isDirectory()) {
        // Skip common non-public directories
        if (
          !['node_modules', '.git', '.vizzly', '_next'].includes(entry.name)
        ) {
          let subFiles = await scanHtmlFiles(fullPath, baseDir);
          htmlFiles.push(...subFiles);
        }
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        // Calculate relative path from base directory
        let relativePath = relative(baseDir, fullPath);
        htmlFiles.push(relativePath);
      }
    }
  } catch (error) {
    throw new Error(`Failed to scan directory ${dir}: ${error.message}`);
  }

  return htmlFiles;
}

/**
 * Convert file path to URL path
 * Handles index.html and directory structure conventions
 * @param {string} filePath - Relative file path
 * @returns {string} URL path
 */
export function filePathToUrlPath(filePath) {
  // Normalize separators to forward slashes
  // First handle literal backslashes, then platform separator
  let urlPath = filePath.replace(/\\/g, '/');
  if (sep !== '/') {
    urlPath = urlPath.split(sep).join('/');
  }

  // Remove .html extension
  urlPath = urlPath.replace(/\.html$/, '');

  // Convert index to root of directory
  urlPath = urlPath.replace(/\/index$/, '');
  if (urlPath === 'index') {
    urlPath = '';
  }

  // Ensure leading slash
  if (!urlPath.startsWith('/')) {
    urlPath = `/${urlPath}`;
  }

  // Handle root case
  if (urlPath === '/') {
    return '/';
  }

  return urlPath;
}

/**
 * Convert HTML file path to page object
 * @param {string} filePath - Relative path to HTML file
 * @returns {Object} Page object
 */
function createPageFromFilePath(filePath) {
  let urlPath = filePathToUrlPath(filePath);

  return {
    path: urlPath,
    filePath,
    title: urlPath,
  };
}

/**
 * Discover pages from sitemap
 * @param {string} buildPath - Build directory path
 * @param {Object} config - Configuration object
 * @returns {Promise<Array<Object>>} Array of page objects
 */
async function discoverPagesFromSitemap(buildPath, config) {
  try {
    let sitemapPath = join(buildPath, config.pageDiscovery.sitemapPath);

    // Check if custom sitemap exists, otherwise try to discover
    let { existsSync } = await import('node:fs');
    if (!existsSync(sitemapPath)) {
      sitemapPath = await discoverSitemap(buildPath);
    }

    if (!sitemapPath) {
      return [];
    }

    let urls = await parseSitemapFile(sitemapPath);

    // Convert URLs to relative paths
    // Try to infer base URL from first entry, or just extract paths
    let paths = urlsToRelativePaths(urls, '');

    // Create page objects
    return paths.map(path => ({
      path,
      filePath: null, // Will be resolved when needed
      title: path,
      source: 'sitemap',
    }));
  } catch {
    // Non-fatal: sitemap parsing failed, return empty array
    return [];
  }
}

/**
 * Discover pages by scanning HTML files
 * @param {string} buildPath - Build directory path
 * @param {Object} config - Configuration object
 * @returns {Promise<Array<Object>>} Array of page objects
 */
async function discoverPagesFromHtml(buildPath, _config) {
  try {
    let htmlFiles = await scanHtmlFiles(buildPath, buildPath);

    let pages = htmlFiles.map(file => ({
      ...createPageFromFilePath(file),
      source: 'html',
    }));

    return pages;
  } catch (error) {
    throw new Error(`Failed to discover pages from HTML: ${error.message}`);
  }
}

/**
 * Merge pages from multiple sources
 * Deduplicate by path, preferring pages from HTML scan
 * @param {Array<Array<Object>>} pageSources - Arrays of page objects
 * @returns {Array<Object>} Deduplicated array of pages
 */
function mergePageSources(...pageSources) {
  let pageMap = new Map();

  for (let pages of pageSources) {
    for (let page of pages) {
      let existing = pageMap.get(page.path);

      // Prefer pages from HTML scan (have filePath)
      if (!existing || (page.filePath && !existing.filePath)) {
        pageMap.set(page.path, page);
      }
    }
  }

  return Array.from(pageMap.values());
}

/**
 * Filter pages based on configuration patterns
 * @param {Array<Object>} pages - Array of page objects
 * @param {Object} config - Configuration object
 * @returns {Array<Object>} Filtered pages
 */
export function filterPages(pages, config) {
  return filterByPattern(pages, config.include, config.exclude);
}

/**
 * Generate full page URL for accessing the page
 * @param {string} baseUrl - Base URL (HTTP server)
 * @param {Object} page - Page object
 * @returns {string} Full URL to page
 */
export function generatePageUrl(baseUrl, page) {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('baseUrl must be a non-empty string');
  }

  // If page has filePath from HTML discovery, use it directly
  if (page.filePath) {
    let urlPath = page.filePath;
    // Normalize separators
    urlPath = urlPath.replace(/\\/g, '/');
    if (sep !== '/') {
      urlPath = urlPath.split(sep).join('/');
    }
    return `${baseUrl}/${urlPath}`;
  }

  // Fallback for pages from sitemap without filePath
  let path = page.path;

  // Handle root path
  if (path === '/') {
    return `${baseUrl}/index.html`;
  }

  // Remove trailing slash
  if (path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  // Try /path.html first (most common convention)
  return `${baseUrl}${path}.html`;
}

/**
 * Discover all pages from static site build
 * @param {string} buildPath - Path to static site build
 * @param {Object} config - Configuration object
 * @returns {Promise<Array<Object>>} Array of discovered and filtered pages
 */
export async function discoverPages(buildPath, config) {
  let pageSources = [];

  // Discover from sitemap if enabled
  if (config.pageDiscovery.useSitemap) {
    let sitemapPages = await discoverPagesFromSitemap(buildPath, config);
    if (sitemapPages.length > 0) {
      pageSources.push(sitemapPages);
    }
  }

  // Discover from HTML scan if enabled
  if (config.pageDiscovery.scanHtml) {
    let htmlPages = await discoverPagesFromHtml(buildPath, config);
    pageSources.push(htmlPages);
  }

  // Merge all sources
  let allPages = mergePageSources(...pageSources);

  // Filter based on config
  let filtered = filterPages(allPages, config);

  return filtered;
}
