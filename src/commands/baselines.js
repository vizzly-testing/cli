/**
 * Baselines command - query local TDD baselines
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { loadBaselineMetadata } from '../tdd/metadata/baseline-metadata.js';
import * as defaultOutput from '../utils/output.js';

/**
 * Extract filename from a path
 */
function getFilename(screenshot) {
  if (screenshot.filename) return screenshot.filename;
  if (screenshot.path) return basename(screenshot.path);
  return null;
}

/**
 * Extract viewport from screenshot properties
 */
function getViewport(screenshot) {
  if (screenshot.viewport) return screenshot.viewport;
  if (screenshot.properties?.viewport_width && screenshot.properties?.viewport_height) {
    return {
      width: screenshot.properties.viewport_width,
      height: screenshot.properties.viewport_height,
    };
  }
  return null;
}

/**
 * Baselines command - list and query local TDD baselines
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @param {Object} deps - Dependencies for testing
 */
export async function baselinesCommand(options = {}, globalOptions = {}, deps = {}) {
  let {
    output = defaultOutput,
    exit = code => process.exit(code),
    cwd = process.cwd,
  } = deps;

  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  try {
    let workingDir = resolve(cwd());
    let vizzlyDir = join(workingDir, '.vizzly');
    let baselinesDir = join(vizzlyDir, 'baselines');

    // Check if .vizzly directory exists
    if (!existsSync(vizzlyDir)) {
      if (globalOptions.json) {
        output.data({ baselines: [], count: 0, error: 'No .vizzly directory found' });
        output.cleanup();
        return;
      }
      output.warn('No .vizzly directory found. Run visual tests first to create baselines.');
      output.cleanup();
      return;
    }

    // Load metadata
    let metadata = loadBaselineMetadata(baselinesDir);
    let screenshots = metadata?.screenshots || [];

    // Get actual baseline files
    let baselineFiles = [];
    if (existsSync(baselinesDir)) {
      baselineFiles = readdirSync(baselinesDir)
        .filter(f => f.endsWith('.png'))
        .map(f => {
          let filePath = join(baselinesDir, f);
          let stat = statSync(filePath);
          return {
            filename: f,
            path: filePath,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
          };
        });
    }

    // Filter by name if provided
    if (options.name) {
      let pattern = options.name.replace(/\*/g, '.*');
      let regex = new RegExp(pattern, 'i');
      screenshots = screenshots.filter(s => regex.test(s.name));
      baselineFiles = baselineFiles.filter(f => regex.test(f.filename));
    }

    // Get specific baseline info
    if (options.info) {
      let screenshot = screenshots.find(s =>
        s.name === options.info || s.signature === options.info
      );

      if (!screenshot) {
        if (globalOptions.json) {
          output.data({ error: 'Baseline not found', name: options.info });
          output.cleanup();
          return;
        }
        output.error(`Baseline "${options.info}" not found`);
        exit(1);
        return;
      }

      let filename = getFilename(screenshot);
      let viewport = getViewport(screenshot);
      let file = baselineFiles.find(f => f.filename === filename);

      if (globalOptions.json) {
        output.data({
          name: screenshot.name,
          signature: screenshot.signature,
          filename,
          path: screenshot.path || (file?.path) || join(baselinesDir, filename),
          sha256: screenshot.sha256,
          viewport,
          browser: screenshot.browser || null,
          createdAt: screenshot.createdAt || metadata?.createdAt,
          fileSize: file?.size,
          fileModifiedAt: file?.modifiedAt,
        });
        output.cleanup();
        return;
      }

      output.header('baseline');
      output.keyValue({
        Name: screenshot.name,
        Signature: screenshot.signature,
        File: filename,
      });
      output.blank();

      if (viewport) {
        output.labelValue('Viewport', `${viewport.width}×${viewport.height}`);
      }
      if (screenshot.browser) {
        output.labelValue('Browser', screenshot.browser);
      }
      if (screenshot.sha256) {
        output.labelValue('SHA256', screenshot.sha256.substring(0, 16) + '...');
      }
      if (file) {
        output.labelValue('Size', formatBytes(file.size));
        output.labelValue('Modified', new Date(file.modifiedAt).toLocaleString());
      }

      output.cleanup();
      return;
    }

    // JSON output for list
    if (globalOptions.json) {
      let baselines = screenshots.map(s => {
        let filename = getFilename(s);
        let viewport = getViewport(s);
        let file = baselineFiles.find(f => f.filename === filename);
        return {
          name: s.name,
          signature: s.signature,
          filename,
          path: s.path || (file?.path) || join(baselinesDir, filename),
          sha256: s.sha256,
          viewport,
          browser: s.browser || null,
          createdAt: s.createdAt,
          fileSize: file?.size,
        };
      });

      output.data({
        baselines,
        count: baselines.length,
        metadata: metadata ? {
          buildId: metadata.buildId,
          buildName: metadata.buildName,
          branch: metadata.branch,
          threshold: metadata.threshold,
          createdAt: metadata.createdAt,
        } : null,
      });
      output.cleanup();
      return;
    }

    // Human-readable output
    output.header('baselines');

    if (screenshots.length === 0 && baselineFiles.length === 0) {
      output.print('  No baselines found');
      output.hint('Run visual tests to create baselines');
      output.cleanup();
      return;
    }

    // Show metadata info
    if (metadata) {
      output.labelValue('Source', metadata.buildName || metadata.buildId || 'Local');
      if (metadata.branch && metadata.branch !== 'local') {
        output.labelValue('Branch', metadata.branch);
      }
      output.labelValue('Threshold', `${metadata.threshold || 2.0}%`);
      output.blank();
    }

    output.labelValue('Count', String(screenshots.length));
    output.blank();

    let colors = output.getColors();

    // Show baselines (limited in non-verbose mode)
    let displayLimit = globalOptions.verbose ? screenshots.length : 20;
    for (let screenshot of screenshots.slice(0, displayLimit)) {
      let viewport = getViewport(screenshot);
      let viewportInfo = viewport
        ? colors.dim(` ${viewport.width}×${viewport.height}`)
        : '';
      let browserInfo = screenshot.browser
        ? colors.dim(` ${screenshot.browser}`)
        : '';

      output.print(`  ${colors.brand.success('●')} ${screenshot.name}${viewportInfo}${browserInfo}`);
    }

    if (screenshots.length > displayLimit) {
      output.blank();
      output.hint(`... and ${screenshots.length - displayLimit} more. Use --verbose to see all.`);
    }

    // Show orphaned files (files without metadata)
    if (globalOptions.verbose) {
      let knownFiles = new Set(screenshots.map(s => getFilename(s)).filter(Boolean));
      let orphaned = baselineFiles.filter(f => !knownFiles.has(f.filename));

      if (orphaned.length > 0) {
        output.blank();
        output.labelValue('Orphaned Files', String(orphaned.length));
        for (let file of orphaned) {
          output.print(`  ${colors.brand.warning('?')} ${file.filename}`);
        }
      }
    }

    output.cleanup();
  } catch (error) {
    output.error('Failed to read baselines', error);
    exit(1);
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate baselines command options
 */
export function validateBaselinesOptions() {
  return [];
}
