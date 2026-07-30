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
		ignores: ['**/coverage/**', '**/dist/**', '**/node_modules/**'],
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
		files: ['packages/*/tests/**/*.test.ts', 'tests/e2e/**/*.e2e.test.ts'],
		languageOptions: {
			parserOptions: {
				// Runtime tests are excluded from publishable package projects.
				project: './tests/tsconfig.json',
				projectService: false,
				tsconfigRootDir: configDirectory,
			},
		},
	},
)
