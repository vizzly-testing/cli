/**
 * Package information utility
 * Centralized access to package.json data
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let packageJson;

export function getPackageRoot() {
  return fileURLToPath(new URL('../../', import.meta.url));
}

/**
 * Get package.json information
 * @returns {Object} Package.json data
 */
export function getPackageInfo() {
  if (!packageJson) {
    packageJson = JSON.parse(
      readFileSync(join(getPackageRoot(), 'package.json'), 'utf-8')
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
