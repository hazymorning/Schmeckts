/* Lint rules for the app's modules and the pure-module tests. Run from the repository root (scripts/lint.sh),
   which is why the patterns start there; the packages live in app/ next to this file. The app ships without
   a build step, so this config reports problems and does not rewrite files. */
import js from '@eslint/js';
import globals from 'globals';

const rules = {
  ...js.configs.recommended.rules,
  'no-unused-vars': 'error',
  'no-empty': 'error',
  eqeqeq: ['error', 'smart'],
  'prefer-const': 'error',
  'no-shadow': 'error',
};

export default [
  {ignores: ['app/android/', 'app/node_modules/', 'dist/']},
  {
    files: ['app/www/js/**/*.js'],
    languageOptions: {ecmaVersion: 2024, sourceType: 'module', globals: globals.browser},
    linterOptions: {reportUnusedDisableDirectives: 'error'},
    rules,
  },
  {
    files: ['tests/**/*.test.js'],
    languageOptions: {ecmaVersion: 2024, sourceType: 'module', globals: {...globals.node, ...globals.nodeBuiltin}},
    linterOptions: {reportUnusedDisableDirectives: 'error'},
    rules,
  },
];
