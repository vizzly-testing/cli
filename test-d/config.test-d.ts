/**
 * Type tests for @vizzly-testing/cli/config
 */
import { expectType } from 'tsd';
import { defineConfig, VizzlyConfig } from '../src/types/config';

// ============================================================================
// defineConfig
// ============================================================================

// Should return VizzlyConfig
expectType<VizzlyConfig>(defineConfig({}));

// Should accept all config options
expectType<VizzlyConfig>(
  defineConfig({
    apiKey: 'test-key',
    apiUrl: 'https://app.vizzly.dev',
    server: {
      port: 47392,
      timeout: 30000,
    },
    build: {
      name: 'Build {timestamp}',
      environment: 'test',
      branch: 'main',
      commit: 'abc123',
      message: 'Test build',
    },
    upload: {
      screenshotsDir: './screenshots',
      batchSize: 10,
      timeout: 30000,
    },
    comparison: {
      threshold: 2.0,
    },
    tdd: {
      openReport: false,
    },
    plugins: ['@vizzly-testing/plugin-example'],
    parallelId: 'parallel-123',
    eager: true,
    wait: true,
  })
);

// Should accept partial config (common use case)
expectType<VizzlyConfig>(
  defineConfig({
    apiKey: process.env.VIZZLY_TOKEN,
    comparison: {
      threshold: 1.5,
    },
  })
);

// Should accept array of screenshot directories
expectType<VizzlyConfig>(
  defineConfig({
    upload: {
      screenshotsDir: ['./screenshots', './more-screenshots'],
    },
  })
);

// Should allow plugin-specific extra options
expectType<VizzlyConfig>(
  defineConfig({
    apiKey: 'test',
    // Plugin-specific options
    storybook: {
      configDir: '.storybook',
    },
    staticSite: {
      baseUrl: 'http://localhost:3000',
    },
  })
);

// This is how defineConfig is typically used in vizzly.config.js
let typicalConfig = defineConfig({
  apiKey: process.env.VIZZLY_TOKEN,
  server: {
    port: 47392,
  },
  comparison: {
    threshold: 2.0,
  },
});

expectType<VizzlyConfig>(typicalConfig);
