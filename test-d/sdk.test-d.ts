/**
 * Type tests for @vizzly-testing/cli/sdk
 */
import { expectType, expectError } from 'tsd';
import {
  createVizzly,
  VizzlySDK,
  loadConfig,
  output,
  createUploader,
  createTDDService,
} from '../src/types/sdk';
import type { VizzlyConfig, UploadResult, ComparisonResult, Uploader, TddService } from '../src/types/index';

// ============================================================================
// createVizzly
// ============================================================================

// Should return Promise<VizzlySDK>
expectType<Promise<VizzlySDK>>(createVizzly());

// Should accept config
expectType<Promise<VizzlySDK>>(
  createVizzly({
    apiKey: 'test-key',
    apiUrl: 'https://app.vizzly.dev',
  })
);

// Should accept config with server options
expectType<Promise<VizzlySDK>>(
  createVizzly({
    server: { port: 3000, timeout: 30000 },
  })
);

// ============================================================================
// VizzlySDK class
// ============================================================================

async function testVizzlySDK() {
  let sdk = await createVizzly();

  // start() should return { port, url }
  let serverInfo = await sdk.start();
  expectType<number>(serverInfo.port);
  expectType<string>(serverInfo.url);

  // stop() should return Promise<void>
  expectType<Promise<void>>(sdk.stop());

  // getConfig() should return VizzlyConfig
  expectType<VizzlyConfig>(sdk.getConfig());

  // screenshot() with Buffer
  expectType<Promise<void>>(sdk.screenshot('test', Buffer.from('test')));

  // screenshot() with file path
  expectType<Promise<void>>(sdk.screenshot('test', '/path/to/image.png'));

  // screenshot() with options
  expectType<Promise<void>>(
    sdk.screenshot('test', Buffer.from('test'), {
      properties: { browser: 'chrome' },
    })
  );

  // upload() should return UploadResult
  expectType<Promise<UploadResult>>(sdk.upload());

  // upload() with options
  expectType<Promise<UploadResult>>(
    sdk.upload({
      screenshotsDir: './screenshots',
      buildName: 'My Build',
    })
  );

  // compare() should return ComparisonResult
  expectType<Promise<ComparisonResult>>(sdk.compare('test', Buffer.from('test')));
  expectType<Promise<ComparisonResult>>(sdk.compare('test', '/path/to/image.png'));
}

// VizzlySDK should be an EventEmitter (has on/off/emit)
async function testVizzlySDKEvents() {
  let sdk = await createVizzly();

  // Should have EventEmitter methods
  sdk.on('server:started', () => {});
  sdk.off('server:started', () => {});
  sdk.emit('custom:event', { data: 'test' });
}

// ============================================================================
// loadConfig
// ============================================================================

// Should return Promise<VizzlyConfig>
expectType<Promise<VizzlyConfig>>(loadConfig());

// Should accept options
expectType<Promise<VizzlyConfig>>(loadConfig({ cwd: '/path/to/project' }));

// ============================================================================
// output
// ============================================================================

// Should have info/warn/error/success/debug methods
output.info('message');
output.warn('message');
output.error('message');
output.success('message');
output.debug('category', 'message');
output.configure({ verbose: true });

// ============================================================================
// createUploader
// ============================================================================

// Should return Uploader
expectType<Uploader>(createUploader());

// Should accept config
expectType<Uploader>(
  createUploader({
    apiKey: 'test',
    apiUrl: 'https://api.example.com',
  })
);

// Should accept options
expectType<Uploader>(
  createUploader(
    { apiKey: 'test' },
    { batchSize: 10, timeout: 30000 }
  )
);

// ============================================================================
// createTDDService
// ============================================================================

// Should return TddService
expectType<TddService>(createTDDService({}));

// Should accept options
expectType<TddService>(
  createTDDService(
    { apiKey: 'test' },
    { workingDir: '/path', setBaseline: true }
  )
);
