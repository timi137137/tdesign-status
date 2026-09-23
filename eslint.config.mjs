import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import vueScopedCss from 'eslint-plugin-vue-scoped-css';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'server/data/**',
      '**/*.mjs',
      '**/*.cjs',
      'playwright-report/**',
      'test-results/**',
      'snapshot*',
      'lib/**',
      'es/**',
      'esm/**',
      'static/**',
      'cypress/**',
      '_site/**',
      'temp*',
      'src/sw.ts',
    ],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  ...tseslint.configs.recommended,
  ...compat.extends('eslint-config-airbnb-base', 'plugin:prettier/recommended'),
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaFeatures: { jsx: true },
        extraFileExtensions: ['.vue'],
      },
      globals: {
        globalThis: 'readonly',
      },
    },
    plugins: {
      'vue-scoped-css': vueScopedCss,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'no-console': 'off',
      'no-continue': 'off',
      'no-restricted-syntax': 'off',
      'no-plusplus': 'off',
      'no-param-reassign': 'off',
      'no-shadow': 'off',
      'guard-for-in': 'off',
      'no-await-in-loop': 'off',
      'no-void': 'off',
      'no-underscore-dangle': 'off',
      'import/extensions': 'off',
      'import/no-unresolved': 'off',
      'import/no-extraneous-dependencies': 'off',
      'import/prefer-default-export': 'off',
      'import/first': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-unused-vars': 'off',
      'no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'class-methods-use-this': 'off',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'vue/first-attribute-linebreak': 'off',
      'vue/component-name-in-template-casing': ['error', 'kebab-case'],
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/no-reserved-props': 'off',
      'vue/no-v-html': 'off',
      'vue-scoped-css/enforce-style-type': ['error', { allows: ['scoped'] }],
    },
  },
);
