/**
 * Type tests for @vizzly-testing/cli/client
 */
import { expectError, expectType } from 'tsd';
import type {
  FlushResult,
  ScreenshotClient,
  ScreenshotResult,
} from '../src/types/client';
import {
  autoDiscoverTddServer,
  configure,
  createScreenshotClient,
  getVizzlyInfo,
  isVizzlyReady,
  LOG_LEVELS,
  setEnabled,
  shouldLogClient,
  vizzlyFlush,
  vizzlyScreenshot,
} from '../src/types/client';

let screenshotResult: ScreenshotResult = {
  success: true,
  status: 'diff',
};
expectType<ScreenshotResult>(screenshotResult);

let isolatedClient = createScreenshotClient({
  serverUrl: 'http://localhost:47392',
  failOnDiff: true,
});
expectType<ScreenshotClient>(isolatedClient);
expectType<Promise<ScreenshotResult | null>>(
  isolatedClient.screenshot('preview', './preview.png', {
    buildId: 'build-123',
    properties: { platform: 'iOS' },
  })
);
expectType<Promise<FlushResult | null>>(isolatedClient.flush());
expectError(createScreenshotClient({}));

// ============================================================================
// vizzlyScreenshot
// ============================================================================

// Should accept Buffer as second argument
expectType<Promise<ScreenshotResult | null>>(
  vizzlyScreenshot('test', Buffer.from('test'))
);

// Should accept string (file path) as second argument
expectType<Promise<ScreenshotResult | null>>(
  vizzlyScreenshot('test', './path/to/image.png')
);

// Should accept options object
expectType<Promise<ScreenshotResult | null>>(
  vizzlyScreenshot('test', Buffer.from('test'), {
    properties: { browser: 'chrome', viewport: { width: 1920, height: 1080 } },
    threshold: 5,
    minClusterSize: 2,
    fullPage: true,
    requestTimeout: 5000,
    buildId: 'build-123',
  })
);

// Should accept partial options
expectType<Promise<ScreenshotResult | null>>(
  vizzlyScreenshot('test', Buffer.from('test'), { threshold: 10 })
);

// Should error on wrong name type
expectError(vizzlyScreenshot(123, Buffer.from('test')));

// Should error on wrong image type
expectError(vizzlyScreenshot('test', 123));

// Should error on wrong options type
expectError(
  vizzlyScreenshot('test', Buffer.from('test'), { threshold: 'high' })
);
expectError(
  vizzlyScreenshot('test', Buffer.from('test'), { requestTimeout: 'fast' })
);
expectError(
  vizzlyScreenshot('test', Buffer.from('test'), { browser: 'chrome' })
);

// ============================================================================
// vizzlyFlush
// ============================================================================

// Should return Promise<FlushResult | null>
expectType<Promise<FlushResult | null>>(vizzlyFlush());
let flushResult: FlushResult = {
  success: true,
  uploaded: 2,
  failed: 1,
  total: 3,
};
expectType<number | undefined>(flushResult.uploaded);
expectType<string | undefined>(flushResult.message);

// ============================================================================
// isVizzlyReady
// ============================================================================

// Should return boolean
expectType<boolean>(isVizzlyReady());

// ============================================================================
// configure
// ============================================================================

// Should accept empty config
configure();
configure({});

// Should accept serverUrl
configure({ serverUrl: 'http://localhost:3000' });

// Should accept enabled
configure({ enabled: true });
configure({ failOnDiff: true });

// Should accept both
configure({
  serverUrl: 'http://localhost:3000',
  enabled: false,
  failOnDiff: false,
});
expectError(configure({ failOnDiff: 'yes' }));

// ============================================================================
// setEnabled
// ============================================================================

// Should accept boolean
setEnabled(true);
setEnabled(false);

// Should error on non-boolean
expectError(setEnabled('true'));
expectError(setEnabled(1));

// ============================================================================
// getVizzlyInfo
// ============================================================================

// Should return info object with correct shape
let info = getVizzlyInfo();
expectType<boolean>(info.enabled);
expectType<string | null>(info.serverUrl);
expectType<boolean>(info.ready);
expectType<string | null>(info.buildId);
expectType<boolean>(info.tddMode);
expectType<boolean>(info.disabled);
expectType<boolean>(info.failOnDiff);

// ============================================================================
// Public helper exports
// ============================================================================

expectType<number>(LOG_LEVELS.debug);
expectType<number>(LOG_LEVELS.info);
expectType<number>(LOG_LEVELS.warn);
expectType<number>(LOG_LEVELS.error);

expectType<boolean>(shouldLogClient('error'));
expectType<boolean>(shouldLogClient('debug', 'warn'));

expectType<string | null>(autoDiscoverTddServer());
expectType<string | null>(
  autoDiscoverTddServer('/workspace/project', {
    exists: path => path.endsWith('server.json'),
    readFile: () => JSON.stringify({ port: 47392 }),
    env: { VIZZLY_FAIL_ON_DIFF: 'true' },
  })
);
