/**
 * Browser utilities for opening URLs
 */

import { execFile } from 'node:child_process';
import { platform } from 'node:os';

/**
 * Validate URL is safe to open (prevent command injection)
 * Only allows http://, https://, and file:// URLs
 * @param {string} url - URL to validate
 * @returns {boolean} True if safe
 */
function isValidUrl(url) {
  if (typeof url !== 'string' || url.length === 0) {
    return false;
  }

  // Only allow safe URL schemes
  let validSchemes = ['http://', 'https://', 'file://'];
  return validSchemes.some(scheme => url.startsWith(scheme));
}

/**
 * Open a URL in the default browser
 * @param {string} url - URL to open (must be http://, https://, or file://)
 * @returns {Promise<boolean>} True if successful
 */
export async function openBrowser(url) {
  // Validate URL to prevent command injection
  if (!isValidUrl(url)) {
    return false;
  }

  return new Promise(resolve => {
    let command;
    let args;
    let currentPlatform = platform();

    switch (currentPlatform) {
      case 'darwin': // macOS
        command = 'open';
        args = [url];
        break;
      case 'win32': // Windows - use start command with validated URL
        command = 'cmd.exe';
        args = ['/c', 'start', '""', url];
        break;
      default: // Linux and others
        command = 'xdg-open';
        args = [url];
        break;
    }

    execFile(command, args, error => {
      if (error) {
        // Browser opening failed, but don't throw - user can manually open
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}
