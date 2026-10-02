// run from the repository root by scripts/lint.sh, hence the paths
import js from '@eslint/js';
import globals from 'globals';

const rules = {
  ...js.configs.recommended.rules,
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
    files: ['tests/**/*.test.js', 'tests/notes.js'],
    languageOptions: {ecmaVersion: 2024, sourceType: 'module', globals: globals.node},
    linterOptions: {reportUnusedDisableDirectives: 'error'},
    rules,
  },
];
