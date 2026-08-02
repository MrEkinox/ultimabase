import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import tseslint from 'typescript-eslint'

const configDirectory = dirname(fileURLToPath(import.meta.url))

export default defineConfig(
	eslint.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	{
		// Generated artifacts must never influence repository lint results.
		ignores: [
			'**/coverage/**',
			'**/dist/**',
			'**/node_modules/**',
			'**/*.generated.ts',
		],
	},
	{
		files: ['**/*.ts'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: configDirectory,
			},
		},
		rules: {
			'@typescript-eslint/consistent-type-exports': 'error',
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/no-unnecessary-condition': 'error',
			'@typescript-eslint/prefer-readonly': 'error',
		},
	},
	{
		files: [
			'packages/*/src/**/*.test.ts',
			'packages/*/src/**/*.test-d.ts',
			// Package test helpers share the same strict project as executable tests.
			'packages/*/tests/**/*.ts',
			'tests/e2e/**/*.ts',
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
)
