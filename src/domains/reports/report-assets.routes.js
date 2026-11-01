/**
 * Assets Router
 * Serves static assets (bundle files, images)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  sendError,
  sendFile,
  sendNotFound,
} from '../../adapters/http/middleware/response.js';
import * as output from '../../shared/output.js';
import { getPackageRoot } from '../../shared/package-info.js';

let reporterAssets = new Map([
  [
    '/reporter-bundle.js',
    {
      filename: 'reporter-bundle.iife.js',
      contentType: 'application/javascript',
      label: 'reporter bundle',
      missing: 'Reporter bundle not found',
    },
  ],
  [
    '/reporter-bundle.css',
    {
      filename: 'reporter-bundle.css',
      contentType: 'text/css',
      label: 'reporter CSS',
      missing: 'Reporter CSS not found',
    },
  ],
]);

/**
 * Create assets router for a workspace's report and packaged reporter build.
 * @param {Object} [context] - Router context
 * @param {string} [context.workingDir] - Workspace containing report artifacts
 * @returns {Function} Route handler
 */
export function createAssetsRouter({ workingDir = process.cwd() } = {}) {
  return async function handleAssetsRoute(req, res, pathname) {
    if (req.method !== 'GET') {
      return false;
    }

    let asset = reporterAssets.get(pathname);
    if (asset) {
      let filename = join(getPackageRoot(), 'dist', 'reporter', asset.filename);
      if (!existsSync(filename)) {
        sendNotFound(res, asset.missing);
        return true;
      }

      try {
        sendFile(res, readFileSync(filename, 'utf8'), asset.contentType);
      } catch (error) {
        output.debug(`Error serving ${asset.label}:`, { error: error.message });
        sendError(res, 500, `Error loading ${asset.label}`);
      }
      return true;
    }

    // Serve images from .vizzly directory
    if (pathname.startsWith('/images/')) {
      let imagePath = pathname.replace('/images/', '');
      let fullImagePath = join(workingDir, '.vizzly', imagePath);

      if (existsSync(fullImagePath)) {
        try {
          let imageData = readFileSync(fullImagePath);
          // Images are rewritten in place between TDD runs, so disable browser caching.
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          sendFile(res, imageData, 'image/png');
          return true;
        } catch (error) {
          output.debug('Error serving image:', { error: error.message });
          sendError(res, 500, 'Error loading image');
          return true;
        }
      } else {
        sendNotFound(res, 'Image not found');
        return true;
      }
    }

    return false;
  };
}
