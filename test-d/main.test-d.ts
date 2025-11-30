/**
 * Type tests for @vizzly-testing/cli (main entry point)
 */
import { expectType, expectError } from 'tsd';
import {
  // SDK
  createVizzly,
  VizzlySDK,

  // Client exports
  vizzlyScreenshot,
  configure,
  setEnabled,

  // Core services
  createUploader,
  createTDDService,
  createServices,

  // Utilities
  loadConfig,
  output,

  // Configuration helper
  defineConfig,

  // Errors
  VizzlyError,
  UploadError,
  ConfigError,
  AuthError,
  NetworkError,
  ScreenshotError,
  BuildError,
  TimeoutError,
  ValidationError,

  // Types
  VizzlyConfig,
  UploadResult,
  ComparisonResult,
  Services,
  Uploader,
  TddService,
} from '../src/types/index';

// ============================================================================
// Main exports should all be available
// ============================================================================

// SDK - verify createVizzly returns a Promise<VizzlySDK>
async function testCreateVizzlyType() {
  let sdk = await createVizzly();
  expectType<VizzlySDK>(sdk);
}

// Client
expectType<Promise<void>>(vizzlyScreenshot('test', Buffer.from('test')));
configure({});
setEnabled(true);

// Services
expectType<Uploader>(createUploader());
expectType<TddService>(createTDDService({}));
expectType<Services>(createServices({}));

// Utilities
expectType<Promise<VizzlyConfig>>(loadConfig());
output.info('test');

// Config helper
expectType<VizzlyConfig>(defineConfig({ apiKey: 'test' }));

// ============================================================================
// Error classes
// ============================================================================

// VizzlyError is the base class
let vizzlyError = new VizzlyError('test');
expectType<string>(vizzlyError.code);
expectType<Record<string, unknown>>(vizzlyError.context);
expectType<string>(vizzlyError.timestamp);
expectType<string>(vizzlyError.getUserMessage());

// UploadError extends VizzlyError
let uploadError = new UploadError('upload failed');
expectType<string>(uploadError.code);
expectType<string>(uploadError.message);

// All error types should be instantiable
new ConfigError('config error');
new AuthError('auth error');
new NetworkError('network error');
new ScreenshotError('screenshot error');
new BuildError('build error');
new TimeoutError('timeout', 5000);
new ValidationError('validation failed', ['field1', 'field2']);

// ValidationError has errors array
let validationError = new ValidationError('invalid', ['error1']);
expectType<string[]>(validationError.errors);

// TimeoutError has duration
let timeoutError = new TimeoutError('timed out', 1000);
expectType<number>(timeoutError.duration);

// ============================================================================
// VizzlyConfig shape
// ============================================================================

let config: VizzlyConfig = {
  apiKey: 'test',
  apiUrl: 'https://app.vizzly.dev',
  server: {
    port: 47392,
    timeout: 30000,
  },
  build: {
    name: 'My Build',
    environment: 'test',
  },
  upload: {
    screenshotsDir: './screenshots',
    batchSize: 10,
  },
  comparison: {
    threshold: 0.1,
  },
  tdd: {
    openReport: true,
  },
  plugins: ['@vizzly-testing/plugin-example'],
};

// Config should allow extra keys for plugins
let configWithExtra: VizzlyConfig = {
  apiKey: 'test',
  customPluginOption: { foo: 'bar' },
};

// ============================================================================
// UploadResult shape
// ============================================================================

async function testUploadResult() {
  let uploader = createUploader({ apiKey: 'test' });
  let result = await uploader.upload({ screenshotsDir: './screenshots' });

  expectType<boolean>(result.success);
  expectType<string>(result.buildId);
  expectType<string | null>(result.url);
  expectType<number>(result.stats.total);
  expectType<number>(result.stats.uploaded);
  expectType<number>(result.stats.skipped);
}

// ============================================================================
// ComparisonResult shape
// ============================================================================

async function testComparisonResult() {
  let sdk = await createVizzly();
  let result = await sdk.compare('test', Buffer.from('test'));

  expectType<string>(result.id);
  expectType<string>(result.name);
  expectType<'passed' | 'failed' | 'new' | 'error' | 'baseline-updated'>(result.status);
  expectType<string>(result.baseline);
  expectType<string>(result.current);
  expectType<string | null>(result.diff);
  expectType<Record<string, unknown>>(result.properties);
  expectType<string>(result.signature);
}

// ============================================================================
// Services shape
// ============================================================================

let services = createServices({});
expectType<Uploader>(services.uploader);
expectType<TddService>(services.tddService);
