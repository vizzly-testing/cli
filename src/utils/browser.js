/**
 * Browser utilities for opening URLs
 */

import { execFile } from 'child_process';
import { platform } from 'os';

/**
 * Open a URL in the default browser
 * @param {string} url - URL to open
 * @returns {Promise<boolean>} True if successful
 */
export async function openBrowser(url) {
  return new Promise(resolve => {
    let command;
    let args;
    let os = platform();

    switch (os) {
      case 'darwin': // macOS
        command = 'open';
        args = [url];
        break;
      case 'win32': // Windows
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
