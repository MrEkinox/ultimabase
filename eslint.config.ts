import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import tseslint from 'typescript-eslint'

import { createFileLineBudgetRule } from './tooling/eslint/file-line-budget.js'

const configDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryFileLineBudget = createFileLineBudgetRule({
	productionMaximum: 600,
	repositoryRoot: configDirectory,
	testMaximum: 700,
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
			// Deliberate type errors (ADR-0297 typo cases) and generated benchmark projects.
			'examples/schema-form-d/src/typos.ts',
			'examples/schema-form-d/gen/**',
		],
	},
	{
		...tseslint.configs.disableTypeChecked,
		// Native JavaScript fixtures still receive syntax and recommended linting.
		files: ['**/*.cjs', '**/*.js', '**/*.mjs'],
	},
	{
		// Yarn loads its constraints file as CommonJS.
		files: ['yarn.config.cjs'],
		languageOptions: {
			globals: { module: 'writable' },
			sourceType: 'commonjs',
		},
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
			// `await using t = ...` is used by its disposal at the end of scope.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ ignoreUsingDeclarations: true },
			],
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
			'packages/*/src/**/*.test-support.ts',
			// Package test helpers share the same strict project as executable tests.
			'packages/*/tests/**/*.ts',
			'tests/e2e/**/*.ts',
			'tests/fixtures/**/*.ts',
			'tooling/architecture/**/*.ts',
			'tooling/ci/**/*.ts',
			'tooling/vitest/**/*.test.ts',
			'tooling/documentation/**/*.ts',
			'tooling/eslint/**/*.test.ts',
			'tooling/vitest/database-filter-operators.ts',
			'tooling/vitest/optional-product-public-api.ts',
			'tooling/vitest/http-plugin-public-api.ts',
			'tooling/vitest/auth-public-api.ts',
			'tooling/vitest/prepared-mutation-adapter.ts',
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
	},
	{
		// Keep advisory warnings aligned with the hard rule's test classification.
		files: [
			'**/{test,tests}/**/*.{ts,tsx}',
			'**/*.test.ts',
			'**/*.test-d.ts',
			'tooling/vitest/typescript-language-service.ts',
		],
		rules: {
			'max-lines': ['warn', { max: 600 }],
		},
	},
)
