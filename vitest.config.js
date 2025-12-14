import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 8000,
    fileParallelism: false,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.spec.js', 'tests/**/*.spec.jsx'],
    exclude: ['tests/reporter/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.spec.js',
        '**/*.spec.jsx',
        'coverage/**',
        'dist/**',
        'bin/**',
        'scripts/**',
        '**/*.config.js',
        'src/reporter/**'
      ],
      include: ['src/**/*.js', 'src/**/*.jsx'],
      all: true,
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 70,
        statements: 75
      }
    }
  }
});
