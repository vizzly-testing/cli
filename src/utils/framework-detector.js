import fs from 'fs/promises';
import path from 'path';

/**
 * Detect testing framework from project dependencies
 * @returns {Promise<string|null>} Detected framework or null
 */
export async function detectFramework() {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

    const dependencies = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
    };

    // Check for common testing frameworks
    if (dependencies['@playwright/test'] || dependencies.playwright) {
      return 'playwright';
    }

    if (dependencies.cypress) {
      return 'cypress';
    }

    if (dependencies.puppeteer) {
      return 'puppeteer';
    }

    // Check for config files
    const files = await fs.readdir(process.cwd());

    if (files.some(f => f.includes('playwright.config'))) {
      return 'playwright';
    }

    if (files.some(f => f.includes('cypress.config'))) {
      return 'cypress';
    }

    return null;
  } catch {
    return null;
  }
}
