import 'dotenv/config';

/**
 * Vizzly CLI & SDK - Main exports
 *
 * This is the main entry point. For specific use cases:
 * - Test runners: import from '@vizzly-testing/cli/client'
 * - Custom integrations: import from '@vizzly-testing/cli/sdk'
 */

// Client exports for convenience
export { configure, setEnabled, vizzlyScreenshot } from './client/index.js';
// Errors
export { UploadError } from './errors/vizzly-error.js';
// Primary SDK export
export { createVizzly } from './sdk/index.js';
export { createServices } from './services/index.js';
export { createTDDService } from './services/tdd-service.js';
// Core services (for advanced usage)
export { createUploader } from './services/uploader.js';
// Configuration helper
export { defineConfig } from './utils/config-helpers.js';
// Utilities
export { loadConfig } from './utils/config-loader.js';
export * as output from './utils/output.js';
