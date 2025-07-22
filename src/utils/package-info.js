/**
 * Package information utility
 * Centralized access to package.json data
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let packageJson;

/**
 * Get package.json information
 * @returns {Object} Package.json data
 */
export function getPackageInfo() {
  if (!packageJson) {
    packageJson = JSON.parse(
      readFileSync(join(__dirname, '../../package.json'), 'utf-8')
    );
  }
  return packageJson;
}

/**
 * Get package version
 * @returns {string} Package version
 */
export function getPackageVersion() {
  return getPackageInfo().version;
}

/**
 * Get package name
 * @returns {string} Package name
 */
export function getPackageName() {
  return getPackageInfo().name;
}
