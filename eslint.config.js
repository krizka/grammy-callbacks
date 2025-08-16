import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  eslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettier
    },
    rules: {
      ...prettierConfig.rules,
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      
      // General JavaScript rules
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      
      // Prettier formatting
      'prettier/prettier': 'error'
    }
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    }
  },
  {
    files: ['**/examples/**/*.ts'],
    rules: {
      'no-console': 'off'
    }
  },
  {
    ignores: ['dist/', 'node_modules/', '*.js.map', '*.d.ts.map']
  }
];
