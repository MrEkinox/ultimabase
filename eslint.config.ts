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
		...tseslint.configs.disableTypeChecked,
		files: ['**/*.cjs', '**/*.js', '**/*.mjs'],
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
			'max-lines': ['error', { max: 400 }],
		},
	},
)
