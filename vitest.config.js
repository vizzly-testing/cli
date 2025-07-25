import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.spec.js', 'tests/**/*.spec.jsx'],
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
        '**/*.config.js'
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
