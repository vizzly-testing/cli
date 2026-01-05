import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite config for SSR build of the static report renderer.
 * Outputs a Node-compatible ES module that can render React to HTML strings.
 */
export default defineConfig({
  plugins: [react()],
  css: {
    postcss: '../../postcss.config.js',
  },
  resolve: {
    preserveSymlinks: false,
    dedupe: ['react', 'react-dom'],
  },
  build: {
    ssr: true,
    outDir: '../../dist/reporter-ssr',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/ssr-entry.jsx'),
      output: {
        format: 'esm',
        entryFileNames: 'ssr-entry.js',
      },
    },
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
