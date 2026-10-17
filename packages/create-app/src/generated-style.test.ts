import eslintJs from '@eslint/js'
import { ESLint } from 'eslint'
import * as prettier from 'prettier'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'

import { generatedPlans, renderPlan } from './generated-plans.test-support.js'

// ADR-0327 decision 9: generated projects are already formatted and lint
// clean. The generated style is Prettier's with single quotes and no
// semicolons; the lint rules are the recommended ones of ESLint and
// typescript-eslint, without type information.
const prettierOptions: prettier.Options = { semi: false, singleQuote: true }

const linter = new ESLint({
	cwd: '/project',
	overrideConfigFile: true,
	overrideConfig: [
		eslintJs.configs.recommended,
		...tseslint.configs.recommended,
		{
			languageOptions: {
				globals: { console: 'readonly', process: 'readonly' },
			},
		},
	],
})

const formatted = /\.(?:ts|js|json|md|yaml)$/u
const linted = /\.(?:ts|js)$/u

describe.each(generatedPlans)('generated project %j', (input) => {
	const files = [...renderPlan(input)]

	it('is formatted by Prettier', async () => {
		for (const [name, contents] of files.filter(([file]) =>
			formatted.test(file),
		)) {
			const output = await prettier.format(contents, {
				...prettierOptions,
				filepath: name,
			})
			expect(contents, name).toBe(output)
		}
	})

	it('passes ESLint', async () => {
		for (const [name, contents] of files.filter(([file]) =>
			linted.test(file),
		)) {
			const [result] = await linter.lintText(contents, {
				filePath: `/project/${name}`,
			})
			expect(
				result?.messages.map(
					({ line, message, ruleId }) =>
						`${String(line)} ${ruleId ?? ''} ${message}`,
				),
				name,
			).toStrictEqual([])
		}
	})
})
