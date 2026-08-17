// Flat ESLint config (ESLint 9) for the CRM Khirby monorepo.
// One config at the root covers apps/*, packages/*, plugins/*.
// Intentionally pragmatic: this is the FIRST time the repo is linted, so the
// rule set is kept lean (error-prevention over style) and a few rules are
// relaxed to match documented conventions (see AGENTS.md — e.g. `as any` for
// Drizzle 0.40). Tighten over time; do not bulk-disable to hide real bugs.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import globals from 'globals';

export default tseslint.config(
  // ---- Ignores (flat config replaces .eslintignore) ----
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.vite/**',
      'drizzle/**',
      '**/*.config.{js,cjs,mjs,ts}',
      'docker/**',
      'scripts/**',
      // Agent worktrees are separate checkouts of this repo — linting them here
      // double-reports and fails the gate on their in-progress state.
      '.claude/worktrees/**',
    ],
  },

  // ---- Base JS + TypeScript (non-type-checked: fast, low false-positive) ----
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ---- Vue SFCs ----
  ...vue.configs['flat/essential'],

  // ---- Repo-wide rule tuning ----
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Drizzle 0.40 requires `as any` on .values()/.set() (AGENTS.md).
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow intentionally-unused args/vars when prefixed with `_`.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // ---- Vue <script setup lang="ts"> needs the TS parser for the script block ----
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },

  // ---- Workflow scripts run inside the Claude Code Workflow runtime, which
  // injects orchestration globals (see the Workflow tool contract) ----
  {
    files: ['.claude/workflows/**/*.js'],
    languageOptions: {
      globals: {
        agent: 'readonly',
        parallel: 'readonly',
        pipeline: 'readonly',
        workflow: 'readonly',
        phase: 'readonly',
        log: 'readonly',
        args: 'readonly',
        budget: 'readonly',
      },
    },
  },

  // ---- Test files: relax a few rules ----
  {
    files: ['**/*.spec.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
