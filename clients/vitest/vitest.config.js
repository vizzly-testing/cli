import { defineConfig } from 'vitest/config';

// Unit tests config - runs in Node environment
// These tests verify the plugin configuration and Node.js integrations
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/vitest-plugin.spec.js', 'tests/**/*.node.spec.js'],
  },
});
