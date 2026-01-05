/**
 * Static Report Generator
 *
 * Generates a self-contained HTML report from TDD test results using SSR.
 * The report is pre-rendered HTML with inlined CSS - no JavaScript required.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Get the path to the dist/reporter directory (for CSS)
 */
function getReporterDistPath() {
  // Try production path first (when running from dist/)
  let distPath = join(__dirname, '..', 'reporter');
  if (existsSync(join(distPath, 'reporter-bundle.css'))) {
    return distPath;
  }

  // Fall back to development path (when running from src/)
  distPath = join(__dirname, '..', '..', 'dist', 'reporter');
  if (existsSync(join(distPath, 'reporter-bundle.css'))) {
    return distPath;
  }

  throw new Error(
    'Reporter bundle not found. Run "npm run build:reporter" first.'
  );
}

/**
 * Get the path to the SSR module
 */
function getSSRModulePath() {
  // Try production path first (when running from dist/)
  let ssrPath = join(__dirname, '..', 'reporter-ssr', 'ssr-entry.js');
  if (existsSync(ssrPath)) {
    return ssrPath;
  }

  // Fall back to development path (when running from src/)
  ssrPath = join(__dirname, '..', '..', 'dist', 'reporter-ssr', 'ssr-entry.js');
  if (existsSync(ssrPath)) {
    return ssrPath;
  }

  throw new Error(
    'SSR module not found. Run "npm run build:reporter-ssr" first.'
  );
}

/**
 * Recursively copy a directory
 */
function copyDirectory(src, dest) {
  if (!existsSync(src)) return;

  mkdirSync(dest, { recursive: true });

  let entries = readdirSync(src);
  for (let entry of entries) {
    let srcPath = join(src, entry);
    let destPath = join(dest, entry);
    let stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Transform image URLs from server paths to relative file paths
 * /images/baselines/foo.png -> ./images/baselines/foo.png
 */
function transformImageUrls(reportData) {
  let transformed = JSON.parse(JSON.stringify(reportData));

  function transformUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('/images/')) {
      return `.${url}`;
    }
    return url;
  }

  function transformComparison(comparison) {
    return {
      ...comparison,
      baseline: transformUrl(comparison.baseline),
      current: transformUrl(comparison.current),
      diff: transformUrl(comparison.diff),
    };
  }

  if (transformed.comparisons) {
    transformed.comparisons = transformed.comparisons.map(transformComparison);
  }

  if (transformed.groups) {
    transformed.groups = transformed.groups.map(group => ({
      ...group,
      comparisons: group.comparisons?.map(transformComparison) || [],
    }));
  }

  return transformed;
}

/**
 * Generate the static HTML document with SSR-rendered content
 */
function generateHtml(renderedContent, css) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vizzly Visual Test Report</title>
    <style>
${css}
    </style>
</head>
<body>
    ${renderedContent}
</body>
</html>`;
}

/**
 * Generate a static report from the current TDD results
 *
 * @param {string} workingDir - The project working directory
 * @param {Object} options - Generation options
 * @param {string} [options.outputDir] - Output directory (default: .vizzly/report)
 * @returns {Promise<{success: boolean, reportPath: string, error?: string}>}
 */
export async function generateStaticReport(workingDir, options = {}) {
  let outputDir = options.outputDir || join(workingDir, '.vizzly', 'report');
  let vizzlyDir = join(workingDir, '.vizzly');

  try {
    // Read report data
    let reportDataPath = join(vizzlyDir, 'report-data.json');
    if (!existsSync(reportDataPath)) {
      return {
        success: false,
        reportPath: null,
        error: 'No report data found. Run tests first.',
      };
    }

    let reportData = JSON.parse(readFileSync(reportDataPath, 'utf8'));

    // Read baseline metadata if available
    let metadataPath = join(vizzlyDir, 'baselines', 'metadata.json');
    if (existsSync(metadataPath)) {
      try {
        reportData.baseline = JSON.parse(readFileSync(metadataPath, 'utf8'));
      } catch {
        // Ignore metadata read errors
      }
    }

    // Transform image URLs to relative paths
    let transformedData = transformImageUrls(reportData);

    // Load and use the SSR module
    let ssrModulePath = getSSRModulePath();
    let { renderStaticReport } = await import(ssrModulePath);
    let renderedContent = renderStaticReport(transformedData);

    // Get CSS
    let reporterDistPath = getReporterDistPath();
    let css = readFileSync(
      join(reporterDistPath, 'reporter-bundle.css'),
      'utf8'
    );

    // Create output directory
    mkdirSync(outputDir, { recursive: true });

    // Copy image directories
    let imageDirs = ['baselines', 'current', 'diffs'];
    for (let dir of imageDirs) {
      let srcDir = join(vizzlyDir, dir);
      let destDir = join(outputDir, 'images', dir);
      copyDirectory(srcDir, destDir);
    }

    // Generate and write HTML
    let html = generateHtml(renderedContent, css);
    let htmlPath = join(outputDir, 'index.html');
    writeFileSync(htmlPath, html, 'utf8');

    return {
      success: true,
      reportPath: htmlPath,
    };
  } catch (error) {
    return {
      success: false,
      reportPath: null,
      error: error.message,
    };
  }
}

/**
 * Get the file:// URL for a report path
 */
export function getReportFileUrl(reportPath) {
  return `file://${reportPath}`;
}
