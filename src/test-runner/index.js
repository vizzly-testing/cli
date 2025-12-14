/**
 * Test Runner Module - Public exports
 *
 * Provides functional test runner primitives:
 * - core.js: Pure functions for building env, payloads, results
 * - operations.js: Test execution operations with dependency injection
 */

// Core pure functions
export {
  buildApiBuildPayload,
  buildClientOptions,
  buildDisabledEnv,
  buildDisabledRunResult,
  buildRunResult,
  buildSpawnOptions,
  buildTestEnv,
  determineBuildMode,
  hasApiKey,
  normalizeSetBaseline,
  shouldDisableVizzly,
  validateDaemonMode,
  validateTestCommand,
} from './core.js';

// Test runner operations (take dependencies as parameters)
export {
  cancelTests,
  createBuild,
  executeTestCommand,
  fetchBuildUrl,
  finalizeBuild,
  initializeDaemon,
  runTests,
} from './operations.js';
