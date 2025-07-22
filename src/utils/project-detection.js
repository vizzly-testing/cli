/**
 * Project Detection Utilities
 * Automatically detect project type and framework
 */

import { readFile, access } from 'fs/promises';
import { join } from 'path';

/**
 * Detect project type and framework
 * @param {string} directory - Directory to analyze
 * @returns {Promise<Object>} Project information
 */
export async function detectProjectType(directory = process.cwd()) {
  const packageJsonPath = join(directory, 'package.json');

  let packageJsonData = null;
  try {
    const content = await readFile(packageJsonPath, 'utf8');
    packageJsonData = JSON.parse(content);
  } catch {
    // No package.json found
  }

  // Detect framework based on dependencies and files
  const framework = await detectFramework(directory, packageJsonData);
  const type = detectProjectTypeFromFramework(framework);

  return {
    type,
    framework,
    hasPackageJson: !!packageJsonData,
    projectName: packageJsonData?.name || 'unknown',
    dependencies: packageJsonData?.dependencies || {},
    devDependencies: packageJsonData?.devDependencies || {},
  };
}

/**
 * Detect testing framework
 * @param {string} directory - Directory to analyze
 * @param {Object} packageJson - Package.json content
 * @returns {Promise<string>} Framework name
 */
async function detectFramework(directory, packageJson) {
  const dependencies = {
    ...packageJson?.dependencies,
    ...packageJson?.devDependencies,
  };

  // Check for specific framework dependencies
  if (dependencies.cypress) {
    return 'cypress';
  }

  if (dependencies.playwright || dependencies['@playwright/test']) {
    return 'playwright';
  }

  if (dependencies.webdriverio || dependencies['@wdio/cli']) {
    return 'webdriver';
  }

  if (dependencies.jest || dependencies['@jest/core']) {
    return 'jest';
  }

  if (dependencies.vitest) {
    return 'vitest';
  }

  if (dependencies.mocha) {
    return 'mocha';
  }

  // Check for config files
  const configFiles = [
    'cypress.config.js',
    'playwright.config.js',
    'wdio.conf.js',
    'jest.config.js',
    'vitest.config.js',
  ];

  for (const configFile of configFiles) {
    try {
      await access(join(directory, configFile));
      return configFile.split('.')[0];
    } catch {
      // File doesn't exist
    }
  }

  return 'generic';
}

/**
 * Determine project type from framework
 * @param {string} framework - Framework name
 * @returns {string} Project type
 */
function detectProjectTypeFromFramework(framework) {
  const e2eFrameworks = ['cypress', 'playwright', 'webdriver'];

  if (e2eFrameworks.includes(framework)) {
    return 'e2e';
  }

  return 'web';
}

/**
 * Get suggested test command for framework
 * @param {string} framework - Framework name
 * @param {Object} packageJson - Package.json content
 * @returns {string} Suggested test command
 */
export function getSuggestedTestCommand(framework, packageJson) {
  const scripts = packageJson?.scripts || {};

  // Check for common script names
  const testScripts = [
    'test:e2e',
    'test:integration',
    'e2e',
    'cypress:run',
    'playwright:test',
    'test',
  ];

  for (const script of testScripts) {
    if (scripts[script]) {
      return `npm run ${script}`;
    }
  }

  // Framework-specific defaults
  switch (framework) {
    case 'cypress':
      return 'npx cypress run';
    case 'playwright':
      return 'npx playwright test';
    case 'webdriver':
      return 'npx wdio run';
    case 'jest':
      return 'npx jest';
    case 'vitest':
      return 'npx vitest run';
    default:
      return 'npm test';
  }
}

/**
 * Get suggested screenshots directory for framework
 * @param {string} framework - Framework name
 * @returns {string} Screenshots directory
 */
export function getSuggestedScreenshotsDir(framework) {
  switch (framework) {
    case 'cypress':
      return './cypress/screenshots';
    case 'playwright':
      return './test-results';
    case 'webdriver':
      return './screenshots';
    default:
      return './screenshots';
  }
}
