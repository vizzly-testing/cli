/**
 * Type tests for @vizzly-testing/cli/client
 */
import { expectType, expectError } from 'tsd';
import {
  vizzlyScreenshot,
  vizzlyFlush,
  isVizzlyReady,
  configure,
  setEnabled,
  getVizzlyInfo,
} from '../src/types/client';

// ============================================================================
// vizzlyScreenshot
// ============================================================================

// Should accept Buffer as second argument
expectType<Promise<void>>(vizzlyScreenshot('test', Buffer.from('test')));

// Should accept string (file path) as second argument
expectType<Promise<void>>(vizzlyScreenshot('test', './path/to/image.png'));

// Should accept options object
expectType<Promise<void>>(
  vizzlyScreenshot('test', Buffer.from('test'), {
    properties: { browser: 'chrome' },
    threshold: 5,
    fullPage: true,
  })
);

// Should accept partial options
expectType<Promise<void>>(
  vizzlyScreenshot('test', Buffer.from('test'), { threshold: 10 })
);

// Should error on wrong name type
expectError(vizzlyScreenshot(123, Buffer.from('test')));

// Should error on wrong image type
expectError(vizzlyScreenshot('test', 123));

// Should error on wrong options type
expectError(vizzlyScreenshot('test', Buffer.from('test'), { threshold: 'high' }));

// ============================================================================
// vizzlyFlush
// ============================================================================

// Should return Promise<void>
expectType<Promise<void>>(vizzlyFlush());

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

// Should accept both
configure({ serverUrl: 'http://localhost:3000', enabled: false });

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
