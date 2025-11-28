/**
 * Assets Router
 * Serves static assets (bundle files, images)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sendFile, sendError, sendNotFound } from '../middleware/response.js';

let __filename = fileURLToPath(import.meta.url);
let __dirname = dirname(__filename);
let PROJECT_ROOT = join(__dirname, '..', '..', '..');

/**
 * Create assets router
 * @param {Object} context - Router context
 * @param {Object} context.logger - Logger instance
 * @returns {Function} Route handler
 */
export function createAssetsRouter({ logger }) {
  return async function handleAssetsRoute(req, res, pathname) {
    if (req.method !== 'GET') {
      return false;
    }

    // Serve React bundle JS
    if (pathname === '/reporter-bundle.js') {
      let bundlePath = join(
        PROJECT_ROOT,
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
          logger.error('Error serving reporter bundle:', error);
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
        PROJECT_ROOT,
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
          logger.error('Error serving reporter CSS:', error);
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
          sendFile(res, imageData, 'image/png');
          return true;
        } catch (error) {
          logger.error('Error serving image:', error);
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
