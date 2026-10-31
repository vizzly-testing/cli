/**
 * Assets Router
 * Serves static assets (bundle files, images)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as output from '../services/output.js';
import { getPackageRoot } from '../services/package-info.js';
import { sendError, sendFile, sendNotFound } from './middleware/response.js';

/**
 * Create assets router
 * @param {Object} context - Router context
 * @returns {Function} Route handler
 */
export function createAssetsRouter() {
  return async function handleAssetsRoute(req, res, pathname) {
    if (req.method !== 'GET') {
      return false;
    }

    // Serve React bundle JS
    if (pathname === '/reporter-bundle.js') {
      let bundlePath = join(
        getPackageRoot(),
        'dist',
        'reporter',
        'reporter-bundle.iife.js'
      );

      if (existsSync(bundlePath)) {
        try {
          let bundle = readFileSync(bundlePath, 'utf8');
          sendFile(res, bundle, 'application/javascript');
          return true;
        } catch (error) {
          output.debug('Error serving reporter bundle:', {
            error: error.message,
          });
          sendError(res, 500, 'Error loading reporter bundle');
          return true;
        }
      } else {
        sendNotFound(res, 'Reporter bundle not found');
        return true;
      }
    }

    // Serve React bundle CSS
    if (pathname === '/reporter-bundle.css') {
      let cssPath = join(
        getPackageRoot(),
        'dist',
        'reporter',
        'reporter-bundle.css'
      );

      if (existsSync(cssPath)) {
        try {
          let css = readFileSync(cssPath, 'utf8');
          sendFile(res, css, 'text/css');
          return true;
        } catch (error) {
          output.debug('Error serving reporter CSS:', { error: error.message });
          sendError(res, 500, 'Error loading reporter CSS');
          return true;
        }
      } else {
        sendNotFound(res, 'Reporter CSS not found');
        return true;
      }
    }

    // Serve images from .vizzly directory
    if (pathname.startsWith('/images/')) {
      let imagePath = pathname.replace('/images/', '');
      let fullImagePath = join(process.cwd(), '.vizzly', imagePath);

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
