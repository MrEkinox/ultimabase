import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import tseslint from 'typescript-eslint'

import {
	createFileLineBudgetRule,
	handwrittenFileLineBaseline,
} from './tooling/eslint/file-line-budget.js'

const configDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryFileLineBudget = createFileLineBudgetRule({
	baseline: handwrittenFileLineBaseline,
	productionMaximum: 600,
	repositoryRoot: configDirectory,
	testMaximum: 750,
})

export default defineConfig(
	eslint.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	{
		// Generated artifacts must never influence repository lint results.
		ignores: [
			'**/.next/**',
			'**/.source/**',
			'**/next-env.d.ts',
			'**/coverage/**',
			'**/dist/**',
			'**/node_modules/**',
			'**/*.generated.d.ts',
			'**/*.generated.ts',
		],
	},
	{
		...tseslint.configs.disableTypeChecked,
		// Native JavaScript fixtures still receive syntax and recommended linting.
		files: ['**/*.cjs', '**/*.js', '**/*.mjs'],
	},
	{
		files: ['**/*.{ts,tsx}'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: configDirectory,
			},
		},
		plugins: {
			repository: {
				rules: { 'file-line-budget': repositoryFileLineBudget },
			},
		},
		rules: {
			'@typescript-eslint/consistent-type-exports': 'error',
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/no-unnecessary-condition': 'error',
			'@typescript-eslint/prefer-readonly': 'error',
			'max-lines': ['warn', { max: 400 }],
			'repository/file-line-budget': 'error',
		},
	},
	{
		files: [
			'packages/*/src/**/*.test.ts',
			'packages/*/src/**/*.test-d.ts',
			// Package test helpers share the same strict project as executable tests.
			'packages/*/tests/**/*.ts',
			'tests/e2e/**/*.ts',
			'tooling/documentation/**/*.test.ts',
			'tooling/prototypes/generated-schema-authoring/**/*.ts',
			'tooling/eslint/**/*.test.ts',
			'tooling/issues/**/*.ts',
			'tooling/vitest/optional-product-public-api.ts',
			'tooling/vitest/typescript-language-service.ts',
		],
		languageOptions: {
			parserOptions: {
				// Tests share strict compiler options without entering publishable projects.
				project: './tooling/tsconfig/test.json',
				projectService: false,
				tsconfigRootDir: configDirectory,
			},
		},
		rules: {
			'max-lines': ['warn', { max: 600 }],
		},
	},
)
