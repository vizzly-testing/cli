/**
 * Assets Router
 * Serves static assets (bundle files, images)
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as output from '../../utils/output.js';
import { sendError, sendFile, sendNotFound } from '../middleware/response.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

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
      const bundlePath = join(
        PROJECT_ROOT,
        'dist',
        'reporter',
        'reporter-bundle.iife.js'
      );

      if (existsSync(bundlePath)) {
        try {
          const bundle = readFileSync(bundlePath, 'utf8');
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
      const cssPath = join(
        PROJECT_ROOT,
        'dist',
        'reporter',
        'reporter-bundle.css'
      );

      if (existsSync(cssPath)) {
        try {
          const css = readFileSync(cssPath, 'utf8');
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
      const imagePath = pathname.replace('/images/', '');
      const fullImagePath = join(process.cwd(), '.vizzly', imagePath);

      if (existsSync(fullImagePath)) {
        try {
          const imageData = readFileSync(fullImagePath);
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
