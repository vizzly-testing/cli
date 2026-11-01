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
// Configuration helper
export { defineConfig } from './domains/config/config.js';
// Utilities
export { loadConfig } from './domains/config/config-loader.js';
export { createTDDService } from './domains/tdd/tdd.service.js';
// Core services (for advanced usage)
export { createUploader } from './domains/uploads/upload.service.js';
// Errors
export {
  AuthError,
  BuildError,
  ConfigError,
  NetworkError,
  ScreenshotError,
  TimeoutError,
  UploadError,
  ValidationError,
  VizzlyError,
} from './errors/vizzly-error.js';
export { createPluginServices } from './plugins/plugin-api.js';
export { createServices } from './plugins/services.js';
// Primary SDK export
export { createVizzly, VizzlySDK } from './sdk/index.js';
export * as output from './services/output.js';
