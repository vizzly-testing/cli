import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import configPrettier from 'eslint-config-prettier';

export default [
  // Global ignores
  {
    ignores: ['node_modules/', 'dist/', 'build/']
  },
  // Source files
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        AbortController: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        URL: 'readonly'
      }
    },
    plugins: {
      prettier
    },
    rules: {
      ...js.configs.recommended.rules,
      ...configPrettier.rules,
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prettier/prettier': 'error'
    }
  }
];
