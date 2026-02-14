import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
  root: './src',
  css: {
    postcss: '../../postcss.config.js',
  },
  resolve: {
    preserveSymlinks: false,
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    open: true,
  },
  define: {
    'process.env.NODE_ENV': '"development"',
  },
});
