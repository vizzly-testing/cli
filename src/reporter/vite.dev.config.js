import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: './src',
  css: {
    postcss: '../../postcss.config.js',
  },
  server: {
    port: 5173,
    open: true,
  },
  define: {
    'process.env.NODE_ENV': '"development"',
  },
});
