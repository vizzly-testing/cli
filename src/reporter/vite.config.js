import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: '../../postcss.config.js',
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.jsx'),
      name: 'VizzlyReporter',
      fileName: 'reporter-bundle',
      formats: ['iife'], // Self-executing function for browser
    },
    rollupOptions: {
      external: [], // Bundle everything
      output: {
        globals: {},
      },
    },
    outDir: '../../dist/reporter',
    emptyOutDir: true,
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
